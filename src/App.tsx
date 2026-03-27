import { Scene, ConveyorBelt, Cylinder, Sensor, Material, MaterialTable, Label } from './components/scene';
import { CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION } from './components/scene/shared';
import { ModeSelector } from './components/ui';
import { ControlPanel, StatusPanel, DemoPanel, SyncPanel, SimPanel } from './components/panels';
import { useDeviceStore } from './stores';
import { usePhysics } from './hooks/usePhysics';
import { useSyncPhysics } from './hooks/useSyncPhysics';
import { useDemoMode } from './hooks/useDemoMode';
import { useSyncMode } from './hooks/useSyncMode';
import { useSimMode } from './hooks/useSimMode';

function App() {
  const { 
    mode, 
    setMode, 
    conveyorRunning, 
    cylinders, 
    sensors, 
    material,
    syncMaterial,
    detectionHistory,
  } = useDeviceStore();

  // 启用物理模拟（手动模式）
  usePhysics();

  // 演示模式
  const { state: demoState } = useDemoMode();

  // 同步模式
  const {
    step: syncStep,
    phase: syncPhase,
    round: syncRound,
    currentMaterialColor,
    mqttConfig,
    calibration,
    connect: mqttConnect,
    startCalibrate,
    placeMaterial,
    nextRound,
    resetCalibrate,
    startSync,
    disconnect: mqttDisconnect,
  } = useSyncMode();

  // 同步模式物理动画（校准完成后启用）
  const isSyncPhysicsEnabled = mode === 'sync' && syncStep === 'SYNCING';
  useSyncPhysics({
    enabled: isSyncPhysicsEnabled,
    calibration: {
      phase1Time: calibration.phase1Time,
      phase2Time: calibration.phase2Time,
    },
  });

  // 仿真模式
  const {
    step: simStep,
    errorMessage: simError,
    mqttConfig: simMqttConfig,
    stats: simStats,
    connect: simConnect,
    disconnect: simDisconnect,
    publishAllFeedback: simPublishFeedback,
  } = useSimMode();



  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      {/* 3D 场景 */}
      <div className="absolute inset-0">
        <Scene>
          <ConveyorBelt running={conveyorRunning} />
          
          {/* 物料台 - 物料初始位置下方 */}
          <MaterialTable position={MATERIAL_TABLE_POSITION} />
          <Label text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />
          
          {/* 气缸 */}
          <Cylinder position={CYLINDER_POSITIONS.feed} extended={cylinders.feed.extended} />
          <Label text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />
          
          <Cylinder position={CYLINDER_POSITIONS.sorting1} extended={cylinders.sorting1.extended} />
          <Label text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />
          
          <Cylinder position={CYLINDER_POSITIONS.sorting2} extended={cylinders.sorting2.extended} />
          <Label text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />
          
          {/* 传感器 */}
          <Sensor position={SENSOR_POSITIONS.feed} active={sensors.feed} type="feed" />
          <Label text="上料传感器" position={SENSOR_POSITIONS.feed} offset={[0, 0.2, 0]} color="green" />
          
          <Sensor position={SENSOR_POSITIONS.color} active={sensors.color} type="color" />
          <Label text="色标传感器" position={SENSOR_POSITIONS.color} offset={[0, 0.2, 0]} color="orange" />
          
          <Sensor position={SENSOR_POSITIONS.material} active={sensors.material} type="material" />
          <Label text="物料传感器" position={SENSOR_POSITIONS.material} offset={[0, 0.2, 0]} color="green" />
          
          {/* 物料 - 手动/演示/仿真模式 */}
          {material.visible && (mode === 'manual' || mode === 'auto' || mode === 'sim') && (
            <Material 
              position={material.position} 
              color={material.color} 
              visible={material.visible} 
            />
          )}
          
          {/* 物料 - 同步模式 */}
          {syncMaterial.visible && mode === 'sync' && (
            <Material 
              position={syncMaterial.position} 
              color={syncMaterial.color} 
              visible={syncMaterial.visible} 
            />
          )}
        </Scene>
      </div>

      {/* 左侧控制面板 */}
      <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto">
        {/* 项目信息 */}
        <div className="glass-enhanced rounded-2xl p-5 mb-6 gradient-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-xl">⚙️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                数字孪生传送带系统
              </h1>
              <p className="text-xs text-gray-400">V3 · React + Three.js + TypeScript</p>
            </div>
          </div>
        </div>

        {/* 模式选择 */}
        <div className="glass-enhanced rounded-2xl p-5 mb-6 gradient-border">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">运行模式</div>
          <ModeSelector currentMode={mode} onModeChange={setMode} />
        </div>

        {/* 根据模式显示不同面板 */}
        {mode === 'manual' && (
          <div className="space-y-6">
            <ControlPanel />
            <StatusPanel />
          </div>
        )}

        {mode === 'auto' && (
          <div className="glass-enhanced rounded-2xl p-5 gradient-border">
            <DemoPanel demoState={demoState} />
          </div>
        )}

        {mode === 'sync' && (
          <div className="glass-enhanced rounded-2xl p-5 gradient-border">
            <SyncPanel 
              step={syncStep}
              phase={syncPhase}
              round={syncRound}
              currentMaterialColor={currentMaterialColor}
              mqttConfig={mqttConfig}
              calibration={calibration}
              detectionHistory={detectionHistory}
              onConnect={mqttConnect}
              onStartCalibrate={startCalibrate}
              onPlaceMaterial={placeMaterial}
              onNextRound={nextRound}
              onResetCalibrate={resetCalibrate}
              onStartSync={startSync}
              onDisconnect={mqttDisconnect}
            />
          </div>
        )}

        {mode === 'sim' && (
          <div className="glass rounded-xl p-4 gradient-border">
            <SimPanel 
              step={simStep}
              errorMessage={simError}
              mqttConfig={simMqttConfig}
              stats={simStats}
              sensors={sensors}
              cylinders={cylinders}
              conveyorRunning={conveyorRunning}
              onConnect={simConnect}
              onDisconnect={simDisconnect}
              onPublishAllFeedback={simPublishFeedback}
            />
          </div>
        )}
      </div>

      {/* 版本信息 */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-600">
        Digital Twin V3
      </div>
    </div>
  );
}

export default App;