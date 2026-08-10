import React, { useEffect, useRef, useState } from 'react';

interface Snapshot {
  ts: number;
  connected: boolean;
  protocol: string;
  vars: Record<string, boolean>;
  error?: string;
}

interface ViewerState {
  link: 'connecting' | 'online' | 'offline';
  snapshot: Snapshot | null;
  bridgeUp: boolean;
}

/** 传感器/执行器中文标签 */
const VAR_LABELS: [string, string][] = [
  ['SENSOR_FEED', '上料传感器'],
  ['SENSOR_COLOR', '色标传感器'],
  ['SENSOR_MATERIAL', '物料传感器'],
  ['MAGNETIC_FEED_RETRACT', '上料气缸缩回'],
  ['MAGNETIC_FEED_EXTEND', '上料气缸伸出'],
  ['MAGNETIC_SORTING1_RETRACT', '分拣1气缸缩回'],
  ['MAGNETIC_SORTING1_EXTEND', '分拣1气缸伸出'],
  ['MAGNETIC_SORTING2_RETRACT', '分拣2气缸缩回'],
  ['MAGNETIC_SORTING2_EXTEND', '分拣2气缸伸出'],
  ['FEED_CYLINDER_VALVE', '上料电磁阀'],
  ['SORTING1_CYLINDER_VALVE', '分拣1电磁阀'],
  ['SORTING2_CYLINDER_VALVE', '分拣2电磁阀'],
  ['CONVEYOR', '传送带运行'],
];

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full transition-colors duration-300 ${
        on ? 'bg-green-400 glow-green pulse-indicator' : 'bg-gray-600'
      }`}
    />
  );
}

function ValueCell({ name, label, value, tone }: { name: string; label: string; value?: boolean; tone?: string }) {
  return (
    <div
      className={`p-2.5 rounded-lg text-center transition-all duration-300 ${
        value ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-800/50 border border-gray-700/30'
      }`}
      style={tone && value ? { borderColor: tone } : undefined}
    >
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <StatusDot on={!!value} />
      </div>
      <span className="text-xs text-gray-400">{label}</span>
      <span className="block text-[0.6rem] font-mono text-gray-600 mt-0.5">{name}</span>
    </div>
  );
}

export const ViewerApp: React.FC = () => {
  const [state, setState] = useState<ViewerState>({ link: 'connecting', snapshot: null, bridgeUp: false });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
    let closed = false;

    const connect = () => {
      const ws = new WebSocket(`ws://${host}:8082`);
      wsRef.current = ws;
      setState((s) => ({ ...s, link: 'connecting' }));

      ws.onopen = () => setState((s) => ({ ...s, link: 'online' }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'snapshot') {
            setState((s) => ({ ...s, snapshot: msg, bridgeUp: !!msg.connected }));
          }
        } catch {
          // 忽略非 JSON 消息
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setState((s) => ({ ...s, link: 'offline' }));
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  const vars = state.snapshot?.vars ?? {};

  return (
    <div className="min-h-screen bg-dark-900 text-white p-4 max-w-md mx-auto">
      {/* 头部状态 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">传送带分拣 · 观众视图</h1>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            state.link === 'online'
              ? state.bridgeUp
                ? 'border-green-500/40 text-green-400 bg-green-500/10'
                : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
              : 'border-red-500/40 text-red-400 bg-red-500/10'
          }`}
        >
          {state.link === 'online' ? (state.bridgeUp ? 'PLC 在线' : '网关在线 · PLC 未连') : state.link === 'connecting' ? '连接中…' : '连接断开，重试中…'}
        </span>
      </div>

      {/* 最近更新 */}
      <div className="text-[0.7rem] text-gray-500 font-mono mb-3">
        协议 {state.snapshot?.protocol ?? '—'} · 更新于{' '}
        {state.snapshot ? new Date(state.snapshot.ts).toLocaleTimeString() : '—'}
      </div>

      {/* 传感器与执行器 */}
      <div className="device-card mb-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">传感器 / 执行器状态</div>
        <div className="grid grid-cols-3 gap-2">
          {VAR_LABELS.map(([name, label]) => (
            <ValueCell key={name} name={name} label={label} value={vars[name]} />
          ))}
        </div>
      </div>

      {/* 原始变量 */}
      <div className="device-card">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">PLC 变量原文</div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(vars).map(([name, val]) => (
            <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded bg-gray-800/40 border border-gray-700/30">
              <span className="text-[0.65rem] font-mono text-gray-400">{name}</span>
              <StatusDot on={!!val} />
            </div>
          ))}
          {Object.keys(vars).length === 0 && (
            <div className="col-span-2 text-center text-xs text-gray-500 py-4">等待 PLC 数据…</div>
          )}
        </div>
      </div>

      <div className="text-center text-[0.65rem] text-gray-600 mt-4">只读观众视图 · 操作权在教师端</div>
    </div>
  );
};
