import { useEffect, useRef, useState } from 'react';
import { Scene, ConveyorBelt, Cylinder, Sensor, Material, MaterialTable, Label } from './components/scene';
import { CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION } from './components/scene/shared';
import { ModeSelector } from './components/ui';
import { ControlPanel, StatusPanel, DemoPanel, PlcConnectionPanel, ScoringPanel, SimPanel } from './components/panels';
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

  const [isMobile, setIsMobile] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
      setShowLabels(window.innerWidth >= 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  usePhysics();
  useConveyorScoring();
  const { state: demoState } = useDemoMode();

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
          <DemoPanel demoState={demoState} />
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
          />
        </div>
      </>
    );
  })();

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      <div className="absolute inset-0">
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
        </Scene>
      </div>

      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <span className="text-white text-xl">⚙</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">数字孪生传送带系统</h1>
                <p className="text-xs text-slate-400">V3 / React + Three.js</p>
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
              {mode === 'manual' && <ControlPanel isMobile={true} />}
              {mode === 'auto' && <DemoPanel demoState={demoState} />}
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

      <div className="absolute bottom-4 right-4 text-xs text-gray-600">Digital Twin V3</div>
    </div>
  );
}

export default App;
