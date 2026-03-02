import { useState } from 'react';
import { Scene, ConveyorBelt, Cylinder, Sensor, Material, MaterialTable } from './components/scene';
import { CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION } from './components/scene/shared';
import { ModeSelector } from './components/ui';
import { ControlPanel, StatusPanel, DemoPanel, SyncPanel } from './components/panels';
import { useDeviceStore } from './stores';
import { usePhysics } from './hooks/usePhysics';
import { useSyncPhysics } from './hooks/useSyncPhysics';
import { useDemoMode } from './hooks/useDemoMode';
import { useSyncMode } from './hooks/useSyncMode';

function App() {
  const [panelCollapsed, setPanelCollapsed] = useState(false);
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

  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative">
      {/* 3D 场景 */}
      <div className="absolute inset-0">
        <Scene>
          <ConveyorBelt running={conveyorRunning} />
          
          {/* 物料台 - 物料初始位置下方 */}
          <MaterialTable position={MATERIAL_TABLE_POSITION} />
          
          {/* 气缸 */}
          <Cylinder position={CYLINDER_POSITIONS.feed} extended={cylinders.feed.extended} />
          <Cylinder position={CYLINDER_POSITIONS.sorting1} extended={cylinders.sorting1.extended} />
          <Cylinder position={CYLINDER_POSITIONS.sorting2} extended={cylinders.sorting2.extended} />
          
          {/* 传感器 */}
          <Sensor position={SENSOR_POSITIONS.feed} active={sensors.feed} type="feed" />
          <Sensor position={SENSOR_POSITIONS.color} active={sensors.color} type="color" />
          <Sensor position={SENSOR_POSITIONS.material} active={sensors.material} type="material" />
          
          {/* 物料 - 手动/演示模式 */}
          {material.visible && mode !== 'sync' && (
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
      <div 
        className={`
          absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)]
          overflow-y-auto transition-transform duration-300
          ${panelCollapsed ? '-translate-x-96' : 'translate-x-0'}
        `}
      >
        {/* 项目信息 */}
        <div className="glass rounded-xl p-4 mb-4 gradient-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white text-lg">⚙️</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white">
                数字孪生传送带系统
              </h1>
              <p className="text-xs text-gray-500">V3 · React + Three.js + TypeScript</p>
            </div>
          </div>
        </div>

        {/* 模式选择 */}
        <div className="glass rounded-xl p-4 mb-4 gradient-border">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">运行模式</div>
          <ModeSelector currentMode={mode} onModeChange={setMode} />
        </div>

        {/* 根据模式显示不同面板 */}
        {mode === 'manual' && (
          <div className="glass rounded-xl p-4 gradient-border">
            <ControlPanel />
            <StatusPanel />
          </div>
        )}

        {mode === 'auto' && (
          <div className="glass rounded-xl p-4 gradient-border">
            <DemoPanel demoState={demoState} />
          </div>
        )}

        {mode === 'sync' && (
          <div className="glass rounded-xl p-4 gradient-border">
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
            <div className="text-center py-8">
              <span className="text-4xl">🧪</span>
              <p className="text-gray-400 text-sm mt-3">仿真模式</p>
              <p className="text-gray-600 text-xs mt-1">开发中...</p>
            </div>
          </div>
        )}
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setPanelCollapsed(!panelCollapsed)}
        className="absolute top-4 z-20 w-8 h-8 rounded-lg
                   glass border border-gray-700/50
                   text-gray-400 hover:text-white transition-colors
                   flex items-center justify-center text-sm"
        style={{ left: panelCollapsed ? '1rem' : '21rem' }}
      >
        {panelCollapsed ? '▶' : '◀'}
      </button>

      {/* 版本信息 */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-600">
        Digital Twin V3
      </div>
    </div>
  );
}

export default App;