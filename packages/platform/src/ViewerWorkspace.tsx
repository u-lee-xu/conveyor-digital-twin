import { useEffect, useRef, useState } from 'react';
import { PhysicsScene } from '@digital-twin/shared';
import { devices } from './registry';
import type { DeviceDefinition } from './types';

export type BridgeLink = 'connecting' | 'online' | 'offline';

interface Snapshot {
  deviceId: string | null;
  ts: number;
  connected: boolean;
  protocol: string;
  vars: Record<string, boolean>;
  error?: string;
}

/**
 * 观众工作区：只读 3D 镜像。
 * - 默认跟随主控：主控进入设备 → 广播 deviceId → 自动切换对应场景；主控未进入 → 等待页
 * - 也可自选设备（自选同样向广播请求切换，所有观众同步）
 */
export function ViewerWorkspace({ onBack }: { onBack: () => void }) {
  const [link, setLink] = useState<BridgeLink>('connecting');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [follow, setFollow] = useState(true);
  const [manualDeviceId, setManualDeviceId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const sendSetDevice = (deviceId: string | null) => {
    const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
    try {
      const ws = new WebSocket(`ws://${host}:8082`);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'set-device', deviceId }));
      ws.onerror = () => ws.close();
    } catch {
      // 非边缘环境无广播服务，静默
    }
  };

  useEffect(() => {
    const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
    let closed = false;

    const connect = () => {
      const ws = new WebSocket(`ws://${host}:8082`);
      wsRef.current = ws;
      setLink('connecting');
      ws.onopen = () => setLink('online');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== 'snapshot') return;
          setSnapshot(msg);
          const device = msg.deviceId ? devices.find((d) => d.id === msg.deviceId) : undefined;
          device?.applyBroadcast?.(msg.vars ?? {});
        } catch {
          // 忽略非法消息
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setLink('offline');
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

  // 激活设备：跟随主控（快照 deviceId）或观众自选
  const activeDeviceId = follow ? snapshot?.deviceId ?? null : manualDeviceId;
  const activeDevice: DeviceDefinition | undefined = activeDeviceId
    ? devices.find((d) => d.id === activeDeviceId)
    : undefined;

  const Scene = activeDevice?.SceneWrapper ?? PhysicsScene;
  const waiting = !activeDevice;
  const badge =
    link === 'online'
      ? snapshot?.connected
        ? { text: `${activeDevice?.name ?? '设备'} · PLC 在线`, cls: 'border-green-500/40 text-green-400 bg-green-500/10' }
        : { text: `${activeDevice?.name ?? '设备'} · PLC 未连`, cls: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' }
      : link === 'connecting'
        ? { text: '连接中…', cls: 'border-slate-500/40 text-slate-300 bg-slate-500/10' }
        : { text: '连接断开，重试中…', cls: 'border-red-500/40 text-red-400 bg-red-500/10' };

  return (
    <div className="relative w-screen h-screen bg-slate-900 overflow-hidden">
      {waiting ? (
        /* 主控未进入设备：黑屏等待 */
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
          <div className="text-slate-500 text-sm">
            {link === 'online' ? '等待主控进入设备…' : '连接服务中…'}
          </div>
          <button
            onClick={() => { setFollow(false); setManualDeviceId(devices[0].id); sendSetDevice(devices[0].id); }}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-600/40 text-slate-300 bg-slate-800/60 hover:bg-slate-700/60 transition-colors"
          >
            直接查看 {devices[0].icon} {devices[0].name}
          </button>
        </div>
      ) : (
        <Scene SceneContent={activeDevice.SceneContent} cameraPosition={activeDevice.cameraPosition} />
      )}

      {/* 顶部：返回入口 + 设备选择条（默认跟随主控，可自选） */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          aria-label="返回入口页"
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900/60 backdrop-blur border border-slate-600/40 text-slate-300 hover:text-white transition-colors"
        >
          ←
        </button>
        <button
          onClick={() => setFollow(true)}
          className={`text-xs px-2.5 py-1 rounded-full border backdrop-blur transition-colors ${
            follow
              ? 'border-blue-500/50 text-blue-300 bg-blue-500/10'
              : 'border-slate-600/40 text-slate-300 bg-slate-900/60'
          }`}
        >
          {follow ? (snapshot?.deviceId ? '跟随：' + (devices.find((d) => d.id === snapshot.deviceId)?.name ?? snapshot.deviceId) : '跟随主控') : '跟随主控'}
        </button>
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setManualDeviceId(d.id);
              setFollow(false);
              sendSetDevice(d.id);
            }}
            className={`text-xs px-2.5 py-1 rounded-full border backdrop-blur transition-colors ${
              !follow && manualDeviceId === d.id
                ? 'border-blue-500/50 text-blue-300 bg-blue-500/10'
                : 'border-slate-600/40 text-slate-300 bg-slate-900/60'
            }`}
          >
            {d.icon} {d.name}
          </button>
        ))}
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full border backdrop-blur ${badge.cls}`}>{badge.text}</span>
      </div>

      {/* 底部状态条 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full border border-slate-600/40 bg-slate-900/70 backdrop-blur">
        <span className="text-[0.7rem] font-mono text-slate-400">
          {snapshot
            ? `${snapshot.deviceId ?? '—'} · ${snapshot.protocol} · 更新于 ${new Date(snapshot.ts).toLocaleTimeString()}${snapshot.error ? ` · ${snapshot.error}` : ''}`
            : '等待数据…'}
        </span>
      </div>
    </div>
  );
}
