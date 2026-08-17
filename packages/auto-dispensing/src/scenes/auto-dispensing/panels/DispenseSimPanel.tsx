import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useDispensingStore, type MagazineId } from '../../../stores/useDispensingStore';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
  SLIDER_MIN_X, PULSES_PER_M,
} from '../constants';
import type { ProtocolType } from '../../../services/plc-websocket';
import { plcService } from '../../../services/plc-websocket';

/** 单个IO信号LED指示灯 */
function IOLed({ label, active, addr }: { label: string; active: boolean; addr: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 flex-1 min-w-0" title={addr} style={{ fontSize: '0.62rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <span className={`truncate ${active ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

function getReadVars(protocol: ProtocolType) {
  if (protocol === 'modbus') return MODBUS_READ_VARS;
  if (protocol === 's7') return S7_VARS;
  return MITSUBISHI_READ_VARS;
}

const MAG: MagazineId[] = ['A', 'B', 'C'];

/** 编码器 8 位二进制写入 PLC（0.01m = 1 脉冲） */
function encoderBits(x: number): boolean[] {
  const pulses = Math.max(0, Math.round((x - SLIDER_MIN_X) * PULSES_PER_M));
  const bits: boolean[] = [];
  for (let i = 0; i < 8; i++) bits.push(((pulses >> i) & 1) === 1);
  return bits;
}

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

  // IO 信号实时状态（从 PLC 读取）
  const [ioSignals, setIoSignals] = useState<Record<string, boolean>>({});
  const prevSignalsRef = useRef<Record<string, boolean> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
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
        const proto = protocolRef.current;
        const readVars = getReadVars(proto);
        const res = await plcService.readVars(Object.keys(readVars));
        if (!res.success || !res.values) return;

        const v = res.values;
        const signals: Record<string, boolean> = {
          start: !!v['BUTTON_START'], stop: !!v['BUTTON_STOP'],
          reset: !!v['BUTTON_RESET'], estop: !!v['BUTTON_ESTOP'],
          confirm: !!v['BUTTON_CONFIRM'],
          motorFwd: !!v['MOTOR_FWD'], motorRev: !!v['MOTOR_REV'],
          cylA: !!v['CYL_SEND_A'], cylB: !!v['CYL_SEND_B'], cylC: !!v['CYL_SEND_C'],
          tilt: !!v['CYL_TILT'],
          lampGreen: !!v['LAMP_GREEN'], lampYellow: !!v['LAMP_YELLOW'], lampRed: !!v['LAMP_RED'],
        };
        // 值未变化时跳过 setState，避免每轮轮询触发面板重渲染
        const prev = prevSignalsRef.current;
        const unchanged = prev !== null && Object.keys(signals).every((k) => prev[k] === signals[k]);
        if (!unchanged) setIoSignals(signals);
        prevSignalsRef.current = signals;

        // ===== PLC → 模型 =====
        const store = useDispensingStore.getState();
        store.setMotor(!!signals.motorFwd, !!signals.motorRev);
        MAG.forEach((mag) => {
          const on = !!signals[`cyl${mag}`];
          if (store.sendCyl[mag].extended !== on) store.setSendCyl(mag, on, on ? 1 : 0);
        });
        const tiltOn = !!signals.tilt;
        if (store.tiltCyl.tilted !== tiltOn) store.setTiltCyl(tiltOn, tiltOn ? 1 : 0);
        store.setLamps({ green: !!signals.lampGreen, yellow: !!signals.lampYellow, red: !!signals.lampRed });

        // 主令状态（写入孪生按钮，供 3D 按钮外观）
        store.setButton('start', !!signals.start);
        store.setButton('stop', !!signals.stop);
        store.setButton('reset', !!signals.reset);
        store.setButton('estop', !!signals.estop);
        store.setButton('confirm', !!signals.confirm);

        if (signals.estop) {
          setSimEStop(true);
          setSimRunning(false);
        } else if (signals.start) {
          setSimEStop(false);
          setSimRunning(true);
        } else if (signals.stop) {
          setSimRunning(false);
        }

        // ===== 模型 → PLC：传感器 + 磁性开关 + 编码器 =====
        const s = useDispensingStore.getState();
        const writeNames: string[] = [];
        const writeValues: boolean[] = [];
        const push = (name: string, val: boolean) => { writeNames.push(name); writeValues.push(val); };
        push('S_LIMIT_START', s.sensors.limitStart);
        push('S_LIMIT_END', s.sensors.limitEnd);
        MAG.forEach((mag) => push(`S_MAG_${mag}_EMPTY`, s.sensors.magEmpty[mag]));
        push('S_BIN_HAS_DRUG', s.sensors.binHasDrug);
        MAG.forEach((mag) => { push(`MSC_${mag}_BACK`, s.sensors.mscBack[mag]); push(`MSC_${mag}_FRONT`, s.sensors.mscFront[mag]); });
        push('MSC_TILT_HOLD', s.sensors.mscTiltHold);
        push('MSC_TILT_DUMP', s.sensors.mscTiltDump);
        const bits = encoderBits(s.sliderX);
        for (let i = 0; i < 8; i++) push(`ENCODER_BIT${i}`, bits[i]);
        await plcService.writeVars(writeNames, writeValues);
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

  /* ---- 自复位按钮：写入 PLC ---- */
  const writeBtn = useCallback(async (key: 'start' | 'stop' | 'estop' | 'reset' | 'confirm', value: boolean) => {
    if (!connected) return;
    const varMap = { start: 'BUTTON_START', stop: 'BUTTON_STOP', estop: 'BUTTON_ESTOP', reset: 'BUTTON_RESET', confirm: 'BUTTON_CONFIRM' };
    try { await plcService.writeVar(varMap[key], value); } catch { /* 写入失败由轮询状态反馈 */ }
  }, [connected]);

  const getAddr = (key: string) => {
    const map = getReadVars(protocol);
    if (protocol === 'modbus') return `Coil ${map[key as keyof typeof map]}`;
    return map[key as keyof typeof map] as string;
  };

  const sensors = useDispensingStore((s) => s.sensors);
  const sliderX = useDispensingStore((s) => s.sliderX);
  const encoder = Math.round((sliderX - SLIDER_MIN_X) * PULSES_PER_M);

  return (
    <div className="space-y-2">
      {/* ===== 自复位控制按钮 ===== */}
      <div className="card">
        <div className="section-title !mb-2">主令控制（自复位）</div>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          <button
            className="btn btn-xs btn-success touch-manipulation"
            onMouseDown={() => writeBtn('start', true)}
            onMouseUp={() => writeBtn('start', false)}
            onMouseLeave={() => writeBtn('start', false)}
            onTouchStart={() => writeBtn('start', true)}
            onTouchEnd={() => writeBtn('start', false)}
            aria-label="启动按钮"
            style={{ fontSize: '0.58rem' }}
          >
            ▶启动
          </button>
          <button
            className="btn btn-xs btn-warning touch-manipulation"
            onMouseDown={() => writeBtn('stop', true)}
            onMouseUp={() => writeBtn('stop', false)}
            onMouseLeave={() => writeBtn('stop', false)}
            onTouchStart={() => writeBtn('stop', true)}
            onTouchEnd={() => writeBtn('stop', false)}
            aria-label="停止按钮"
            style={{ fontSize: '0.58rem' }}
          >
            ■停止
          </button>
          <button
            className="btn btn-xs btn-danger touch-manipulation"
            onMouseDown={() => writeBtn('estop', true)}
            onMouseUp={() => writeBtn('estop', false)}
            onMouseLeave={() => writeBtn('estop', false)}
            onTouchStart={() => writeBtn('estop', true)}
            onTouchEnd={() => writeBtn('estop', false)}
            aria-label="急停按钮"
            style={{ fontSize: '0.58rem' }}
          >
            ⚠急停
          </button>
          <button
            className="btn btn-xs btn-outline touch-manipulation"
            onMouseDown={() => writeBtn('reset', true)}
            onMouseUp={() => writeBtn('reset', false)}
            onMouseLeave={() => writeBtn('reset', false)}
            onTouchStart={() => writeBtn('reset', true)}
            onTouchEnd={() => writeBtn('reset', false)}
            aria-label="复位按钮"
            style={{ fontSize: '0.58rem' }}
          >
            ↺复位
          </button>
          <button
            className="btn btn-xs btn-blue touch-manipulation"
            onMouseDown={() => writeBtn('confirm', true)}
            onMouseUp={() => writeBtn('confirm', false)}
            onMouseLeave={() => writeBtn('confirm', false)}
            onTouchStart={() => writeBtn('confirm', true)}
            onTouchEnd={() => writeBtn('confirm', false)}
            aria-label="取药确认按钮"
            style={{ fontSize: '0.58rem' }}
          >
            ✓确认
          </button>
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
          <button className="btn btn-xs btn-ghost ml-auto touch-manipulation" style={{ fontSize: '0.62rem' }}
            onClick={() => useDispensingStore.getState().resetAll()}>复位全部</button>
        </div>
      </div>

      {/* ===== IO 信号 LED 显示 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">IO 信号</div>
        <div className="space-y-1.5">
          {/* 输入信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输入信号（孪生 → PLC）</div>
            <div className="grid grid-cols-3 gap-x-1">
              <IOLed label="起点限位" active={sensors.limitStart} addr={getAddr('S_LIMIT_START')} />
              <IOLed label="终点限位" active={sensors.limitEnd} addr={getAddr('S_LIMIT_END')} />
              <IOLed label="A空仓" active={sensors.magEmpty.A} addr={getAddr('S_MAG_A_EMPTY')} />
              <IOLed label="B空仓" active={sensors.magEmpty.B} addr={getAddr('S_MAG_B_EMPTY')} />
              <IOLed label="C空仓" active={sensors.magEmpty.C} addr={getAddr('S_MAG_C_EMPTY')} />
              <IOLed label="取药仓有药" active={sensors.binHasDrug} addr={getAddr('S_BIN_HAS_DRUG')} />
              <IOLed label="A缸后" active={sensors.mscBack.A} addr={getAddr('MSC_A_BACK')} />
              <IOLed label="A缸前" active={sensors.mscFront.A} addr={getAddr('MSC_A_FRONT')} />
              <IOLed label="B缸后" active={sensors.mscBack.B} addr={getAddr('MSC_B_BACK')} />
              <IOLed label="B缸前" active={sensors.mscFront.B} addr={getAddr('MSC_B_FRONT')} />
              <IOLed label="C缸后" active={sensors.mscBack.C} addr={getAddr('MSC_C_BACK')} />
              <IOLed label="C缸前" active={sensors.mscFront.C} addr={getAddr('MSC_C_FRONT')} />
              <IOLed label="翻转盛药位" active={sensors.mscTiltHold} addr={getAddr('MSC_TILT_HOLD')} />
              <IOLed label="翻转倒药位" active={sensors.mscTiltDump} addr={getAddr('MSC_TILT_DUMP')} />
              <IOLed label={`编码器 ${encoder}`} active={encoder > 0} addr="8位二进制 ENCODER_BIT0-7" />
            </div>
          </div>

          <div className="divider !my-0" />

          {/* 输出信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出信号（PLC → 孪生）</div>
            <div className="grid grid-cols-3 gap-x-1">
              <IOLed label="电机正转" active={!!ioSignals.motorFwd} addr={getAddr('MOTOR_FWD')} />
              <IOLed label="电机反转" active={!!ioSignals.motorRev} addr={getAddr('MOTOR_REV')} />
              <IOLed label="A送药缸" active={!!ioSignals.cylA} addr={getAddr('CYL_SEND_A')} />
              <IOLed label="B送药缸" active={!!ioSignals.cylB} addr={getAddr('CYL_SEND_B')} />
              <IOLed label="C送药缸" active={!!ioSignals.cylC} addr={getAddr('CYL_SEND_C')} />
              <IOLed label="翻转缸" active={!!ioSignals.tilt} addr={getAddr('CYL_TILT')} />
              <IOLed label="灯塔绿" active={!!ioSignals.lampGreen} addr={getAddr('LAMP_GREEN')} />
              <IOLed label="灯塔黄" active={!!ioSignals.lampYellow} addr={getAddr('LAMP_YELLOW')} />
              <IOLed label="灯塔红" active={!!ioSignals.lampRed} addr={getAddr('LAMP_RED')} />
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