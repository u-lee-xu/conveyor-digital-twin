import { useEffect, useRef, useState } from 'react';
import { PhysicsScene, ModeSelector, HelpPanel, useMobile } from '@digital-twin/shared';
import type { DeviceDefinition } from './types';

interface WorkspaceShellProps {
  device: DeviceDefinition;
  onBack: () => void;
}

export function WorkspaceShell({ device, onBack }: WorkspaceShellProps) {
  const isMobile = useMobile();
  const [showHelp, setShowHelp] = useState(false);
  const { mode, setMode } = device.useModeState();
  const onModeChangeRef = useRef(device.onModeChange);
  onModeChangeRef.current = device.onModeChange;

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    onModeChangeRef.current?.(mode);
  }, [mode]);

  useEffect(() => {
    return () => {
      device.onCleanup?.();
    };
  }, [device]);

  // 边缘部署：进入设备工作区时向广播服务上报激活设备（观众端自动跟随）；离开时上报 null（观众等待）
  useEffect(() => {
    const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`ws://${host}:8082`);
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'set-device', deviceId: device.id }));
      ws.onerror = () => ws?.close();
    } catch {
      ws = null;
    }
    return () => {
      // 主控离开工作区：通知广播清空激活设备（观众端黑屏等待）
      try {
        const bye = new WebSocket(`ws://${host}:8082`);
        bye.onopen = () => bye.send(JSON.stringify({ type: 'set-device', deviceId: null }));
        bye.onerror = () => bye.close();
      } catch {
        // 非边缘环境无广播服务，静默
      }
      ws?.close();
    };
  }, [device.id]);

  const activeMode = device.modes.find((m) => m.id === mode) ?? device.modes[0];
  const ModePanel = activeMode?.panel;
  const Extras = device.sidebarExtras;
  const Effects = device.effects;
  const Scene = device.SceneWrapper ?? PhysicsScene;

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
        <Scene SceneContent={device.SceneContent} cameraPosition={device.cameraPosition} />
      </div>

      {Effects && <Effects />}

      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-3 mb-6 shadow-xl">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors btn-active"
            >
              <span>←</span>
              <span>返回设备选择</span>
            </button>
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

      {isMobile && ModePanel && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors btn-active"
              >
                <span>←</span>
                <span>返回</span>
              </button>
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
            <div className="mt-4">
              <ModePanel isMobile={true} />
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-xs text-gray-600">© 2026 老徐 · 数字孪生仿真平台</div>

      {device.helpContent && showHelp && (
        <HelpPanel content={device.helpContent} onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
