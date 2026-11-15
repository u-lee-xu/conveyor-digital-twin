import { useEffect, useRef, useState } from 'react';
import { relayWsUrl } from '@digital-twin/shared';
import { DEVICE_META } from './deviceMeta';
import { getDevice, loadDevice } from './registry';
import type { DeviceDefinition } from './types';

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

/** 只存状态条需要的展示字段，且按秒级时间桶去重，避免 10Hz 快照驱动整树重渲染 */
interface DisplaySnapshot {
  ts: number;
  deviceId: string | null;
  protocol: string;
  mode: string | null;
  error: string | null;
}

/** 设备 chunk 加载失败后的退避窗口；期间仍按快照频率缓存 vars，不丢首帧 */
const RETRY_DELAY_MS = 1500;

/**
 * 观众工作区：只读跟随主控的 3D 镜像。
 *
 * 设计口径（2026-11-08 定稿）：装了软件的机器打开就是主控，其余设备
 * （智能电视 / 手机 / 学生机浏览器，均无软件）打开 http://<教师机IP>:5201/
 * 直接就是观众，不需要角色页、不需要参数、不需要点任何按钮。
 *
 * 按设备懒加载：只下载快照里那一个设备的实现；加载期间缓存最新 vars，
 * 设备就绪后补一次 applyBroadcast，避免切设备或慢网络时丢首帧。
 * 加载失败会回退设备 id 并按退避重试（下一帧快照驱动），不会永久卡住；
 * 主控离开时清空设备与镜像，避免角标已「等待主控」却残留旧 3D 画面。
 * 观众端零上行、无操作面板、自动重连、首次交互尝试全屏。
 */
export function ViewerWorkspace() {
  const [link, setLink] = useState<BridgeLink>('connecting');
  const [linkError, setLinkError] = useState('');
  const [display, setDisplay] = useState<DisplaySnapshot | null>(null);
  const [device, setDevice] = useState<DeviceDefinition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<DeviceDefinition | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const latestVarsRef = useRef<Record<string, boolean | number>>({});
  const loadSeqRef = useRef(0);
  const retryAtRef = useRef(0);
  const retryIdRef = useRef<string | null>(null);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = (target: DeviceDefinition | null, vars: Record<string, boolean | number>) => {
      try { target?.applyBroadcast?.(vars); } catch (e) { console.warn('applyBroadcast error:', e); }
    };

    /** 主控离开 / 快照清空设备：卸载旧场景并让在途加载结果失效 */
    const clearDevice = () => {
      deviceIdRef.current = null;
      deviceRef.current = null;
      latestVarsRef.current = {};
      retryAtRef.current = 0;
      retryIdRef.current = null;
      loadSeqRef.current += 1;
      setDevice(null);
      setLoadError(null);
    };

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
          const shown: DisplaySnapshot = {
            ts: Number(msg.ts) || Date.now(),
            deviceId: msg.deviceId ?? null,
            protocol: String(msg.protocol ?? ''),
            mode: msg.mode ?? null,
            error: msg.error ?? null,
          };
          setDisplay((prev) => (
            prev
              && Math.floor(prev.ts / 1000) === Math.floor(shown.ts / 1000)
              && prev.deviceId === shown.deviceId
              && prev.mode === shown.mode
              && prev.protocol === shown.protocol
              && prev.error === shown.error
              ? prev : shown
          ));
          const id = msg.deviceId ?? null;
          const vars = msg.vars ?? {};
          latestVarsRef.current = vars;
          if (!id) {
            clearDevice();
            return;
          }

          if (deviceIdRef.current !== id) {
            // 同一设备加载失败后退避，避免 chunk 404 时每帧重复 import
            if (retryIdRef.current === id && Date.now() < retryAtRef.current) return;
            retryIdRef.current = null;
            retryAtRef.current = 0;
            deviceIdRef.current = id;
            deviceRef.current = null;
            setDevice(null);
            setLoadError(null);
            const seq = ++loadSeqRef.current;
            const cached = getDevice(id);
            if (cached) {
              deviceRef.current = cached;
              setDevice(cached);
              apply(cached, vars);
            } else {
              loadDevice(id)
                .then((loadedDevice) => {
                  // 慢加载返回时主控可能已切到别的设备，丢弃过期结果
                  if (seq !== loadSeqRef.current || deviceIdRef.current !== id) return;
                  deviceRef.current = loadedDevice;
                  setDevice(loadedDevice);
                  setLoadError(null);
                  apply(loadedDevice, latestVarsRef.current);
                })
                .catch((e) => {
                  if (seq !== loadSeqRef.current || deviceIdRef.current !== id) return;
                  // 回退 id，让下一帧快照重新进入加载分支；不再永久卡「场景加载中」
                  deviceIdRef.current = null;
                  deviceRef.current = null;
                  retryIdRef.current = id;
                  retryAtRef.current = Date.now() + RETRY_DELAY_MS;
                  setDevice(null);
                  setLoadError(String((e && e.message) || e));
                  console.warn('[viewer] 设备加载失败，稍后重试:', e);
                });
            }
          } else if (deviceRef.current?.id === id) {
            apply(deviceRef.current, vars);
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

  /** 立即重试：清退避与 id，下一帧快照就会重新加载设备 */
  const retryNow = () => {
    retryAtRef.current = 0;
    retryIdRef.current = null;
    deviceIdRef.current = null;
    loadSeqRef.current += 1;
    setLoadError(null);
  };

  // 只跟随主控：设备完全由快照决定，观众端没有任何切换入口
  const activeDeviceId = display?.deviceId ?? null;
  const meta = activeDeviceId ? DEVICE_META.find((m) => m.id === activeDeviceId) : undefined;
  // 双校验：主控离开（activeDeviceId 为空）或设备尚未加载完成时都不渲染旧场景
  const Scene = activeDeviceId && device?.id === activeDeviceId ? device.SceneWrapper : undefined;
  const badge =
    link === 'online'
      ? { text: meta ? `跟随主控 · ${meta.name}` : '已连接 · 等待主控', cls: 'border-green-500/40 text-green-400 bg-green-500/10' }
      : link === 'connecting'
        ? { text: '连接服务中…', cls: 'border-slate-500/40 text-slate-300 bg-slate-500/10' }
        : { text: `连接失败 · 重试中…`, cls: 'border-red-500/40 text-red-400 bg-red-500/10' };

  return (
    <div
      className="relative w-screen h-screen bg-slate-900 overflow-hidden"
      data-viewer-link={link}
      data-viewer-device={activeDeviceId ?? ''}
      data-viewer-error={linkError}
      data-viewer-load-error={loadError ?? ''}
      data-viewer-mode={display?.mode ?? ''}
    >
      {!Scene || !device ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
          <div className="text-slate-300 text-sm">
            {link !== 'online'
              ? (link === 'connecting' ? '连接服务中…' : `连接失败：${linkError || '教师机未启动'} · 正在重试`)
              : loadError ? `场景加载失败：${loadError} · 正在重试`
                : activeDeviceId ? '场景加载中…' : '等待主控进入设备…'}
          </div>
          {loadError && (
            <button
              type="button"
              data-dt-viewer-retry
              onClick={retryNow}
              className="px-3 py-1.5 rounded-md border border-slate-600/60 bg-blue-700 text-white text-xs"
            >立即重试</button>
          )}
          <div className="text-slate-500 text-xs">
            本页为只读跟随模式 · 请在教师机上打开软件并进入设备
          </div>
        </div>
      ) : (
        <Scene key={activeDeviceId} SceneContent={device.SceneContent} cameraPosition={device.cameraPosition} />
      )}

      {/* 观众端无返回、无设备切换、无模式按钮：只剩状态角标 */}
      {/* 角标 / 状态条：刘海屏安全区 + 响应式字号 + 单行截断（旧版在 390px 竖屏会折成两行） */}
      <div
        className="absolute z-10 pointer-events-none max-w-[calc(100vw-2rem)]"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        <span className={`block truncate text-[0.7rem] sm:text-xs lg:text-sm px-2.5 py-1 rounded-full border backdrop-blur ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[calc(100vw-2rem)] px-3 sm:px-4 py-1.5 rounded-full border border-slate-600/40 bg-slate-900/70 backdrop-blur"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <span className="block truncate whitespace-nowrap font-mono text-[0.65rem] sm:text-xs lg:text-sm text-slate-400">
          {display ? (
            <>
              <span className="sm:hidden">{display.deviceId ?? '—'} · {new Date(display.ts).toLocaleTimeString()}</span>
              <span className="hidden sm:inline">
                {display.deviceId ?? '—'} · {display.protocol} · 更新于 {new Date(display.ts).toLocaleTimeString()}
                {display.error ? ` · ${display.error}` : ''}
              </span>
            </>
          ) : '等待数据…'}
        </span>
      </div>
    </div>
  );
}
