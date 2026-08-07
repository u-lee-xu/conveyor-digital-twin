import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useTrafficStore } from '../useTrafficStore';
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

/** 信号灯（大号卡片式） */
function LampIndicator({ label, active, color, addr }: { label: string; active: boolean; color: string; addr: string }) {
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
      <span style={{ fontSize: '0.55rem', color: active ? color : '#64748b', fontWeight: 500 }}>
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
  const simEStop = useAppStore((s) => s.simEStop);
  const setSimEStop = useAppStore((s) => s.setSimEStop);

  // IO 信号实时状态（从 PLC 读取）
  const [ioSignals, setIoSignals] = useState<Record<string, boolean>>({});
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

  /* ---- IO 轮询（PLC → 模型 同步） ---- */
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
          start: !!v['BUTTON_START'], stop: !!v['BUTTON_STOP'], estop: !!v['BUTTON_ESTOP'],
          ew_green: !!v['LIGHT_EW_GREEN'], ew_yellow: !!v['LIGHT_EW_YELLOW'], ew_red: !!v['LIGHT_EW_RED'],
          ns_green: !!v['LIGHT_NS_GREEN'], ns_yellow: !!v['LIGHT_NS_YELLOW'], ns_red: !!v['LIGHT_NS_RED'],
        };
        setIoSignals(signals);

        // ===== PLC → 模型：灯状态同步（3D 场景实时显示） =====
        useTrafficStore.getState().setLamps({
          ew_green: !!signals.ew_green,
          ew_yellow: !!signals.ew_yellow,
          ew_red: !!signals.ew_red,
          ns_green: !!signals.ns_green,
          ns_yellow: !!signals.ns_yellow,
          ns_red: !!signals.ns_red,
        });
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
  const writeBtn = useCallback(async (key: 'start' | 'stop' | 'estop', value: boolean) => {
    if (!connected) return;
    const varMap = {
      start: 'BUTTON_START', stop: 'BUTTON_STOP', estop: 'BUTTON_ESTOP',
    };
    try { await plcService.writeVar(varMap[key], value); } catch { /* 写入失败由轮询状态反馈 */ }
  }, [connected]);

  const ba = ADDRESS.BUTTON;
  const la = ADDRESS.LIGHT;

  type AddrInfo = { coil: number; s7: string; mitsubishi: string };

  const getAddr = (key: keyof typeof ba) => {
    const b = ba[key];
    if (protocol === 'mitsubishi') return b.mitsubishi;
    if (protocol === 's7') return b.s7;
    return `Coil ${b.coil}`;
  };
  const getLampAddr = <G extends keyof typeof la>(group: G, color: keyof typeof la[G]) => {
    const l = la[group][color] as AddrInfo;
    if (protocol === 'mitsubishi') return l.mitsubishi;
    if (protocol === 's7') return l.s7;
    return `Coil ${l.coil}`;
  };

  return (
    <div className="space-y-2">
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
          ) : (
            <span className="badge badge-slate"><span className="badge-dot badge-dot-slate" />待机</span>
          )}
          {simEStop && (
            <button className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.62rem' }}
              onClick={() => setSimEStop(false)}>复位</button>
          )}
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
              <IOLed label="停止" active={!!ioSignals.stop} addr={getAddr('stop')} />
              <IOLed label="急停" active={!!ioSignals.estop} addr={getAddr('estop')} />
            </div>
          </div>

          <div className="divider !my-0" />

          {/* 输出信号 */}
          <div>
            <div className="text-[0.5rem] text-slate-500 mb-0.5">输出信号</div>
            <div className="grid grid-cols-3 gap-1">
              <LampIndicator label="东西绿" active={!!ioSignals.ew_green} color="#22c55e" addr={getLampAddr('ew', 'green')} />
              <LampIndicator label="东西黄" active={!!ioSignals.ew_yellow} color="#eab308" addr={getLampAddr('ew', 'yellow')} />
              <LampIndicator label="东西红" active={!!ioSignals.ew_red} color="#ef4444" addr={getLampAddr('ew', 'red')} />
              <LampIndicator label="南北绿" active={!!ioSignals.ns_green} color="#22c55e" addr={getLampAddr('ns', 'green')} />
              <LampIndicator label="南北黄" active={!!ioSignals.ns_yellow} color="#eab308" addr={getLampAddr('ns', 'yellow')} />
              <LampIndicator label="南北红" active={!!ioSignals.ns_red} color="#ef4444" addr={getLampAddr('ns', 'red')} />
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

export default SimPanel;
