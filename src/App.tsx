import { useEffect, useRef, useState } from 'react';
import { Scene, ConveyorBelt, Cylinder, Sensor, Material, MaterialTable, Label, SignalTower } from './components/scene';
import { PhysicsScene } from './components/scene/PhysicsScene';
import { CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION } from './components/scene/shared';
import { ModeSelector } from './components/ui';
import { ControlPanel, StatusPanel, DemoPanel, PlcConnectionPanel, ScoringPanel, SimPanel, ViewControlPanel, PlcHelpPanel } from './components/panels';
import { useDeviceStore } from './stores';
import { usePhysics } from './hooks/usePhysics';
import { useDemoMode } from './hooks/useDemoMode';
import { useSimMode } from './hooks/useSimMode';
import { useConveyorScoring } from './hooks/useConveyorScoring';
import { modbusService } from './services/modbus-websocket';

function App() {
  const mode = useDeviceStore((s) => s.mode);
  const setMode = useDeviceStore((s) => s.setMode);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const cylinders = useDeviceStore((s) => s.cylinders);
  const sensors = useDeviceStore((s) => s.sensors);
  const material = useDeviceStore((s) => s.material);
  const showLabels = useDeviceStore((s) => s.showLabels);
  const signalTower = useDeviceStore((s) => s.signalTower);
  const useNewPhysics = useDeviceStore((s) => s.useNewPhysics);
  const setUseNewPhysics = useDeviceStore((s) => s.setUseNewPhysics);

  const [isMobile, setIsMobile] = useState(false);
  const [showPlcHelp, setShowPlcHelp] = useState(false);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  usePhysics();
  useConveyorScoring();
  const { state: demoState, isStarted: demoStarted, isPaused: demoPaused, startDemoMode, togglePause: demoTogglePause, resetDemo: demoReset } = useDemoMode();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__DEBUG__ = {
      getState: useDeviceStore.getState,
      setState: useDeviceStore.setState,
      spawnMaterial: () => {
        useDeviceStore.getState().spawnMaterial();
      },
      clearMaterial: () => {
        useDeviceStore.getState().clearMaterial();
      },
    };
  }, []);

  useEffect(() => {
    if (prevModeRef.current === mode) {
      return;
    }

    useDeviceStore.getState().setScoringRunning(false);

    if (isConnected) {
      void modbusService.disconnect().catch(() => undefined);
      useDeviceStore.getState().setConnected(false);
    }

    prevModeRef.current = mode;
  }, [mode, isConnected]);

  const {
    step: simStep,
    isSimulationRunning: simRunning,
    errorMessage: simError,
    stats: simStats,
    controlSignals: simControlSignals,
    publishAllFeedback: simPublishFeedback,
    onSimulationStart: simStart,
    onSimulationStop: simStop,
    onSimulationReset: simReset,
    onSpawnMaterial: simSpawnMaterial,
    onInitialize: simInitialize,
  } = useSimMode();

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
          <PlcConnectionPanel mode="scoring" />
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
            <ScoringPanel />
          </div>
        </>
      );
    }

    return (
      <>
        <PlcConnectionPanel mode="sim" />
        <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
          <SimPanel
            step={simStep}
            isSimulationRunning={simRunning}
            errorMessage={simError}
            stats={simStats}
            controlSignals={simControlSignals}
            sensors={sensors}
            cylinders={cylinders}
            conveyorRunning={conveyorRunning}
            onPublishAllFeedback={simPublishFeedback}
            onSimulationStart={simStart}
            onSimulationStop={simStop}
            onSimulationReset={simReset}
            onSpawnMaterial={simSpawnMaterial}
            onInitialize={simInitialize}
          />
        </div>
      </>
    );
  })();

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
        {useNewPhysics ? (
          <PhysicsScene />
        ) : (
          <Scene>
            <ConveyorBelt running={conveyorRunning} />

            <MaterialTable position={MATERIAL_TABLE_POSITION} />
            {showLabels && (
              <Label key="material-table" text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />
            )}

            <Cylinder name="feed" position={CYLINDER_POSITIONS.feed} extended={cylinders.feed.extended} />
            {showLabels && (
              <Label key="feed-cylinder" text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />
            )}

            <Cylinder name="sorting1" position={CYLINDER_POSITIONS.sorting1} extended={cylinders.sorting1.extended} />
            {showLabels && (
              <Label key="sorting1-cylinder" text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />
            )}

            <Cylinder name="sorting2" position={CYLINDER_POSITIONS.sorting2} extended={cylinders.sorting2.extended} />
            {showLabels && (
              <Label key="sorting2-cylinder" text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />
            )}

            <Sensor position={SENSOR_POSITIONS.feed} active={sensors.feed} type="feed" />
            {showLabels && (
              <Label key="feed-sensor" text="上料传感器" position={SENSOR_POSITIONS.feed} offset={[0, 0.2, 0]} color="green" />
            )}

            <Sensor position={SENSOR_POSITIONS.color} active={sensors.color} type="color" />
            {showLabels && (
              <Label key="color-sensor" text="色标传感器" position={SENSOR_POSITIONS.color} offset={[0, 0.2, 0]} color="orange" />
            )}

            <Sensor position={SENSOR_POSITIONS.material} active={sensors.material} type="material" />
            {showLabels && (
              <Label key="material-sensor" text="物料传感器" position={SENSOR_POSITIONS.material} offset={[0, 0.2, 0]} color="green" />
            )}

            {material.visible && (
              <Material
                position={material.position}
                color={material.color}
                visible={material.visible}
              />
            )}

            <SignalTower
              position={[1.6, 0.98, -0.5]}
              red={signalTower.red}
              green={signalTower.green}
              yellow={signalTower.yellow}
            />
            {showLabels && (
              <Label key="signal-tower" text="信号灯塔" position={[1.6, 0.98, -0.5]} offset={[0, 1.1, 0]} color="yellow" />
            )}
          </Scene>
        )}
      </div>

      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <span className="text-white text-xl">⚙</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">数字孪生传送带系统</h1>
                  <p className="text-xs text-gray-500">V1.0 · 老徐</p>
                </div>
              </div>
              <button
                onClick={() => setShowPlcHelp(true)}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 hover:text-blue-300 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                title="PLC配置指南"
              >
                📖 使用指南
              </button>
            </div>
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">运行模式</div>
            <ModeSelector currentMode={mode} onModeChange={setMode} />
          </div>

          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">物理引擎</div>
            <div className="flex gap-2">
              <button
                onClick={() => setUseNewPhysics(false)}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  !useNewPhysics
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                旧物理引擎
              </button>
              <button
                onClick={() => setUseNewPhysics(true)}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  useNewPhysics
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Rapier物理（Beta）
              </button>
            </div>
          </div>

          <ViewControlPanel />

          {desktopModePanel}
        </div>
      )}

      {isMobile && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
            <ModeSelector currentMode={mode} onModeChange={setMode} />
            <div className="mt-4">
              {mode === 'manual' && <ControlPanel isMobile={true} />}
              {mode === 'auto' && <DemoPanel demoState={demoState} isStarted={demoStarted} isPaused={demoPaused} onStart={startDemoMode} onTogglePause={demoTogglePause} onReset={demoReset} />}
              {mode === 'scoring' && (
                <>
                  <PlcConnectionPanel mode="scoring" />
                  <ScoringPanel />
                </>
              )}
              {mode === 'sim' && <div className="text-white text-center py-4">请在电脑端运行仿真</div>}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-xs text-gray-600">© 2026 老徐 · 数字孪生传送带系统</div>

      {showPlcHelp && (
        <PlcHelpPanel onClose={() => setShowPlcHelp(false)} />
      )}
    </div>
  );
}

export default App;
