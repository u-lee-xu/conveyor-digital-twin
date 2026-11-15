import { useEffect, useRef, useState } from 'react';
import { ModeSelector, HelpPanel, useMobile, relayWsUrl, loadViewerUrls, diffSnapshot, sanitizeSnapshot } from '@digital-twin/shared';
import type { DeviceDefinition } from './types';

interface WorkspaceShellProps {
  device: DeviceDefinition;
  onBack: () => void;
}

export function WorkspaceShell({ device, onBack }: WorkspaceShellProps) {
  const isMobile = useMobile();
  const [showHelp, setShowHelp] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  /** 桌面端左侧操作面板可收起，露出完整 3D 视口（宽屏设备整机观察用） */
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [relayRejected, setRelayRejected] = useState(false);
  const { mode, setMode } = device.useModeState();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onModeChangeRef = useRef(device.onModeChange);
  onModeChangeRef.current = device.onModeChange;

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    onModeChangeRef.current?.(mode);
  }, [mode]);

  const onCleanupRef = useRef(device.onCleanup);
  onCleanupRef.current = device.onCleanup;
  useEffect(() => {
    return () => { onCleanupRef.current?.(); };
  }, [device.id]);

  /**
   * 给观众的地址：运行时由同源 location.host + 服务端实时网卡表生成候选，
   * 绝不读启动时固化的单一 IP。多网卡/换网时老师可点 ⇄ 切换后再复制。
   */
  const [viewerUrls, setViewerUrls] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadViewerUrls().then((urls) => {
      if (!cancelled) { setViewerUrls(urls); setViewerIndex(0); }
    });
    return () => { cancelled = true; };
  }, []);
  const viewerUrl = viewerUrls[viewerIndex] ?? '';
  const copyViewerUrl = () => { if (viewerUrl) void navigator.clipboard?.writeText(viewerUrl); };
  const cycleViewerUrl = () => setViewerIndex((i) => (i + 1) % Math.max(1, viewerUrls.length));

  /**
   * 主控上报：把设备 store 的渲染态单向推给中继，观众端做只读镜像。
   * 中继不连 PLC，因此演示 / 手动模式（未连 PLC）观众同样能看到画面。
   * 中继未启动时主控仍可单机练习，连接失败静默重试，不影响本地功能。
   */
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let reportTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (closed) return;
      // 每条 WS 连接独立维护差分基线：重连后首帧必须全量，否则会与中继释放后的空镜像合并
      let lastVars: Record<string, boolean | number> = {};
      let lastMode: string | null = null;
      let sentFull = false;
      try {
        ws = new WebSocket(relayWsUrl());
      } catch {
        reconnectTimer = setTimeout(open, 3000);
        return;
      }
      ws.onopen = () => {
        setRelayRejected(false);
        const report = () => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const next = device.exportSnapshot?.() ?? {};
          const currentMode = String(modeRef.current);
          // 首帧 / 重连 / 切模式一律发全量，避免旧设备或旧模式的键残留在新画面里
          const full = !sentFull || currentMode !== lastMode;
          ws.send(JSON.stringify({
            type: 'report',
            deviceId: device.id,
            mode: currentMode,
            // 全量帧丢掉非有限值，避免 JSON 把 NaN 变 null 被中继误当删除标记
            vars: full ? sanitizeSnapshot(next) : diffSnapshot(lastVars, next),
            delta: !full,
          }));
          lastVars = { ...next };
          lastMode = currentMode;
          sentFull = true;
        };
        report();
        reportTimer = setInterval(report, 100);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type?: string };
          if (msg.type === 'rejected') {
            clearInterval(reportTimer);
            setRelayRejected(true);
            // 原主控退出后自动接管：重建连接，onopen 会重新 report 并清除提示
            if (!closed) reconnectTimer = setTimeout(() => ws?.close(), 3000);
          }
        } catch {
          // 忽略非法消息
        }
      };
      ws.onclose = () => {
        clearInterval(reportTimer);
        if (!closed) reconnectTimer = setTimeout(open, 3000);
      };
      ws.onerror = () => ws?.close();
    };

    open();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(reportTimer);
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'leave' }));
        }
        ws?.close();
      } catch {
        // 连接已关闭
      }
    };
  }, [device]);

  const activeMode = device.modes.find((m) => m.id === mode) ?? device.modes[0];
  const ModePanel = activeMode?.panel;
  const Extras = device.sidebarExtras;
  const Effects = device.effects;
  // 7 个设备都自带 SceneWrapper；不再静态兜底 PhysicsScene，否则 Rapier 会进入每个设备分包
  const Scene = device.SceneWrapper;

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
        {Scene && <Scene SceneContent={device.SceneContent} cameraPosition={device.cameraPosition} />}
      </div>

      {Effects && <Effects />}

      {relayRejected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="block rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[0.7rem] text-amber-300 backdrop-blur">
            已有主控在演示
          </span>
        </div>
      )}

      {!isMobile && panelCollapsed && (
        <button
          type="button"
          onClick={() => setPanelCollapsed(false)}
          title="展开左侧操作面板"
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 text-slate-200 text-xs shadow-xl hover:text-white transition-colors"
        >
          <span>▶</span>
          <span>展开面板</span>
        </button>
      )}

      {!isMobile && !panelCollapsed && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-3 mb-6 shadow-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors btn-active"
              >
                <span>←</span>
                <span>返回设备选择</span>
              </button>
              <button
                type="button"
                onClick={() => setPanelCollapsed(true)}
                title="收起面板，露出完整 3D 视口"
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-slate-700/60 transition-colors"
              >
                <span>◀</span>
                <span>收起面板</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${device.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                <span className="text-white text-xl">{device.icon}</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">{device.name}</h1>
                <p className="text-xs text-gray-500">V{device.version} · 老徐</p>
              </div>
              {device.helpContent && (
                <button
                  onClick={() => setShowHelp(true)}
                  title="使用说明与地址映射"
                  className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-600/80 transition-colors text-lg"
                >
                  ❓
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">运行模式</div>
            <ModeSelector currentMode={mode} onModeChange={setMode} modes={device.modes} />
          </div>

          {Extras && <Extras />}
          {ModePanel && <ModePanel />}
        </div>
      )}

      {isMobile && (
        <>
          {/* 收起态：底部悬浮操作条（不遮场景主体） */}
          <div
            className="absolute left-3 right-3 z-10"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-xl border border-slate-700/50 rounded-2xl px-2.5 py-2 shadow-xl">
              <button
                onClick={onBack}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-300 hover:text-white transition-colors btn-active text-sm shrink-0"
                aria-label="返回"
              >
                <span>←</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{device.icon} {device.name}</div>
                <div className="text-[0.65rem] text-gray-400 truncate">
                  {device.modes.find((m) => m.id === mode)?.label ?? mode}
                </div>
              </div>
              {/* 紧凑模式切换（不打开抽屉也能换模式） */}
              <div className="flex items-center gap-1 shrink-0">
                {device.modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    aria-label={m.label}
                    className={`w-9 h-9 flex items-center justify-center rounded-xl text-base transition-all ${
                      mode === m.id
                        ? `bg-gradient-to-br ${m.color} text-white shadow-md scale-105`
                        : 'bg-dark-800 text-gray-400 border border-dark-600 hover:border-gray-500'
                    }`}
                  >
                    {m.icon}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPanelOpen((v) => !v)}
                aria-label={panelOpen ? '收起面板' : '展开面板'}
                className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm transition-colors shrink-0 ${
                  panelOpen
                    ? 'bg-slate-600/80 text-white'
                    : 'bg-slate-700/60 border border-slate-600/50 text-slate-200'
                }`}
              >
                {panelOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {/* 展开态：底部抽屉（可滚动，最高 58vh，其余留白给 3D 场景） */}
          {panelOpen && (
            <div
              className="absolute left-3 right-3 z-10 max-h-[58vh] overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-900/95 backdrop-blur-2xl p-4 shadow-2xl"
              style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.5rem)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">{device.icon} {device.name}</span>
                {device.helpContent && (
                  <button
                    onClick={() => setShowHelp(true)}
                    title="使用说明与地址映射"
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-600/80 transition-colors text-lg"
                  >
                    ❓
                  </button>
                )}
              </div>
              <ModeSelector currentMode={mode} onModeChange={setMode} modes={device.modes} />
              {/* 紧凑布局没有底部地址条的位置，观众访问地址收进抽屉，仍可一键复制 */}
              {viewerUrl && (
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={copyViewerUrl}
                    title="点击复制观众访问地址"
                    className="min-w-0 flex-1 truncate rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-left text-[0.7rem] text-blue-300"
                  >
                    观众访问 {viewerUrl} · 点击复制
                  </button>
                  {viewerUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={cycleViewerUrl}
                      title="切换其它可用网卡地址"
                      className="shrink-0 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2 py-2 text-[0.7rem] text-slate-300"
                    >
                      {viewerIndex + 1}/{viewerUrls.length} ⇄
                    </button>
                  )}
                </div>
              )}
              <div className="mt-4">
                {ModePanel && <ModePanel isMobile={true} />}
              </div>
            </div>
          )}
        </>
      )}

      {viewerUrl && !isMobile && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-600/40 bg-slate-900/80 backdrop-blur text-[0.7rem] text-slate-300">
          <span className="shrink-0">观众访问</span>
          <button
            type="button"
            title="点击复制观众地址"
            onClick={copyViewerUrl}
            className="font-mono text-blue-300 hover:text-white transition-colors"
          >
            {viewerUrl}
          </button>
          {viewerUrls.length > 1 && (
            <button
              type="button"
              onClick={cycleViewerUrl}
              title="切换其它可用网卡地址"
              className="shrink-0 rounded-md border border-slate-600/50 px-1.5 py-0.5 text-slate-300 hover:text-white transition-colors"
            >
              {viewerIndex + 1}/{viewerUrls.length} ⇄
            </button>
          )}
        </div>
      )}
      {!isMobile && (
        <div className="absolute bottom-4 right-4 text-xs text-gray-600">© 2026 老徐 · 数字孪生仿真平台</div>
      )}

      {device.helpContent && showHelp && (
        <HelpPanel content={device.helpContent} onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
