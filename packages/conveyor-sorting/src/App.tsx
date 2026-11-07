import { useEffect, useRef, useState } from 'react';
import { HelpPanel, modbusService, useMobile } from '@digital-twin/shared';
import { ControlPanel, StatusPanel, DemoPanel, ScoringPanel, SimPanel } from './components/panels';
import { ConveyorPlcConnection } from './platform/ConveyorPlcConnection';
import { ConveyorSceneWrapper } from './platform/ConveyorSceneWrapper';
import { buildHelpContent } from './constants/plc-addresses';
import { useDeviceStore, useConveyorViewStore } from './stores';
import { useDemoMode } from './hooks/useDemoMode';
import { useSimMode } from './hooks/useSimMode';
import { useConveyorScoring } from './hooks/useConveyorScoring';
import { ConveyorSortingSceneContent } from './scenes/conveyor-sorting/SceneContent';
import { VISUAL } from './scenes/conveyor-sorting/constants';
import { readMaterialSlideDebug } from './scenes/conveyor-sorting/materialSlideDebug';

/** 与自动配药 App 同款紧凑模式选择器（不再用共享 ModeSelector 的大标签） */
const MODES = [
  { key: 'manual', label: '手动' },
  { key: 'auto', label: '演示' },
  { key: 'scoring', label: '评分' },
  { key: 'sim', label: '仿真' },
] as const;

function ConveyorScoringGate() {
  useConveyorScoring();
  return null;
}

function App() {
  const mode = useDeviceStore((s) => s.mode);
  const setMode = useDeviceStore((s) => s.setMode);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const showLabels = useDeviceStore((s) => s.showLabels);
  const toggleLabels = useDeviceStore((s) => s.toggleLabels);
  const panelCollapsed = useConveyorViewStore((s) => s.panelCollapsed);

  const isMobile = useMobile();
  const prevModeRef = useRef(mode);
  const [showHelp, setShowHelp] = useState(false);

  const { state: demoState, isStarted: demoStarted, isPaused: demoPaused, startDemoMode, togglePause: demoTogglePause, resetDemo: demoReset } = useDemoMode();

  useEffect(() => {
    // 生产构建默认不暴露调试接口；CDP 验收时用 ?debug=1 显式打开
    const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;
    Object.assign(window, {
      __DEBUG__: {
        getState: useDeviceStore.getState,
        setState: useDeviceStore.setState,
        spawnMaterial: () => { useDeviceStore.getState().spawnMaterial(); },
        clearMaterial: () => { useDeviceStore.getState().clearMaterial(); },
        getMaterialSlide: readMaterialSlideDebug,
      },
    });
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

  // 面板自身已带 card / device-card，外壳不再叠一层玻璃卡片
  const modePanel = (() => {
    if (mode === 'manual') {
      return (
        <div className="space-y-3">
          <ControlPanel />
          <StatusPanel />
        </div>
      );
    }
    if (mode === 'auto') {
      return (
        <DemoPanel
          demoState={demoState} isStarted={demoStarted} isPaused={demoPaused}
          onStart={startDemoMode} onTogglePause={demoTogglePause} onReset={demoReset}
        />
      );
    }
    if (mode === 'scoring') {
      return (
        <div className="space-y-2">
          <ConveyorPlcConnection modeLabel="评分模式" />
          <ScoringPanel />
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <ConveyorPlcConnection modeLabel="仿真模式" />
        <SimPanel
          step={simStep} isSimulationRunning={simRunning} errorMessage={simError}
          stats={simStats} controlSignals={simControlSignals}
          onPublishAllFeedback={simPublishFeedback} onSimulationStart={simStart}
          onSimulationStop={simStop} onSimulationReset={simReset}
          onSpawnMaterial={simSpawnMaterial} onInitialize={simInitialize}
        />
      </div>
    );
  })();

  const modeTabs = (
    <div className="mode-tabs" role="tablist" aria-label="运行模式选择">
      {MODES.map((m) => (
        <button
          key={m.key} role="tab"
          aria-selected={mode === m.key}
          className={`mode-tab !text-[0.65rem] !py-1 touch-manipulation${mode === m.key ? ' mode-tab-active' : ''}`}
          onClick={() => setMode(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ width: '100vw', height: '100vh', background: VISUAL.SCENE_BACKGROUND, position: 'relative', overflow: 'hidden' }}>
      <div className="absolute inset-0">
        <ConveyorSceneWrapper SceneContent={ConveyorSortingSceneContent} showPanelToggle />
      </div>

      <ConveyorScoringGate />

      {/* 桌面端左侧 17rem 窄栏：与自动配药 App 完全同款布局 */}
      {!isMobile && !panelCollapsed && (
        <div
          className="absolute top-3 left-3 z-10 overflow-y-auto space-y-2 scrollbar-thin"
          style={{ width: '17rem', maxHeight: 'calc(100vh - 1.5rem)' }}
        >
          <div className="card !p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
                <span className="text-white text-[0.65rem]" aria-hidden="true">&#128230;</span>
              </div>
              <h1 className="text-xs font-bold text-white truncate">传送带分拣控制</h1>
              <button
                onClick={() => setShowHelp(true)}
                title="使用说明与地址映射"
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors text-sm"
              >
                ❓
              </button>
              <button
                onClick={toggleLabels}
                title="三维标签显示"
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors text-sm ${
                  showLabels
                    ? 'text-blue-400 hover:text-blue-300 hover:bg-slate-700/60'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                🏷
              </button>
            </div>
            {modeTabs}
          </div>
          {modePanel}
        </div>
      )}

      {/* 移动端：顶部迷你条 + 底部抽屉 */}
      {isMobile && (
        <>
          <div className="absolute top-2 left-2 right-2 z-10">
            <div className="bg-slate-900/95 border border-slate-700/50 rounded-xl px-2 py-1.5 shadow-2xl flex items-center gap-2">
              <div className="flex-1">{modeTabs}</div>
              <button
                onClick={() => setShowHelp(true)}
                title="使用说明与地址映射"
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white transition-colors text-base"
              >
                ❓
              </button>
            </div>
          </div>
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="bg-slate-900/95 border border-slate-700/50 rounded-2xl p-3 shadow-2xl max-h-[52vh] overflow-y-auto scrollbar-thin">
              {mode !== 'sim' && modePanel}
              {mode === 'sim' && <div className="text-slate-300 text-xs text-center py-4">请在电脑端运行仿真</div>}
            </div>
          </div>
        </>
      )}

      <div className="absolute bottom-2 right-3 text-[0.5rem] text-slate-600 select-none">
        &copy; 2026
      </div>

      {showHelp && <HelpPanel content={buildHelpContent()} onClose={() => setShowHelp(false)} />}
    </div>
  );
}

export default App;
