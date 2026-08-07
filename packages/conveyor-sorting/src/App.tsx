import { useEffect, useRef, useState } from 'react';
import { PhysicsScene, ModeSelector, HelpPanel, modbusService, useMobile } from '@digital-twin/shared';
import { ControlPanel, StatusPanel, DemoPanel, ScoringPanel, SimPanel, ViewControlPanel } from './components/panels';
import { ConveyorPlcConnection } from './platform/ConveyorPlcConnection';
import { buildHelpContent } from './constants/plc-addresses';
import { useDeviceStore } from './stores';
import { useDemoMode } from './hooks/useDemoMode';
import { useSimMode } from './hooks/useSimMode';
import { useConveyorScoring } from './hooks/useConveyorScoring';
import { ConveyorSortingSceneContent } from './scenes/conveyor-sorting/SceneContent';

function ConveyorScoringGate() {
  useConveyorScoring();
  return null;
}

function App() {
  const mode = useDeviceStore((s) => s.mode);
  const setMode = useDeviceStore((s) => s.setMode);
  const isConnected = useDeviceStore((s) => s.isConnected);

  const isMobile = useMobile();
  const prevModeRef = useRef(mode);
  const [showHelp, setShowHelp] = useState(false);

  const { state: demoState, isStarted: demoStarted, isPaused: demoPaused, startDemoMode, togglePause: demoTogglePause, resetDemo: demoReset } = useDemoMode();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__DEBUG__ = {
      getState: useDeviceStore.getState,
      setState: useDeviceStore.setState,
      spawnMaterial: () => { useDeviceStore.getState().spawnMaterial(); },
      clearMaterial: () => { useDeviceStore.getState().clearMaterial(); },
    };
  }, []);

  useEffect(() => {
    if (prevModeRef.current === mode) return;
    useDeviceStore.getState().setScoringRunning(false);
    if (isConnected) {
      void modbusService.disconnect().catch(() => undefined);
      useDeviceStore.getState().setConnected(false);
    }
    prevModeRef.current = mode;
  }, [mode, isConnected]);

  const {
    step: simStep, isSimulationRunning: simRunning, errorMessage: simError,
    stats: simStats, controlSignals: simControlSignals, publishAllFeedback: simPublishFeedback,
    onSimulationStart: simStart, onSimulationStop: simStop, onSimulationReset: simReset,
    onSpawnMaterial: simSpawnMaterial, onInitialize: simInitialize,
  } = useSimMode();

  // 根据当前模式选择对应面板（IIFE 避免向子组件透传大量 props）
  const desktopModePanel = (() => {
    if (mode === 'manual') {
      return (
        <div className="space-y-6">
          <ControlPanel />
          <StatusPanel />
        </div>
      );
    }
    if (mode === 'auto') {
      return (
        <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
          <DemoPanel demoState={demoState} isStarted={demoStarted} isPaused={demoPaused} onStart={startDemoMode} onTogglePause={demoTogglePause} onReset={demoReset} />
        </div>
      );
    }
    if (mode === 'scoring') {
      return (
        <>
          <ConveyorPlcConnection modeLabel="评分模式" />
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
            <ScoringPanel />
          </div>
        </>
      );
    }
    // sim mode
    return (
      <>
        <ConveyorPlcConnection modeLabel="仿真模式" />
        <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
          <SimPanel
            step={simStep} isSimulationRunning={simRunning} errorMessage={simError}
            stats={simStats} controlSignals={simControlSignals}
            onPublishAllFeedback={simPublishFeedback} onSimulationStart={simStart}
            onSimulationStop={simStop} onSimulationReset={simReset}
            onSpawnMaterial={simSpawnMaterial} onInitialize={simInitialize}
          />
        </div>
      </>
    );
  })();

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
        <PhysicsScene SceneContent={ConveyorSortingSceneContent} />
      </div>

      <ConveyorScoringGate />

      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <span className="text-white text-xl">⚙</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">传送带分拣控制</h1>
                <p className="text-xs text-gray-500">V1.1 · 老徐</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">运行模式</div>
            <ModeSelector currentMode={mode} onModeChange={setMode} />
          </div>

          <ViewControlPanel />
          {desktopModePanel}
        </div>
      )}

      {isMobile && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <ModeSelector currentMode={mode} onModeChange={setMode} />
              <button
                onClick={() => setShowHelp(true)}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-600/80 transition-colors text-xl"
              >
                ❓
              </button>
            </div>
            <div className="mt-4">
              {mode === 'manual' && <ControlPanel isMobile={true} />}
              {mode === 'auto' && <DemoPanel demoState={demoState} isStarted={demoStarted} isPaused={demoPaused} onStart={startDemoMode} onTogglePause={demoTogglePause} onReset={demoReset} />}
              {mode === 'scoring' && (<><ConveyorPlcConnection modeLabel="评分模式" /><ScoringPanel /></>)}
              {mode === 'sim' && <div className="text-white text-center py-4">请在电脑端运行仿真</div>}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-xs text-gray-600">© 2026 老徐 · 数字孪生仿真平台</div>

      {showHelp && <HelpPanel content={buildHelpContent()} onClose={() => setShowHelp(false)} />}
    </div>
  );
}

export default App;
