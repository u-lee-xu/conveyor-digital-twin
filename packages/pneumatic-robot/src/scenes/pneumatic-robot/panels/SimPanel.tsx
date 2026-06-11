import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useRobotStore } from '../useRobotStore';
import { ADDRESS, MITSUBISHI_READ_VARS } from '../constants';
import { plcService } from '../../../services/plc-websocket';

/** 单个IO信号LED指示灯 */
function IOLed({ label, active, addr }: { label: string; active: boolean; addr: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 flex-1 min-w-0" title={addr} style={{ fontSize: '0.55rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <span className={`truncate ${active ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

// 上一轮电磁阀状态（上升沿检测用，双电控自锁）
let prevSol = {
  fwdRetract: false, fwdExtend: false,
  liftRetract: false, liftExtend: false,
  clampOpen: false, clampClose: false,
};

export function SimPanel({ onShowHelp }: { onShowHelp: () => void }) {
  const simRunning = useAppStore((s) => s.simRunning);
  const simEStop = useAppStore((s) => s.simEStop);
  const setSimEStop = useAppStore((s) => s.setSimEStop);

  // PLC 连接状态
  const [plcConnected, setPlcConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connMsg, setConnMsg] = useState('');

  // IO 信号实时状态（从 PLC 读取）
  const [ioSignals, setIoSignals] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false); // 防重入锁

  /* ---- PLC 断连回调 ---- */
  useEffect(() => {
    plcService.setOnDisconnected(() => {
      setPlcConnected(false);
      setConnMsg('PLC 连接已断开');
      stopPolling();
    });
    return () => { plcService.setOnDisconnected(null); stopPolling(); };
  }, []);

  /* ---- IO 轮询（双向同步，三菱 MX 协议） ---- */
  const startPolling = useCallback(() => {
    stopPolling();
    const poll = async () => {
      if (!plcService.connected || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const allNames = Object.keys(MITSUBISHI_READ_VARS);
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
        setIoSignals(signals);

        // ===== PLC → 模型：双电控电磁阀（上升沿触发 + 自锁保持） =====
        const store = useRobotStore.getState();

        const fwdExtendRising = signals.solForwardExtend && !prevSol.fwdExtend;
        const fwdRetractRising = signals.solForwardRetract && !prevSol.fwdRetract;
        const liftExtendRising = signals.solLiftExtend && !prevSol.liftExtend;
        const liftRetractRising = signals.solLiftRetract && !prevSol.liftRetract;
        const clampOpenRising = signals.solClampOpen && !prevSol.clampOpen;
        const clampCloseRising = signals.solClampClose && !prevSol.clampClose;

        if (fwdExtendRising) store.setCylinder('forward', true);
        else if (fwdRetractRising) store.setCylinder('forward', false);

        if (liftExtendRising) store.setCylinder('lift', true);
        else if (liftRetractRising) store.setCylinder('lift', false);

        if (clampOpenRising) store.setCylinder('clamp', true);
        else if (clampCloseRising) store.setCylinder('clamp', false);

        prevSol = {
          fwdRetract: !!signals.solForwardRetract,
          fwdExtend: !!signals.solForwardExtend,
          liftRetract: !!signals.solLiftRetract,
          liftExtend: !!signals.solLiftExtend,
          clampOpen: !!signals.solClampOpen,
          clampClose: !!signals.solClampClose,
        };

        // 指示灯
        store.setIndicator('home', !!signals.indOrigin);
        store.setIndicator('running', !!signals.indWorking);
        store.setIndicator('processing', !!signals.indProcessing);
        store.setIndicator('alarm', !!signals.indAlarm);

        // ===== 模型 → PLC：磁性开关写入 PLC 输入 =====
        const cyls = store.cylinders;
        const magForwardRear = cyls.forward.magRear;
        const magForwardFront = cyls.forward.magFront;
        const magLiftRear = cyls.lift.magRear;
        const magLiftFront = cyls.lift.magFront;
        const magClampOpen = cyls.clamp.magRear;
        const magClampClose = cyls.clamp.magFront;

        const varNames = [
          'MAG_FORWARD_REAR', 'MAG_FORWARD_FRONT',
          'MAG_LIFT_REAR', 'MAG_LIFT_FRONT',
          'MAG_CLAMP_OPEN', 'MAG_CLAMP_CLOSE',
        ];
        await plcService.writeVars(varNames, [
          magForwardRear, magForwardFront,
          magLiftRear, magLiftFront,
          magClampOpen, magClampClose,
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

  /* ---- 连接/断开 ---- */
  const handleConnect = async () => {
    setBusy(true);
    setConnMsg('');
    try {
      const result = await plcService.connect({
        host: 'localhost',
        port: 0,
        protocol: 'mitsubishi',
      });
      if (!result.success) throw new Error(result.error || '连接失败');
      setPlcConnected(true);
      setConnMsg('已连接 三菱 MX Component');
      startPolling();
    } catch (e) {
      setPlcConnected(false);
      setConnMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    stopPolling();
    prevSol = { fwdRetract: false, fwdExtend: false, liftRetract: false, liftExtend: false, clampOpen: false, clampClose: false };
    try { await plcService.disconnect(); } catch {}
    setPlcConnected(false);
    setConnMsg('已断开');
    setIoSignals({});
    setBusy(false);
  };

  /* ---- 自复位按钮：写入 PLC ---- */
  const writeBtn = useCallback(async (key: 'start' | 'estop' | 'stop', value: boolean) => {
    if (!plcConnected) return;
    const varMap = {
      start: 'BUTTON_START', estop: 'BUTTON_ESTOP', stop: 'BUTTON_STOP',
    };
    try { await plcService.writeVar(varMap[key], value); } catch {}
  }, [plcConnected]);

  const ba = ADDRESS.BUTTON;
  const ia = ADDRESS.INDICATOR;
  const { MAG, SOLENOID } = ADDRESS;

  return (
    <div className="space-y-2">
      {/* ===== PLC 连接 ===== */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="section-title !mb-0">PLC 连接</div>
          <div className={`px-2 py-0.5 rounded-full text-[0.55rem] font-semibold ${
            plcConnected ? 'bg-green-500/15 text-green-300' : 'bg-slate-700/60 text-slate-400'
          }`}>
            {plcConnected ? '已连接' : '未连接'}
          </div>
        </div>

        <div className="text-[0.5rem] text-slate-500 mb-2">三菱 FX3U (MX Component)</div>

        <div className="flex flex-nowrap gap-1.5">
          <button
            className="btn btn-xs btn-success flex-1 touch-manipulation"
            onClick={handleConnect}
            disabled={busy || plcConnected}
          >
            {busy && !plcConnected ? '...' : '连接'}
          </button>
          <button
            className="btn btn-xs btn-outline flex-1 touch-manipulation"
            onClick={handleDisconnect}
            disabled={busy || !plcConnected}
          >
            断开
          </button>
        </div>

        {connMsg ? (
          <div className={`mt-2 text-[0.55rem] px-2 py-1 rounded ${
            connMsg.includes('已连接') ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
          }`}>
            {connMsg}
          </div>
        ) : null}
      </div>

      {/* ===== 自复位控制按钮 ===== */}
      <div className="card">
        <div className="section-title !mb-2">控制按钮（自复位）</div>
        <div className="flex flex-nowrap gap-1.5 mb-2">
          <button
            className="btn btn-xs btn-success flex-1 touch-manipulation"
            onMouseDown={() => writeBtn('start', true)}
            onMouseUp={() => writeBtn('start', false)}
            onMouseLeave={() => writeBtn('start', false)}
            onTouchStart={() => writeBtn('start', true)}
            onTouchEnd={() => writeBtn('start', false)}
            aria-label="启动按钮"
            style={{ fontSize: '0.55rem' }}
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
            style={{ fontSize: '0.55rem' }}
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
            style={{ fontSize: '0.55rem' }}
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
            <button className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem' }}
              onClick={() => setSimEStop(false)}>复位</button>
          )}
          <button className="btn btn-xs btn-ghost ml-auto touch-manipulation" style={{ fontSize: '0.55rem' }}
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
              <IOLed label="启动" active={!!ioSignals.start} addr={`X0/${ba.start.s7}`} />
              <IOLed label="急停" active={!!ioSignals.estop} addr={`X1/${ba.estop.s7}`} />
              <IOLed label="停止" active={!!ioSignals.stop} addr={`X2/${ba.stop.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="水平原点" active={!!ioSignals.magForwardRear} addr={`X3/${MAG.forward.rear.s7}`} />
              <IOLed label="水平动点" active={!!ioSignals.magForwardFront} addr={`X4/${MAG.forward.front.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="升降原点" active={!!ioSignals.magLiftRear} addr={`X5/${MAG.lift.rear.s7}`} />
              <IOLed label="升降动点" active={!!ioSignals.magLiftFront} addr={`X6/${MAG.lift.front.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="夹爪松位" active={!!ioSignals.magClampOpen} addr={`X7/${MAG.clamp.open.s7}`} />
              <IOLed label="夹爪紧位" active={!!ioSignals.magClampClose} addr={`X10/${MAG.clamp.close.s7}`} />
            </div>
          </div>

          <div className="divider !my-0" />

          {/* 输出信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出信号</div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="水平缩" active={!!ioSignals.solForwardRetract} addr={`Y0/${SOLENOID.forward.retract.s7}`} />
              <IOLed label="水平伸" active={!!ioSignals.solForwardExtend} addr={`Y1/${SOLENOID.forward.extend.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="升降缩" active={!!ioSignals.solLiftRetract} addr={`Y2/${SOLENOID.lift.retract.s7}`} />
              <IOLed label="升降伸" active={!!ioSignals.solLiftExtend} addr={`Y3/${SOLENOID.lift.extend.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="夹爪松" active={!!ioSignals.solClampOpen} addr={`Y4/${SOLENOID.clamp.open.s7}`} />
              <IOLed label="夹爪紧" active={!!ioSignals.solClampClose} addr={`Y5/${SOLENOID.clamp.close.s7}`} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="原点灯" active={!!ioSignals.indOrigin} addr={`Y6/${ia.origin.s7}`} />
              <IOLed label="工作灯" active={!!ioSignals.indWorking} addr={`Y7/${ia.working.s7}`} />
              <IOLed label="加工灯" active={!!ioSignals.indProcessing} addr={`Y10/${ia.processing.s7}`} />
              <IOLed label="报警灯" active={!!ioSignals.indAlarm} addr={`Y11/${ia.alarm.s7}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 帮助链接 ===== */}
      <button
        className="btn btn-xs btn-ghost w-full touch-manipulation"
        style={{ fontSize: '0.55rem' }}
        onClick={onShowHelp}
      >
        使用说明 & IO地址分配
      </button>
    </div>
  );
}
