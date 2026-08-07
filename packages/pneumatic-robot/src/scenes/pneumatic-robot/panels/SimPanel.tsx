import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useRobotStore } from '../useRobotStore';
import {
  ADDRESS, MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
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

/** 灯塔指示灯（大号卡片式） */
function IndicatorLight({ label, active, color, addr }: { label: string; active: boolean; color: string; addr: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-1.5 rounded"
      title={addr}
      style={{
        backgroundColor: active ? `${color}20` : '#1e293b',
        border: `1px solid ${active ? color : '#334155'}`,
      }}
    >
      <span
        className="rounded-full"
        style={{
          width: '0.65rem',
          height: '0.65rem',
          backgroundColor: active ? color : '#475569',
          boxShadow: active ? `0 0 8px ${color}` : 'none',
        }}
      />
      <span
        style={{ fontSize: '0.55rem', color: active ? color : '#64748b', fontWeight: 500 }}
      >
        {label}
      </span>
    </div>
  );
}

function getReadVars(protocol: ProtocolType) {
  if (protocol === 'modbus') return MODBUS_READ_VARS;
  if (protocol === 's7') return S7_VARS;
  return MITSUBISHI_READ_VARS;
}

export function SimPanel({ onShowHelp, protocol, connected, setConnected }: {
  onShowHelp: () => void;
  protocol: ProtocolType;
  connected: boolean;
  setConnected: (c: boolean) => void;
}) {
  const simRunning = useAppStore((s) => s.simRunning);
  const simEStop = useAppStore((s) => s.simEStop);
  const setSimEStop = useAppStore((s) => s.setSimEStop);

  // 电磁阀类型：单电控(弹簧复位) / 双电控(自保持)
  const [solenoidType, setSolenoidType] = useState<'single' | 'double'>('double');
  const solenoidTypeRef = useRef(solenoidType);
  solenoidTypeRef.current = solenoidType;


  // IO 信号实时状态（从 PLC 读取）
  const [ioSignals, setIoSignals] = useState<Record<string, boolean>>({});
  const prevSignalsRef = useRef<Record<string, boolean> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
  const protocolRef = useRef(protocol);
  protocolRef.current = protocol;
  const stopPollingRef = useRef<(() => void) | null>(null);

  // 上一轮电磁阀状态（上升沿检测用，双电控自锁）
  const prevSolRef = useRef({
    fwdRetract: false, fwdExtend: false,
    liftRetract: false, liftExtend: false,
    clampOpen: false, clampClose: false,
  });

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
        const allNames = Object.keys(readVars);
        const res = await plcService.readVars(allNames);
        if (!res.success || !res.values) return;

        const v = res.values;
        const signals: Record<string, boolean> = {
          start: !!v['BUTTON_START'], estop: !!v['BUTTON_ESTOP'], stop: !!v['BUTTON_STOP'],
          magForwardRear: !!v['MAG_FORWARD_REAR'], magForwardFront: !!v['MAG_FORWARD_FRONT'],
          magLiftRear: !!v['MAG_LIFT_REAR'], magLiftFront: !!v['MAG_LIFT_FRONT'],
          magClampOpen: !!v['MAG_CLAMP_OPEN'], magClampClose: !!v['MAG_CLAMP_CLOSE'],
          solForwardRetract: !!v['SOLENOID_FORWARD_RETRACT'], solForwardExtend: !!v['SOLENOID_FORWARD_EXTEND'],
          solLiftRetract: !!v['SOLENOID_LIFT_RETRACT'], solLiftExtend: !!v['SOLENOID_LIFT_EXTEND'],
          solClampOpen: !!v['SOLENOID_CLAMP_OPEN'], solClampClose: !!v['SOLENOID_CLAMP_CLOSE'],
          indOrigin: !!v['INDICATOR_ORIGIN'], indWorking: !!v['INDICATOR_WORKING'],
          indProcessing: !!v['INDICATOR_PROCESSING'], indAlarm: !!v['INDICATOR_ALARM'],
        };
        // 值未变化时跳过 setState，避免每轮轮询触发面板重渲染
        const prev = prevSignalsRef.current;
        const unchanged = prev !== null && Object.keys(signals).every((k) => prev[k] === signals[k]);
        if (!unchanged) setIoSignals(signals);
        prevSignalsRef.current = signals;

        // ===== PLC → 模型 =====
        const store = useRobotStore.getState();
        const isSingle = solenoidTypeRef.current === 'single';

        if (isSingle) {
          // 单电控：直接跟随伸出/夹紧线圈电平，失电→弹簧复位
          store.setCylinder('forward', !!signals.solForwardExtend);
          store.setCylinder('lift', !!signals.solLiftExtend);
          // 夹爪：CLAMP_CLOSE=ON→夹紧(extended=false)，OFF→松开(extended=true)
          store.setCylinder('clamp', !signals.solClampClose);
        } else {
          // 双电控：上升沿触发 + 自锁保持
          const p = prevSolRef.current;
          const fwdExtendRising = signals.solForwardExtend && !p.fwdExtend;
          const fwdRetractRising = signals.solForwardRetract && !p.fwdRetract;
          const liftExtendRising = signals.solLiftExtend && !p.liftExtend;
          const liftRetractRising = signals.solLiftRetract && !p.liftRetract;
          const clampOpenRising = signals.solClampOpen && !p.clampOpen;
          const clampCloseRising = signals.solClampClose && !p.clampClose;

          if (fwdExtendRising) store.setCylinder('forward', true);
          else if (fwdRetractRising) store.setCylinder('forward', false);

          if (liftExtendRising) store.setCylinder('lift', true);
          else if (liftRetractRising) store.setCylinder('lift', false);

          if (clampOpenRising) store.setCylinder('clamp', true);
          else if (clampCloseRising) store.setCylinder('clamp', false);

          prevSolRef.current = {
            fwdRetract: !!signals.solForwardRetract,
            fwdExtend: !!signals.solForwardExtend,
            liftRetract: !!signals.solLiftRetract,
            liftExtend: !!signals.solLiftExtend,
            clampOpen: !!signals.solClampOpen,
            clampClose: !!signals.solClampClose,
          };
        }

        // 指示灯
        store.setIndicator('home', !!signals.indOrigin);
        store.setIndicator('running', !!signals.indWorking);
        store.setIndicator('processing', !!signals.indProcessing);
        store.setIndicator('alarm', !!signals.indAlarm);

        // ===== 模型 → PLC：磁性开关写入 PLC 输入 =====
        const cyls = store.cylinders;
        const varNames = [
          'MAG_FORWARD_REAR', 'MAG_FORWARD_FRONT',
          'MAG_LIFT_REAR', 'MAG_LIFT_FRONT',
          'MAG_CLAMP_OPEN', 'MAG_CLAMP_CLOSE',
        ];
        await plcService.writeVars(varNames, [
          cyls.forward.magRear, cyls.forward.magFront,
          cyls.lift.magRear, cyls.lift.magFront,
          cyls.clamp.magFront, cyls.clamp.magRear,
        ]);
      } catch (e) {
        console.error('[轮询] 失败:', e instanceof Error ? e.message : String(e));
      } finally {
        pollingRef.current = false;
      }
    };
    poll();
    pollRef.current = setInterval(poll, 300);
  }, []);

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
  const writeBtn = useCallback(async (key: 'start' | 'estop' | 'stop', value: boolean) => {
    if (!connected) return;
    const varMap = {
      start: 'BUTTON_START', estop: 'BUTTON_ESTOP', stop: 'BUTTON_STOP',
    };
    try { await plcService.writeVar(varMap[key], value); } catch { /* 写入失败由轮询状态反馈 */ }
  }, [connected]);

  const ba = ADDRESS.BUTTON;
  const ia = ADDRESS.INDICATOR;
  const { MAG, SOLENOID } = ADDRESS;

  type AddrInfo = { coil: number; s7: string; mitsubishi: string };

  // 生成 IO 地址 tooltip 文本
  const getAddr = (key: keyof typeof ba) => {
    const b = ba[key];
    if (protocol === 'mitsubishi') return b.mitsubishi;
    if (protocol === 's7') return b.s7;
    return `Coil ${b.coil}`;
  };
  const getMagAddr = <G extends keyof typeof MAG>(group: G, pos: keyof typeof MAG[G]) => {
    const m = MAG[group][pos] as AddrInfo;
    if (protocol === 'mitsubishi') return m.mitsubishi;
    if (protocol === 's7') return m.s7;
    return `Coil ${m.coil}`;
  };
  const getSolAddr = <G extends keyof typeof SOLENOID>(group: G, dir: keyof typeof SOLENOID[G]) => {
    const s = SOLENOID[group][dir] as AddrInfo;
    if (protocol === 'mitsubishi') return s.mitsubishi;
    if (protocol === 's7') return s.s7;
    return `Coil ${s.coil}`;
  };
  const getIndAddr = (color: keyof typeof ia) => {
    const i = ia[color];
    if (protocol === 'mitsubishi') return i.mitsubishi;
    if (protocol === 's7') return i.s7;
    return `Coil ${i.coil}`;
  };

  return (
    <div className="space-y-2">
      {/* ===== 自复位控制按钮 ===== */}
      <div className="card">
        <div className="section-title !mb-2">控制按钮（自复位）</div>

        {/* 电磁阀类型切换 */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[0.5rem] text-slate-500 shrink-0">电磁阀</span>
          <div className="flex gap-0.5 flex-1">
            <button
              className={`btn btn-xs flex-1 touch-manipulation ${
                solenoidType === 'double' ? 'btn-primary' : 'btn-outline'
              }`}
              style={{ fontSize: '0.62rem' }}
              onClick={() => setSolenoidType('double')}
            >
              双电控
            </button>
            <button
              className={`btn btn-xs flex-1 touch-manipulation ${
                solenoidType === 'single' ? 'btn-primary' : 'btn-outline'
              }`}
              style={{ fontSize: '0.62rem' }}
              onClick={() => setSolenoidType('single')}
            >
              单电控
            </button>
          </div>
        </div>

        <div className="flex flex-nowrap gap-1.5 mb-2">
          <button
            className="btn btn-xs btn-success flex-1 touch-manipulation"
            onMouseDown={() => writeBtn('start', true)}
            onMouseUp={() => writeBtn('start', false)}
            onMouseLeave={() => writeBtn('start', false)}
            onTouchStart={() => writeBtn('start', true)}
            onTouchEnd={() => writeBtn('start', false)}
            aria-label="启动按钮"
            style={{ fontSize: '0.62rem' }}
          >
            &#9654;启动
          </button>
          <button
            className="btn btn-xs btn-warning flex-1 touch-manipulation"
            onMouseDown={() => writeBtn('stop', true)}
            onMouseUp={() => writeBtn('stop', false)}
            onMouseLeave={() => writeBtn('stop', false)}
            onTouchStart={() => writeBtn('stop', true)}
            onTouchEnd={() => writeBtn('stop', false)}
            aria-label="停止按钮"
            style={{ fontSize: '0.62rem' }}
          >
            &#9632;停止
          </button>
          <button
            className="btn btn-xs btn-danger flex-1 touch-manipulation"
            onMouseDown={() => writeBtn('estop', true)}
            onMouseUp={() => writeBtn('estop', false)}
            onMouseLeave={() => writeBtn('estop', false)}
            onTouchStart={() => writeBtn('estop', true)}
            onTouchEnd={() => writeBtn('estop', false)}
            aria-label="急停按钮"
            style={{ fontSize: '0.62rem' }}
          >
            &#9888;急停
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
            onClick={() => useRobotStore.getState().resetAll()}>复位全部</button>
        </div>
      </div>

      {/* ===== IO 信号 LED 显示 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">IO 信号</div>
        <div className="space-y-1.5">

          {/* 输入信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输入信号</div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="启动" active={!!ioSignals.start} addr={getAddr('start')} />
              <IOLed label="急停" active={!!ioSignals.estop} addr={getAddr('estop')} />
              <IOLed label="停止" active={!!ioSignals.stop} addr={getAddr('stop')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="水平原点" active={!!ioSignals.magForwardRear} addr={getMagAddr('forward', 'rear')} />
              <IOLed label="水平动点" active={!!ioSignals.magForwardFront} addr={getMagAddr('forward', 'front')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="升降原点" active={!!ioSignals.magLiftRear} addr={getMagAddr('lift', 'rear')} />
              <IOLed label="升降动点" active={!!ioSignals.magLiftFront} addr={getMagAddr('lift', 'front')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="夹爪松位" active={!!ioSignals.magClampOpen} addr={getMagAddr('clamp', 'open')} />
              <IOLed label="夹爪紧位" active={!!ioSignals.magClampClose} addr={getMagAddr('clamp', 'close')} />
            </div>
          </div>

          <div className="divider !my-0" />

          {/* 输出信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出信号</div>
            <div className="flex flex-nowrap gap-1">
              <IOLed
                label={solenoidType === 'single' ? '水平缩（未使用）' : '水平缩'}
                active={solenoidType === 'double' && !!ioSignals.solForwardRetract}
                addr={getSolAddr('forward', 'retract')}
              />
              <IOLed label="水平伸" active={!!ioSignals.solForwardExtend} addr={getSolAddr('forward', 'extend')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed
                label={solenoidType === 'single' ? '升降缩（未使用）' : '升降缩'}
                active={solenoidType === 'double' && !!ioSignals.solLiftRetract}
                addr={getSolAddr('lift', 'retract')}
              />
              <IOLed label="升降伸" active={!!ioSignals.solLiftExtend} addr={getSolAddr('lift', 'extend')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed
                label={solenoidType === 'single' ? '夹爪松（未使用）' : '夹爪松'}
                active={solenoidType === 'double' && !!ioSignals.solClampOpen}
                addr={getSolAddr('clamp', 'open')}
              />
              <IOLed label="夹爪紧" active={!!ioSignals.solClampClose} addr={getSolAddr('clamp', 'close')} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 灯塔指示灯 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">灯塔指示灯</div>
        <div className="grid grid-cols-4 gap-1">
          <IndicatorLight label="原点" active={!!ioSignals.indOrigin} color="#3b82f6" addr={getIndAddr('origin')} />
          <IndicatorLight label="运行" active={!!ioSignals.indWorking} color="#22c55e" addr={getIndAddr('working')} />
          <IndicatorLight label="加工" active={!!ioSignals.indProcessing} color="#eab308" addr={getIndAddr('processing')} />
          <IndicatorLight label="报警" active={!!ioSignals.indAlarm} color="#ef4444" addr={getIndAddr('alarm')} />
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