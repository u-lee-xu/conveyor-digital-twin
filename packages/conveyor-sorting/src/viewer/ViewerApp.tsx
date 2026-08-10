import React, { useEffect, useRef, useState } from 'react';
import { devices, type DeviceDefinition } from '@digital-twin/platform';
import { PhysicsScene } from '@digital-twin/shared';

export type BridgeLink = 'connecting' | 'online' | 'offline';

interface Snapshot {
  deviceId: string;
  ts: number;
  connected: boolean;
  protocol: string;
  vars: Record<string, boolean>;
  error?: string;
}

/**
 * 观众视图：默认跟随教师端激活设备（广播快照 deviceId），也可自选设备。
 * 每台设备独立渲染 3D 场景（OrbitControls 自由旋转），数据由广播快照驱动（只读）。
 */
export const ViewerApp: React.FC = () => {
  const [link, setLink] = useState<BridgeLink>('connecting');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [follow, setFollow] = useState(true);
  const [manualDeviceId, setManualDeviceId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 订阅广播（8082）：跟随模式默认连树莓派；断线自动重连
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
          const device = devices.find((d) => d.id === msg.deviceId);
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

  // 激活设备：跟随教师端（广播 deviceId）或学生自选
  const activeDevice: DeviceDefinition | undefined = follow
    ? devices.find((d) => d.id === snapshot?.deviceId)
    : devices.find((d) => d.id === manualDeviceId);

  const Scene = activeDevice?.SceneWrapper ?? PhysicsScene;
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
      {/* 3D 场景：由广播 deviceId 决定渲染哪个设备；无激活设备时显示空白提示 */}
      {activeDevice ? (
        <Scene SceneContent={activeDevice.SceneContent} cameraPosition={activeDevice.cameraPosition} />
      ) : (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          暂无激活设备，请教师端进入设备工作区
        </div>
      )}

      {/* 顶部：设备选择条（默认跟随教师端） */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFollow(true)}
          className={`text-xs px-2.5 py-1 rounded-full border backdrop-blur transition-colors ${
            follow
              ? 'border-blue-500/50 text-blue-300 bg-blue-500/10'
              : 'border-slate-600/40 text-slate-300 bg-slate-900/60'
          }`}
        >
          {follow && snapshot ? '跟随：' + (devices.find((d) => d.id === snapshot.deviceId)?.name ?? snapshot.deviceId) : '跟随教师端'}
        </button>
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setManualDeviceId(d.id);
              setFollow(false);
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
            ? `${snapshot.deviceId} · ${snapshot.protocol} · 更新于 ${new Date(snapshot.ts).toLocaleTimeString()}${snapshot.error ? ` · ${snapshot.error}` : ''}`
            : '等待数据…'}
        </span>
      </div>
    </div>
  );
};
