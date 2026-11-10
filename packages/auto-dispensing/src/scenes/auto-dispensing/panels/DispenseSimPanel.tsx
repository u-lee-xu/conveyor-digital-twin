import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useDispensingStore, type MagazineId } from '../../../stores/useDispensingStore';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
  ENCODER_DINT, PULSE_LENGTH_MM,
} from '../constants';
import {
  DINT_ADDRESS_ROWS, ENCODER_REGISTER_INFO, pointAddressRow,
  MANUAL_INPUT_POINTS, SOLENOID_OUTPUT_POINTS, inputPointLevel,
} from '../manualIo';
import {
  SOLENOID_TYPES, SOLENOID_TYPE_LABELS, SOLENOID_DEFAULT,
  resolveCylinderLevels, snapshotSolenoidCoils, solenoidConflicts,
  readCylinderLevels, type CoilLevels,
} from '../solenoid';
import {
  CABINET_BUTTON_IO, SIM_COMMAND_KEYS, SIM_COMMAND_LABELS, SIM_COMMAND_COLORS,
  SIM_SENSOR_VAR_NAMES, SIM_OUTPUT_POINTS,
  SELECTOR_IO, simSelectorRows,
  SIM_READ_VAR_NAMES, simCommandPoint, simPointRows,
  type CabinetButtonKey,
} from '../simulationIo';
import { AddressHint } from './AddressHint';
import { ReadoutNum, DIRECTION_BADGE_WIDE_CLS } from './ReadoutNum';
import type { ProtocolType } from '../../../services/plc-websocket';
import { plcService } from '../../../services/plc-websocket';
import { writeSimPlcVar, writeSimSelector } from '../../../services/simulationPlc';

/**
 * 单个 IO 信号 LED：悬停一次给出三菱 / Modbus / S7 三协议地址，
 * 不再随当前连接的协议只显示其中一个，也不把地址直接铺在面板上。
 *
 * active 一律取 PLC readVars 回读值：显示的不是本地 store 的自说自话，
 * 而是「该地址此刻真实的线圈电平」，按键写入后 LED 亮起才证明绑定生效。
 */
function IOLed({ label, active, addrKey }: { label: string; active: boolean; addrKey: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 flex-1 min-w-0" style={{ fontSize: '0.62rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <AddressHint
        title={label}
        rows={[pointAddressRow(addrKey, label)]}
        className={`truncate min-w-0 flex-1 ${active ? 'text-green-300' : 'text-slate-500'}`}
      >
        {label}
      </AddressHint>
    </div>
  );
}

function getReadVars(protocol: ProtocolType) {
  if (protocol === 'modbus') return MODBUS_READ_VARS;
  if (protocol === 's7') return S7_VARS;
  return MITSUBISHI_READ_VARS;
}

const MAG: MagazineId[] = ['A', 'B', 'C', 'D'];

/** 主令按钮配色来自 3D 按钮箱 CABINET_BUTTONS，未按下只用描边、按下才填实色 */
function commandStyle(key: CabinetButtonKey, on: boolean): CSSProperties {
  const color = SIM_COMMAND_COLORS[key];
  return on
    ? { backgroundColor: color, borderColor: color, color: '#fff' }
    : { borderColor: color, color: color };
}

/**
 * 仿真模式面板 = 一台可对线的 PLC I/O 教学台：
 *  - 主令按钮 / 3D 按钮箱 → 写 PLC 输入线圈（BUTTON_*，X0-X4 / C0-C4 / M0.x）
 *  - 手动 / 自动自锁按钮与 3D 旋钮联动，一帧写两个互锁输入线圈
 *  - 原点、终点、空仓、磁性开关 → 孪生状态写回 PLC 输入点，LED 按回读显示
 *  - PLC 输出线圈由真实 PLC 程序驱动，面板只在 IO 信号表做只读显示，
 *    3D 模型按 readVars 回读联动；单 / 双电控由 solenoid.ts 解释。
 * 所有变量名与三协议地址都由 simulationIo / manualIo 点位表派生，禁止回填地址字面量。
 */
export function DispenseSimPanel({ onShowHelp, protocol, connected, setConnected }: {
  onShowHelp: () => void;
  protocol: ProtocolType;
  connected: boolean;
  setConnected: (c: boolean) => void;
}) {
  const simRunning = useAppStore((s) => s.simRunning);
  const simEStop = useAppStore((s) => s.simEStop);
  const setSimRunning = useAppStore((s) => s.setSimRunning);
  const setSimEStop = useAppStore((s) => s.setSimEStop);

  // IO 信号实时状态（从 PLC 读取，键就是 PLC 变量名）
  const [ioSignals, setIoSignals] = useState<Record<string, boolean>>({});
  const prevSignalsRef = useRef<Record<string, boolean> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
  /** 连接建立后把物理旋钮档位同步进 PLC 一次；断开重连要重新同步 */
  const selectorSyncedRef = useRef(false);
  /** 互锁自愈限频：PLC 侧被外部清成两档同值时才重写，避免每轮占用写通道 */
  const selectorHealAtRef = useRef(0);
  /**
   * 上一轮 10 只电磁阀线圈电平，供双电控上升沿检测。
   * 每轮都更新（不区分单 / 双电控），因此从单电控切到双电控时
   * 不会把「早就为 ON」的线圈误判成一次新的上升沿。
   */
  const prevCoilsRef = useRef<CoilLevels>({});
  const protocolRef = useRef(protocol);
  protocolRef.current = protocol;
  const stopPollingRef = useRef<(() => void) | null>(null);

  /* ---- PLC 断连回调 ---- */
  useEffect(() => {
    plcService.setOnDisconnected(() => {
      setConnected(false);
      stopPollingRef.current?.();
    });
    return () => { plcService.setOnDisconnected(null); stopPollingRef.current?.(); };
  }, [setConnected]);

  /* ---- IO 轮询（双向同步） ---- */
  const startPolling = useCallback(() => {
    stopPollingRef.current?.();
    const poll = async () => {
      if (!plcService.connected || pollingRef.current) return;
      pollingRef.current = true;
      try {
        // 24 输入 + 15 输出全部回读；协议自带变量表并入，保证三协议都不漏点
        const protoVars = getReadVars(protocolRef.current);
        const names = Array.from(new Set([...SIM_READ_VAR_NAMES, ...Object.keys(protoVars)]));
        const res = await plcService.readVars(names);
        if (!res.success || !res.values) return;

        // 上电同步：两位选择开关是物理输入元件，连接后必须把本地旋钮档位
        // 写成一真一假的两路互锁输入，避免 PLC 里两档同时断开、与 3D 旋钮不一致。
        // 之后不再用回读反向覆盖本地档位：选择开关由人拨，PLC 只读不写。
        if (!selectorSyncedRef.current) {
          selectorSyncedRef.current = true;
          selectorHealAtRef.current = Date.now();
          await writeSimSelector(useDispensingStore.getState().selectorAuto);
        }

        const v = res.values;
        // 互锁自愈：PLC 侧若被外部清成「两档同值」的无效态，按本地物理旋钮
        // 档位重写一次。回读只用来校验接线与点亮 LED，绝不拿来改本地档位，
        // 否则刚点完按钮就可能被上一轮旧值拉回，表现为切换不顺畅 / 回弹。
        if (!!v[SELECTOR_IO.manual] === !!v[SELECTOR_IO.auto]
          && Date.now() - selectorHealAtRef.current > 1000) {
          selectorHealAtRef.current = Date.now();
          await writeSimSelector(useDispensingStore.getState().selectorAuto);
        }
        const signals: Record<string, boolean> = { ...v };
        // 值未变化时跳过 setState，避免每轮轮询触发面板重渲染
        const prev = prevSignalsRef.current;
        const unchanged = prev !== null && SIM_READ_VAR_NAMES.every((k) => prev[k] === signals[k]);
        if (!unchanged) setIoSignals(signals);
        prevSignalsRef.current = signals;

        // ===== PLC → 模型：电机 / 灯塔电平直连，气缸交给电磁阀语义解释 =====
        // 单电控 = 动作线圈电平跟随（失电弹簧复位）；
        // 双电控 = 10 只线圈的上升沿切换阀芯，断电后保持当前姿态。
        // 语义全部在 solenoid.ts 的纯函数里，面板只负责取电平、写 store。
        const store = useDispensingStore.getState();
        store.setMotor(!!v['MOTOR_FWD'], !!v['MOTOR_REV']);
        const levels = resolveCylinderLevels(
          store.solenoidType,
          prevCoilsRef.current,
          v,
          readCylinderLevels(store.sendCyl, store.tiltCyl),
        );
        // 每轮都刷新基准（不区分单 / 双电控），切换类型时不会产生假上升沿
        prevCoilsRef.current = snapshotSolenoidCoils(v);
        MAG.forEach((mag) => {
          const on = !!levels[mag];
          if (store.sendCyl[mag].extended !== on) store.setSendCyl(mag, on, on ? 1 : 0);
        });
        const tiltOn = !!levels.TILT;
        if (store.tiltCyl.tilted !== tiltOn) store.setTiltCyl(tiltOn, tiltOn ? 1 : 0);
        store.setLamps({ green: !!v['LAMP_GREEN'], yellow: !!v['LAMP_YELLOW'], red: !!v['LAMP_RED'] });

        // ===== PLC → 模型：主令回读，3D 按钮箱外观跟随真实线圈 =====
        SIM_COMMAND_KEYS.forEach((key) => {
          store.setButton(key, !!v[CABINET_BUTTON_IO[key]]);
        });
        if (v['BUTTON_ESTOP']) {
          setSimEStop(true);
          setSimRunning(false);
        } else if (v['BUTTON_START']) {
          setSimEStop(false);
          setSimRunning(true);
        } else if (v['BUTTON_STOP']) {
          setSimRunning(false);
        }

        // ===== 模型 → PLC：17 个传感器 / 磁性开关（主令由按钮事件写，不在这里覆盖）=====
        const s = useDispensingStore.getState();
        const snap = {
          buttons: s.buttons, sensors: s.sensors,
          encoderPulses: s.encoderPulses, selectorAuto: s.selectorAuto,
        };
        const sensorValues = SIM_SENSOR_VAR_NAMES.map((name) => inputPointLevel(name, snap));
        await plcService.writeVars([...SIM_SENSOR_VAR_NAMES], sensorValues);
        // 位置只走一个 32 位 DINT 数据寄存器：不拆线圈、不占输入点
        await plcService.writeWord('ENCODER_PULSES', s.encoderPulses);
      } catch (e) {
        console.error('[轮询] 失败:', e instanceof Error ? e.message : String(e));
      } finally {
        pollingRef.current = false;
      }
    };
    poll();
    pollRef.current = setInterval(poll, 300);
  }, [setSimEStop, setSimRunning]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    selectorSyncedRef.current = false; // 重连后重新做一次旋钮档位上电同步
    prevCoilsRef.current = {};         // 重连后重新建立上升沿基准
  }, []);

  // 保持 ref 同步
  stopPollingRef.current = stopPolling;

  // 连接成功 → 启动轮询；断开 → 停止
  useEffect(() => {
    if (connected) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [connected, startPolling, stopPolling]);

  /* ---- 主令按钮：写 PLC 输入线圈（自复位） ---- */
  const writeBtn = useCallback((key: CabinetButtonKey, value: boolean) => {
    if (!connected) return;
    // 本地即时反馈；下一轮 readVars 回读会把按钮外观对齐到 PLC 真值
    useDispensingStore.getState().setButton(key, value);
    void writeSimPlcVar(CABINET_BUTTON_IO[key], value);
  }, [connected]);

  const encoderPulses = useDispensingStore((s) => s.encoderPulses);
  const encoderDir = useDispensingStore((s) => s.encoderDir);
  const selectorAuto = useDispensingStore((s) => s.selectorAuto);
  const solenoidType = useDispensingStore((s) => s.solenoidType);
  const setSolenoidType = useDispensingStore((s) => s.setSolenoidType);
  /** 双电控禁止状态：同一气缸两只线圈同时得电，直接由 PLC 回读值派生 */
  const conflicts = solenoidType === 'double' ? solenoidConflicts(ioSignals) : [];

  /**
   * 自锁按钮与 3D 旋钮同源：一律读本地 selectorAuto，点击当帧立即翻转。
   * 旧版连接后改读 300ms 轮询回读，UI 要等一轮才变、还可能被 PLC 侧旧值拉回，
   * 而 3D 旋钮已立即跟着本地 store 变，两处不同步就是「切换不顺畅」的根因。
   * 选择开关是人工操作的物理输入，PLC 只读不写；回读仅用于 LED 校验接线。
   */
  const autoOn = selectorAuto;

  /** 点击自锁按钮：读实时 store 档位（避免连点用渲染闭包旧值），一帧写两路互锁输入 */
  const toggleSelector = useCallback(() => {
    const next = !useDispensingStore.getState().selectorAuto;
    useDispensingStore.getState().setSelectorAuto(next);
    if (!connected) return;
    void writeSimSelector(next);
  }, [connected]);

  return (
    <div className="space-y-2">
      {/* ===== 主控指令：5 个自复位主令 + 1 个手动/自动自锁按钮，共 3 列 × 2 行 ===== */}
      <div className="card">
        <div className="section-title !mb-2">主令控制</div>
        {!connected && (
          <div className="text-[0.55rem] text-amber-400 mb-1.5">
            未连接 PLC：按键不会写入任何地址，请先在上方连接仿真 PLC。
          </div>
        )}
        {/* 三列两行共 6 格：前 5 格是 3D 按钮箱的主令，名称/颜色/顺序由
            CABINET_BUTTONS 派生；第 6 格是手动 / 自动自锁按钮，与 3D 旋钮联动。
            AddressHint 默认虚线下划线与手动模式观感相同。 */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {SIM_COMMAND_KEYS.map((key) => {
            const point = simCommandPoint(key);
            return (
              <AddressHint key={key} title={point.label} rows={simPointRows(point)}
                className="block min-w-0">
                <button
                  className="btn btn-xs btn-outline w-full touch-manipulation truncate"
                  onMouseDown={() => writeBtn(key, true)}
                  onMouseUp={() => writeBtn(key, false)}
                  onMouseLeave={() => writeBtn(key, false)}
                  onTouchStart={() => writeBtn(key, true)}
                  onTouchEnd={() => writeBtn(key, false)}
                  aria-label={`${point.label}按钮`}
                  style={{ fontSize: '0.58rem', ...commandStyle(key, !!ioSignals[point.key]) }}
                >
                  {SIM_COMMAND_LABELS[key]}
                </button>
              </AddressHint>
            );
          })}
          {/* 第 6 格：自锁按钮。aria-pressed 表达「保持在某一档」，
              点击切换手动 / 自动，两档三协议地址由点位表派生。 */}
          <AddressHint title="手动 / 自动" rows={simSelectorRows()} className="block min-w-0">
            <button
              data-sim-selector=""
              aria-label="手动自动选择开关"
              aria-pressed={autoOn}
              className={`btn btn-xs w-full touch-manipulation ${autoOn ? 'btn-primary' : 'btn-outline'}`}
              onClick={toggleSelector}
              style={{ fontSize: '0.58rem' }}
            >
              {autoOn ? '⚙ 自动' : '✋ 手动'}
            </button>
          </AddressHint>
        </div>
        <div className="divider !my-1.5" />
        <div className="flex items-center gap-2">
          {simEStop ? (
            <span className="badge badge-red"><span className="badge-dot badge-dot-red" />急停中</span>
          ) : simRunning ? (
            <span className="badge badge-green"><span className="badge-dot badge-dot-green" />运行中</span>
          ) : (
            <span className="badge badge-slate"><span className="badge-dot badge-dot-slate" />待机</span>
          )}
          {simEStop && (
            <button className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.62rem' }}
              onClick={() => setSimEStop(false)}>复位</button>
          )}
          <button className="btn btn-xs btn-outline ml-auto touch-manipulation" style={{ fontSize: '0.62rem' }}
            onClick={() => useDispensingStore.getState().refillAll()}>⊕ 补满药仓</button>
          <button className="btn btn-xs btn-ghost touch-manipulation" style={{ fontSize: '0.62rem' }}
            onClick={() => useDispensingStore.getState().resetAll()}>复位全部</button>
        </div>
      </div>

      {/* ===== 电磁阀类型：单电控 / 双电控，决定孪生如何解释 10 只气缸线圈 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">电磁阀类型</div>
        <div className="grid grid-cols-2 gap-1.5">
          {SOLENOID_TYPES.map((t) => (
            <button
              key={t}
              className={`btn btn-xs w-full touch-manipulation ${solenoidType === t ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSolenoidType(t)}
              aria-label={`${SOLENOID_TYPE_LABELS[t]}电磁阀`}
              style={{ fontSize: '0.6rem' }}
            >
              {t === 'single' ? '单电控' : '双电控'} {solenoidType === t ? '● 生效' : '○ 未选'}
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-1 flex-wrap">
          <span className="badge badge-slate">
            默认 {SOLENOID_DEFAULT === 'single' ? '单电控' : '双电控'}
          </span>
          {SOLENOID_OUTPUT_POINTS.map((p) => (
            <AddressHint key={p.key} title={p.label} rows={simPointRows(p)} className="block min-w-0">
              <span className={`badge ${solenoidType === 'double' ? 'badge-blue' : 'badge-slate'}`}>
                {p.label}
              </span>
            </AddressHint>
          ))}
        </div>
        {conflicts.length > 0 && (
          <div className="mt-1 text-[0.5rem] text-red-400 leading-relaxed">
            ⚠ 禁止状态：{conflicts.join('、')} 两只线圈同时得电，阀芯保持原姿态。
          </div>
        )}
      </div>

      {/* 输出点不再单独设「直接置位」栏：PLC 输出线圈由真实 PLC 程序驱动，
          面板只在最后的 IO 信号表里做只读显示，避免同一信号在两处重复。 */}

      {/* ===== 32 位 DINT 位置数据寄存器：只显示数值与方向 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">位置数据寄存器</div>
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <AddressHint
            title="位置寄存器"
            rows={DINT_ADDRESS_ROWS}
            note={ENCODER_REGISTER_INFO.address}
            underline={false}
          >
            <span className="badge badge-blue">DINT = <ReadoutNum value={encoderPulses} digits={5} /> 脉冲</span>
          </AddressHint>
          <span className="badge badge-slate">{ENCODER_DINT.TYPE} · 低字在前</span>
          <span className="badge badge-slate">{PULSE_LENGTH_MM.toFixed(4)} mm / 脉冲</span>
          <span className={`${DIRECTION_BADGE_WIDE_CLS} ${encoderDir > 0 ? 'badge-green' : encoderDir < 0 ? 'badge-yellow' : 'badge-slate'}`}>
            {encoderDir > 0 ? '↑ 前进 +' : encoderDir < 0 ? '↓ 后退 −' : '静止'}
          </span>
        </div>
      </div>

      {/* ===== IO 信号 LED：全部取 PLC 回读，输出点只显示不置位 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">IO 信号</div>
        <div className="space-y-1.5">
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输入点 24</div>
            <div className="grid grid-cols-3 gap-x-1">
              {MANUAL_INPUT_POINTS.map((p) => (
                <IOLed key={p.key} label={p.label} active={!!ioSignals[p.key]} addrKey={p.key} />
              ))}
            </div>
          </div>

          <div className="divider !my-0" />

          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出点 15</div>
            <div className="grid grid-cols-3 gap-x-1">
              {SIM_OUTPUT_POINTS.map((p) => (
                <IOLed key={p.key} label={p.label} active={!!ioSignals[p.key]} addrKey={p.key} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 帮助链接 ===== */}
      <button
        className="btn btn-xs btn-ghost w-full touch-manipulation"
        style={{ fontSize: '0.62rem' }}
        onClick={onShowHelp}
      >
        使用说明 & IO地址分配
      </button>
    </div>
  );
}

export default DispenseSimPanel;
