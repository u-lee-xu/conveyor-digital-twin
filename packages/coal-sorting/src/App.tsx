import { useEffect } from 'react';
import { PhysicsScene, ModeSelector, modbusService, useMobile } from '@digital-twin/shared';
import { useAppStore } from './stores/useAppStore';
import { BeltControlPanel } from './scenes/coal-sorting/panels/BeltControlPanel';
import { BeltStatusPanel } from './scenes/coal-sorting/panels/BeltStatusPanel';
import { BeltDemoPanel } from './scenes/coal-sorting/panels/BeltDemoPanel';
import { BeltSimPanel } from './scenes/coal-sorting/panels/BeltSimPanel';
import { BeltScoringPanel } from './scenes/coal-sorting/panels/BeltScoringPanel';
import { ThreeStageBeltSceneContent } from './scenes/coal-sorting/SceneContent';

function App() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const isConnected = useAppStore((s) => s.isConnected);
  const isMobile = useMobile();

  // Mode change: disconnect PLC
  useEffect(() => {
    if (isConnected) {
      void modbusService.disconnect().catch(() => undefined);
      useAppStore.getState().setConnected(false);
    }
  }, [mode]);

  // 根据当前模式选择对应面板（IIFE 避免向子组件透传大量 props）
  const desktopModePanel = (() => {
    if (mode === 'manual') {
      return (
        <div className="space-y-6">
          <BeltControlPanel />
          <BeltStatusPanel />
        </div>
      );
    }
    if (mode === 'auto') {
      return (
        <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
          <BeltDemoPanel />
        </div>
      );
    }
    if (mode === 'scoring') {
      return (
        <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
          <BeltScoringPanel />
        </div>
      );
    }
    // sim mode
    return (
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
        <BeltSimPanel />
      </div>
    );
  })();

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
        <PhysicsScene SceneContent={ThreeStageBeltSceneContent} cameraPosition={[0, 6, 10]} />
      </div>

      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <span className="text-white text-xl">⛏</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">煤料智能分拣系统</h1>
                <p className="text-xs text-gray-500">V2.0 · 老徐</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">运行模式</div>
            <ModeSelector currentMode={mode} onModeChange={setMode} />
          </div>

          {desktopModePanel}
        </div>
      )}

      {isMobile && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
            <ModeSelector currentMode={mode} onModeChange={setMode} />
            <div className="mt-4">
              {mode === 'manual' && <BeltControlPanel />}
              {mode === 'auto' && <BeltDemoPanel />}
              {mode === 'scoring' && <BeltScoringPanel />}
              {mode === 'sim' && <BeltSimPanel />}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-xs text-gray-600">© 2026 老徐 · 煤料智能分拣系统</div>
    </div>
  );
}

export default App;
