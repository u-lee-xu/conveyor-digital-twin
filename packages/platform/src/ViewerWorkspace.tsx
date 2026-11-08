import { useEffect, useRef, useState } from 'react';
import { PhysicsScene, relayWsUrl } from '@digital-twin/shared';
import { devices } from './registry';

export type BridgeLink = 'connecting' | 'online' | 'offline';

interface Snapshot {
  deviceId: string | null;
  mode?: string | null;
  ts: number;
  connected: boolean;
  protocol: string;
  vars: Record<string, boolean | number>;
  error?: string;
}

/**
 * 观众工作区：只读跟随主控的 3D 镜像。
 *
 * 设计口径（2026-11-08 定稿）：装了软件的机器打开就是主控，其余设备
 * （智能电视 / 手机 / 学生机浏览器，均无软件）打开 http://<教师机IP>:5201/
 * 直接就是观众，不需要角色页、不需要参数、不需要点任何按钮。
 *
 * 观众端：零上行消息（不发 set-device、不切换设备）、无操作面板、
 * 自动重连、首次交互尝试全屏；连接失败必须给出可见原因，禁止无限停在
 * 「连接服务中…」（旧版 CSP 拦截 + 构造异常未捕获曾导致这个现象）。
 */
export function ViewerWorkspace() {
  const [link, setLink] = useState<BridgeLink>('connecting');
  const [linkError, setLinkError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      setLink('connecting');
      setLinkError('');
      let ws: WebSocket;
      try {
        ws = new WebSocket(relayWsUrl());
      } catch (e) {
        setLink('offline');
        setLinkError(`连接被拒绝：${String(e)}`);
        reconnectTimer = setTimeout(connect, 3000);
        return;
      }
      wsRef.current = ws;
      timeoutTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setLink('offline');
          setLinkError('连接超时（5 秒），请确认教师机已启动');
          try { ws.close(); } catch { /* 已关闭 */ }
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeoutTimer);
        setLink('online');
        setLinkError('');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as Snapshot & { type?: string };
          if (msg.type !== 'snapshot') return;
          setSnapshot(msg);
          const device = msg.deviceId ? devices.find((d) => d.id === msg.deviceId) : undefined;
          try {
            device?.applyBroadcast?.(msg.vars ?? {});
          } catch (e) {
            console.warn('applyBroadcast error:', e);
          }
        } catch {
          // 忽略非法消息
        }
      };
      ws.onclose = () => {
        clearTimeout(timeoutTimer);
        if (closed) return;
        setLink('offline');
        setLinkError((prev) => prev || '教师机中继未响应，正在重试');
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => setLinkError('无法连接教师机的状态中继');
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(timeoutTimer);
      wsRef.current?.close();
    };
  }, []);

  // 智能电视 / 大屏：浏览器通常要求用户手势才能全屏，首次交互时补一次
  useEffect(() => {
    const tryFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        void el.requestFullscreen().catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', tryFullscreen, { once: true });
    return () => window.removeEventListener('pointerdown', tryFullscreen);
  }, []);

  // 只跟随主控：设备完全由快照决定，观众端没有任何切换入口
  const activeDeviceId = snapshot?.deviceId ?? null;
  const activeDevice = activeDeviceId ? devices.find((d) => d.id === activeDeviceId) : undefined;
  const Scene = activeDevice?.SceneWrapper ?? PhysicsScene;
  const badge =
    link === 'online'
      ? { text: activeDevice ? `跟随主控 · ${activeDevice.name}` : '已连接 · 等待主控', cls: 'border-green-500/40 text-green-400 bg-green-500/10' }
      : link === 'connecting'
        ? { text: '连接服务中…', cls: 'border-slate-500/40 text-slate-300 bg-slate-500/10' }
        : { text: `连接失败 · 重试中…`, cls: 'border-red-500/40 text-red-400 bg-red-500/10' };

  return (
    <div
      className="relative w-screen h-screen bg-slate-900 overflow-hidden"
      data-viewer-link={link}
      data-viewer-device={activeDeviceId ?? ''}
      data-viewer-error={linkError}
      data-viewer-mode={snapshot?.mode ?? ''}
    >
      {!activeDevice ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
          <div className="text-slate-300 text-sm">
            {link === 'online'
              ? '等待主控进入设备…'
              : link === 'connecting'
                ? '连接服务中…'
                : `连接失败：${linkError || '教师机未启动'} · 正在重试`}
          </div>
          <div className="text-slate-500 text-xs">
            本页为只读跟随模式 · 请在教师机上打开软件并进入设备
          </div>
        </div>
      ) : (
        <Scene key={activeDeviceId} SceneContent={activeDevice.SceneContent} cameraPosition={activeDevice.cameraPosition} />
      )}

      {/* 观众端无返回、无设备切换、无模式按钮：只剩状态角标 */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none">
        <span className={`text-xs px-2.5 py-1 rounded-full border backdrop-blur ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none px-4 py-1.5 rounded-full border border-slate-600/40 bg-slate-900/70 backdrop-blur">
        <span className="text-[0.7rem] font-mono text-slate-400">
          {snapshot
            ? `${snapshot.deviceId ?? '—'} · ${snapshot.protocol} · 更新于 ${new Date(snapshot.ts).toLocaleTimeString()}${snapshot.error ? ` · ${snapshot.error}` : ''}`
            : '等待数据…'}
        </span>
      </div>
    </div>
  );
}
