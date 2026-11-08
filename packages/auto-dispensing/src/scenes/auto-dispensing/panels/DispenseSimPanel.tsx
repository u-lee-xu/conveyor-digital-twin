import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useDispensingStore, type MagazineId } from '../../../stores/useDispensingStore';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
  ENCODER_DINT, PULSE_LENGTH_MM,
} from '../constants';
import {
  DINT_ADDRESS_ROWS, ENCODER_REGISTER_INFO, pointAddressRow,
  MANUAL_INPUT_POINTS, inputPointLevel,
} from '../manualIo';
import {
  CABINET_BUTTON_IO, SIM_COMMAND_KEYS, SIM_COMMAND_LABELS, SIM_COMMAND_COLORS,
  SIM_SENSOR_VAR_NAMES, SIM_OUTPUT_POINTS, SIM_OUTPUT_ACTION_LABELS,
  SIM_SELECTOR_POINTS, SELECTOR_IO, simSelectorRows, selectorIo,
  SIM_READ_VAR_NAMES, simCommandPoint, simPointRows, motorInterlockPartner,
  type CabinetButtonKey,
} from '../simulationIo';
import { AddressHint } from './AddressHint';
import { ReadoutNum, DIRECTION_BADGE_WIDE_CLS } from './ReadoutNum';
import type { ProtocolType } from '../../../services/plc-websocket';
import { plcService } from '../../../services/plc-websocket';
import { writeSimPlcVar, writeSimPlcVars } from '../../../services/simulationPlc';

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
 *  - 原点、终点、空仓、磁性开关 → 孪生状态写回 PLC 输入点，LED 按回读显示
 *  - 前进/后退、送药缸、翻转缸、三色灯 → 可直接置位/复位 PLC 输出线圈，
 *    3D 模型按 readVars 回读联动；电机正反转带互锁。
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
        // 24 输入 + 10 输出全部回读；协议自带变量表并入，保证三协议都不漏点
        const protoVars = getReadVars(protocolRef.current);
        const names = Array.from(new Set([...SIM_READ_VAR_NAMES, ...Object.keys(protoVars)]));
        const res = await plcService.readVars(names);
        if (!res.success || !res.values) return;

        // 上电同步：两位选择开关是物理输入元件，连接后必须把本地旋钮档位
        // 写成一真一假的两路互锁输入，避免虚拟 PLC 里两档同时断开、与 3D 旋钮不一致。
        // 之后只由拨档事件写，不在这里每轮覆盖（PLC 侧可单独对线）。
        if (!selectorSyncedRef.current) {
          selectorSyncedRef.current = true;
          const initial = selectorIo(useDispensingStore.getState().selectorAuto);
          await writeSimPlcVars(initial.names, initial.values);
        }

        const v = res.values;
        const signals: Record<string, boolean> = { ...v };
        // 值未变化时跳过 setState，避免每轮轮询触发面板重渲染
        const prev = prevSignalsRef.current;
        const unchanged = prev !== null && SIM_READ_VAR_NAMES.every((k) => prev[k] === signals[k]);
        if (!unchanged) setIoSignals(signals);
        prevSignalsRef.current = signals;

        // ===== PLC → 模型：10 个输出线圈驱动 3D 执行件 =====
        const store = useDispensingStore.getState();
        store.setMotor(!!v['MOTOR_FWD'], !!v['MOTOR_REV']);
        MAG.forEach((mag) => {
          const on = !!v[`CYL_SEND_${mag}`];
          if (store.sendCyl[mag].extended !== on) store.setSendCyl(mag, on, on ? 1 : 0);
        });
        const tiltOn = !!v['CYL_TILT'];
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

  /* ---- 输出点：直接置位 / 复位 PLC 输出线圈 ---- */
  const toggleOutput = useCallback((key: string) => {
    if (!connected) return;
    const next = !ioSignals[key];
    const partner = motorInterlockPartner(key);
    if (partner && next) {
      // 正反转互锁：置位一方必须同时复位另一方
      void writeSimPlcVars([key, partner], [true, false]);
    } else {
      void writeSimPlcVar(key, next);
    }
  }, [connected, ioSignals]);

  const encoderPulses = useDispensingStore((s) => s.encoderPulses);
  const encoderDir = useDispensingStore((s) => s.encoderDir);
  const selectorAuto = useDispensingStore((s) => s.selectorAuto);

  /** 拨动两位选择开关：本地 3D 旋钮立即跟随，仿真模式一帧写两个互锁输入线圈 */
  const selectSelector = useCallback((auto: boolean) => {
    useDispensingStore.getState().setSelectorAuto(auto);
    if (!connected) return;
    const io = selectorIo(auto);
    void writeSimPlcVars(io.names, io.values);
  }, [connected]);

  return (
    <div className="space-y-2">
      {/* ===== 自复位控制按钮：每个都绑定一个 PLC 输入点 ===== */}
      <div className="card">
        <div className="section-title !mb-2">主令控制（自复位 · 写 PLC 输入）</div>
        {!connected && (
          <div className="text-[0.55rem] text-amber-400 mb-1.5">
            未连接 PLC：按键不会写入任何地址，请先在上方连接仿真 PLC。
          </div>
        )}
        {/* 三列两行与 3D 按钮箱「上排 3 + 下排 2」一致；名称/颜色/顺序全部由
            CABINET_BUTTONS 派生，AddressHint 默认虚线下划线与手动模式观感相同。 */}
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

      {/* ===== 手动 / 自动 两位选择开关：两个互锁的 PLC 输入点 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">手动 / 自动 选择开关（写 PLC 输入）</div>
        <div className="text-[0.5rem] text-slate-500 mb-1 leading-relaxed">
          两档互锁，与 3D 控制柜旋钮联动；拨动后对应输入线圈点亮，悬停档位查看三菱 / Modbus / S7 地址。
          未连接 PLC 时只切换本地旋钮，不写任何地址。
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SIM_SELECTOR_POINTS.map((p) => {
            const auto = p.key === SELECTOR_IO.auto;
            const on = connected ? !!ioSignals[p.key] : (auto ? selectorAuto : !selectorAuto);
            return (
              <AddressHint key={p.key} title={p.label} rows={simSelectorRows()}
                className="block min-w-0">
                <button
                  className={`btn btn-xs w-full touch-manipulation ${on ? 'btn-success' : 'btn-outline'}`}
                  onClick={() => selectSelector(auto)}
                  aria-label={`${p.label}选择开关`}
                  style={{ fontSize: '0.6rem' }}
                >
                  {auto ? '⚙ 自动' : '✋ 手动'} {on ? '● 接通' : '○ 断开'}
                </button>
              </AddressHint>
            );
          })}
        </div>
      </div>

      {/* ===== 输出点操作：前进 / 后退 / 气缸 / 灯，直接绑定 PLC 输出线圈 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">输出点直接置位（写 PLC 输出）</div>
        <div className="text-[0.5rem] text-slate-500 mb-1">
          点一次置位、再点一次复位；按钮与 3D 执行件状态均由 PLC 回读。前进/后退为电机正/反转，带互锁。
          悬停按钮查看三菱 Y / Modbus 线圈 / S7 地址。
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {SIM_OUTPUT_POINTS.map((p) => (
            <AddressHint key={p.key} title={p.label} rows={simPointRows(p)}
              className="block min-w-0">
              <button
                className={`btn btn-xs w-full touch-manipulation ${ioSignals[p.key] ? 'btn-success' : 'btn-outline'}`}
                onClick={() => toggleOutput(p.key)}
                aria-label={`${p.label}输出点`}
                style={{ fontSize: '0.58rem' }}
              >
                {SIM_OUTPUT_ACTION_LABELS[p.key]}
              </button>
            </AddressHint>
          ))}
        </div>
      </div>

      {/* ===== 32 位 DINT 位置数据寄存器 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">位置数据寄存器（32 位 DINT）</div>
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
        <div className="text-[0.55rem] text-slate-500 leading-relaxed">
          32 位有符号整数，低字在前，一次原子写；随滑台前进递增、后退递减，回到原点传感器（Z 相）归零。
          寄存器地址悬停上方数值查看，完整映射见「使用说明」。
          编码器独立装在 +X 丝杆末端，A/B 相接线与高速计数器 C0 由 PLC 程序处理，孪生不占用输入点；
          电机为普通正反转布尔控制，非伺服、无速度给定。
        </div>
      </div>

      {/* ===== IO 信号 LED：全部取 PLC 回读 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">IO 信号（PLC 回读）</div>
        <div className="space-y-1.5">
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">
              输入点 24（主令/选择开关由控件写入 · 传感器由孪生写回 PLC）
            </div>
            <div className="grid grid-cols-3 gap-x-1">
              {MANUAL_INPUT_POINTS.map((p) => (
                <IOLed key={p.key} label={p.label} active={!!ioSignals[p.key]} addrKey={p.key} />
              ))}
            </div>
          </div>

          <div className="divider !my-0" />

          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">
              输出点 10（PLC → 孪生 · 可由上方按钮直接置位）
            </div>
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
