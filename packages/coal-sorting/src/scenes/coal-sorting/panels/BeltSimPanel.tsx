import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useBeltStore, type BeltName, type BeltSensorName } from '../useBeltStore';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
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

const SENSOR_TO_VAR: Record<BeltSensorName, string> = {
  s1_belt1_entry: 'S1_BELT1_ENTRY', s2_belt1_run: 'S2_BELT1_RUN', s3_belt1_exit: 'S3_BELT1_EXIT',
  s4_belt2_entry: 'S4_BELT2_ENTRY', s5_belt2_run: 'S5_BELT2_RUN', s6_belt2_exit: 'S6_BELT2_EXIT',
  s7_belt3_entry: 'S7_BELT3_ENTRY', s8_belt3_run: 'S8_BELT3_RUN', s9_belt3_exit: 'S9_BELT3_EXIT',
  s10_pileup: 'S10_PILEUP',
};

export function BeltSimPanel({ onShowHelp, protocol, connected, setConnected }: {
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

  // 上一轮电磁阀状态（上升沿检测用，双电控自锁）
  const prevSolRef = useRef({ feedExtend: false, feedRetract: false });

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
          start: !!v['BUTTON_START'], stop: !!v['BUTTON_STOP'], estop: !!v['BUTTON_ESTOP'],
          belt1: !!v['BELT1_RUN'], belt2: !!v['BELT2_RUN'], belt3: !!v['BELT3_RUN'], belt4: !!v['BELT4_RUN'],
          feedExtend: !!v['FEED_CYL_EXTEND'], feedRetract: !!v['FEED_CYL_RETRACT'],
          separator: !!v['SEPARATOR_ON'],
          indBelt1: !!v['IND_BELT1_RUN'], indBelt2: !!v['IND_BELT2_RUN'],
          indBelt3: !!v['IND_BELT3_RUN'], indBelt4: !!v['IND_BELT4_RUN'],
          indFault: !!v['IND_FAULT'],
        };
        // 值未变化时跳过 setState，避免每轮轮询触发面板重渲染
        const prev = prevSignalsRef.current;
        const unchanged = prev !== null && Object.keys(signals).every((k) => prev[k] === signals[k]);
        if (!unchanged) setIoSignals(signals);
        prevSignalsRef.current = signals;

        // ===== PLC → 模型 =====
        const store = useBeltStore.getState();
        const beltNames: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
        beltNames.forEach((name, i) => store.setBeltRunning(name, !!signals[`belt${i + 1}` as keyof typeof signals]));

        // 上料气缸：双电控上升沿触发 + 自锁保持
        const p = prevSolRef.current;
        if (signals.feedExtend && !p.feedExtend) store.setFeedCylinder(true);
        if (signals.feedRetract && !p.feedRetract) store.setFeedCylinder(false);
        prevSolRef.current = { feedExtend: !!signals.feedExtend, feedRetract: !!signals.feedRetract };

        store.setSeparator(!!signals.separator);

        // 指示灯：皮带运行指示跟随 PLC 输出，故障指示独立
        store.setIndicator('belt1_run', !!signals.indBelt1);
        store.setIndicator('belt2_run', !!signals.indBelt2);
        store.setIndicator('belt3_run', !!signals.indBelt3);
        store.setIndicator('belt4_run', !!signals.indBelt4);
        store.setIndicator('fault', !!signals.indFault);

        // 主令状态
        if (signals.estop) {
          setSimEStop(true);
          setSimRunning(false);
        } else if (signals.start) {
          setSimEStop(false);
          setSimRunning(true);
        } else if (signals.stop) {
          setSimRunning(false);
        }

        // ===== 模型 → PLC：传感器 + 磁性开关写入 PLC 输入 =====
        const sensors = useBeltStore.getState().sensors;
        const sensorNames = Object.keys(SENSOR_TO_VAR) as BeltSensorName[];
        const cyl = useBeltStore.getState().feedCylinder;
        await plcService.writeVars(
          [...sensorNames.map((n) => SENSOR_TO_VAR[n]), 'CYL_FEED_OUT', 'CYL_FEED_IN'],
          [...sensorNames.map((n) => sensors[n]), cyl.extended, !cyl.extended],
        );
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
  const writeBtn = useCallback(async (key: 'start' | 'stop' | 'estop', value: boolean) => {
    if (!connected) return;
    const varMap = { start: 'BUTTON_START', stop: 'BUTTON_STOP', estop: 'BUTTON_ESTOP' };
    try { await plcService.writeVar(varMap[key], value); } catch { /* 写入失败由轮询状态反馈 */ }
  }, [connected]);

  const getAddr = (key: string) => {
    const map = getReadVars(protocol);
    if (protocol === 'modbus') return `Coil ${map[key as keyof typeof map]}`;
    return map[key as keyof typeof map] as string;
  };

  const beltNames: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
  const beltLabels: Record<BeltName, string> = {
    belt1: '1#给料', belt2: '2#筛分', belt3: '3#精煤', belt4: '4#筛下',
  };
  const sensorConfig: { name: BeltSensorName; label: string }[] = [
    { name: 's1_belt1_entry', label: 'S1入口' },
    { name: 's2_belt1_run', label: 'S2运行' },
    { name: 's3_belt1_exit', label: 'S3出口' },
    { name: 's4_belt2_entry', label: 'S4入口' },
    { name: 's5_belt2_run', label: 'S5运行' },
    { name: 's6_belt2_exit', label: 'S6出口' },
    { name: 's7_belt3_entry', label: 'S7入口' },
    { name: 's8_belt3_run', label: 'S8运行' },
    { name: 's9_belt3_exit', label: 'S9出口' },
    { name: 's10_pileup', label: 'S10堆料' },
  ];
  const sensors = useBeltStore((s) => s.sensors);
  const feedCylinder = useBeltStore((s) => s.feedCylinder);

  return (
    <div className="space-y-2">
      {/* ===== 自复位控制按钮 ===== */}
      <div className="card">
        <div className="section-title !mb-2">主令控制（自复位）</div>
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
            ▶启动
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
            ■停止
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
            ⚠急停
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
            onClick={() => useBeltStore.getState().reset()}>复位全部</button>
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
              {sensorConfig.map((sc) => (
                <IOLed key={sc.name} label={sc.label} active={!!sensors[sc.name]} addr={getAddr(SENSOR_TO_VAR[sc.name])} />
              ))}
              <IOLed label="上料伸" active={feedCylinder.extended} addr={getAddr('CYL_FEED_OUT')} />
              <IOLed label="上料缩" active={!feedCylinder.extended} addr={getAddr('CYL_FEED_IN')} />
            </div>
          </div>

          <div className="divider !my-0" />

          {/* 输出信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出信号（PLC → 孪生）</div>
            <div className="flex flex-nowrap gap-1">
              {beltNames.map((n) => (
                <IOLed key={n} label={beltLabels[n]} active={!!ioSignals[`belt${n.slice(4)}`]} addr={getAddr(`BELT${n.slice(4)}_RUN`)} />
              ))}
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="上料伸" active={!!ioSignals.feedExtend} addr={getAddr('FEED_CYL_EXTEND')} />
              <IOLed label="上料缩" active={!!ioSignals.feedRetract} addr={getAddr('FEED_CYL_RETRACT')} />
              <IOLed label="气吹" active={!!ioSignals.separator} addr={getAddr('SEPARATOR_ON')} />
            </div>
            <div className="flex flex-nowrap gap-1">
              <IOLed label="1#指示" active={!!ioSignals.indBelt1} addr={getAddr('IND_BELT1_RUN')} />
              <IOLed label="2#指示" active={!!ioSignals.indBelt2} addr={getAddr('IND_BELT2_RUN')} />
              <IOLed label="3#指示" active={!!ioSignals.indBelt3} addr={getAddr('IND_BELT3_RUN')} />
              <IOLed label="4#指示" active={!!ioSignals.indBelt4} addr={getAddr('IND_BELT4_RUN')} />
              <IOLed label="故障" active={!!ioSignals.indFault} addr={getAddr('IND_FAULT')} />
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

export default BeltSimPanel;
