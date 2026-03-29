import { useState, useEffect } from 'react';
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

  // 移动端适配状态
  const [isMobile, setIsMobile] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // 检测是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
      // 移动端默认隐藏标签
      setShowLabels(window.innerWidth >= 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 启用物理模拟（手动模式）
  usePhysics();

  // 演示模式
  const { state: demoState } = useDemoMode();

  // 开发模式下暴露调试接口（移除环境检查，便于测试）
  useEffect(() => {
    (window as any).__DEBUG__ = {
        getState: useDeviceStore.getState,
        setState: useDeviceStore.setState,
        updateMaterialPosition: (pos: [number, number, number]) => {
          useDeviceStore.setState((state) => ({
            material: {
              ...state.material,
              position: pos,
            },
          }));
        },
        extendCylinder: (name: 'feed' | 'sorting1' | 'sorting2') => {
          useDeviceStore.setState((state) => ({
            cylinders: {
              ...state.cylinders,
              [name]: { extended: true },
            },
          }));
        },
        retractCylinder: (name: 'feed' | 'sorting1' | 'sorting2') => {
          useDeviceStore.setState((state) => ({
            cylinders: {
              ...state.cylinders,
              [name]: { extended: false },
            },
          }));
        },
        spawnMaterial: () => {
          useDeviceStore.getState().spawnMaterial();
        },
        clearMaterial: () => {
          useDeviceStore.getState().clearMaterial();
        },
        getMaterialPosition: () => {
          return useDeviceStore.getState().material.position;
        },
      };
      console.log('调试接口已暴露到 window.__DEBUG__');
      console.log('可用命令:');
      console.log('  window.__DEBUG__.updateMaterialPosition([x, y, z]) - 设置物料位置');
      console.log('  window.__DEBUG__.extendCylinder("sorting1") - 伸出分拣1气缸');
      console.log('  window.__DEBUG__.retractCylinder("sorting1") - 缩回分拣1气缸');
      console.log('  window.__DEBUG__.spawnMaterial() - 生成物料');
      console.log('  window.__DEBUG__.clearMaterial() - 清除物料');
      console.log('  window.__DEBUG__.getMaterialPosition() - 获取物料位置');
      console.log('  window.__DEBUG__.getState() - 获取完整状态');
  }, []);

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
          {showLabels && (
            <Label key="material-table" text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />
          )}
          
          {/* 气缸 */}
          <Cylinder position={CYLINDER_POSITIONS.feed} extended={cylinders.feed.extended} />
          {showLabels && (
            <Label key="feed-cylinder" text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />
          )}
          
          <Cylinder position={CYLINDER_POSITIONS.sorting1} extended={cylinders.sorting1.extended} />
          {showLabels && (
            <Label key="sorting1-cylinder" text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />
          )}
          
          <Cylinder position={CYLINDER_POSITIONS.sorting2} extended={cylinders.sorting2.extended} />
          {showLabels && (
            <Label key="sorting2-cylinder" text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />
          )}
          
          {/* 传感器 */}
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

      {/* 移动端标签切换按钮 */}
      {isMobile && (
        <button
          onClick={() => setShowLabels(!showLabels)}
          className="absolute top-4 right-4 z-20 bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-full p-3 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
          title={showLabels ? "隐藏标签" : "显示标签"}
        >
          <span className="text-white text-xl">
            {showLabels ? "🏷️" : "🏷️"}
          </span>
        </button>
      )}

      {/* 桌面端：左侧控制面板 */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto">
          {/* 项目信息 */}
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <span className="text-white text-xl">⚙️</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">
                  数字孪生传送带系统
                </h1>
                <p className="text-xs text-slate-400">V3 · React + Three.js + TypeScript</p>
              </div>
            </div>
          </div>

          {/* 模式选择 */}
          <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">运行模式</div>
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
                    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
                      <DemoPanel demoState={demoState} />
                    </div>
                  )}
          
                  {mode === 'sync' && (
                    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
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
                    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
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
                  )}        </div>
      )}

      {/* 移动端：底部抽屉 */}
      {isMobile && (
        <>
          {/* 抽屉触发按钮 */}
          <button
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className={`absolute bottom-4 left-4 z-20 bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-full px-5 py-2.5 shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
              isPanelOpen ? 'translate-y-[-calc(100vh-24rem)]' : ''
            }`}
          >
            <span className="text-white text-sm font-medium">
              {isPanelOpen ? '▼' : '▲ 控制'}
            </span>
          </button>

          {/* 底部抽屉 */}
          <div className={`absolute bottom-0 left-0 right-0 z-10 transition-all duration-300 ease-in-out ${
            isPanelOpen ? 'translate-y-0' : 'translate-y-full'
          }`}>
            <div className="bg-slate-900/98 backdrop-blur-2xl border-t border-slate-700/50 rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto">
              {/* 紧凑的头部 */}
              <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <span className="text-white text-sm">⚙️</span>
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-white">
                      传送带系统
                    </h1>
                    <p className="text-[10px] text-slate-400">V3</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPanelOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors p-1"
                >
                  ✕
                </button>
              </div>

              {/* 紧凑的模式选择 */}
              <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
                <ModeSelector currentMode={mode} onModeChange={setMode} />
              </div>

              {/* 根据模式显示不同面板 */}
              {mode === 'manual' && (
                <div className="p-4 space-y-4">
                  <ControlPanel isMobile={true} onPanelClose={() => setIsPanelOpen(false)} />
                  <StatusPanel />
                </div>
              )}

              {mode === 'auto' && (
                <div className="p-4">
                  <DemoPanel demoState={demoState} />
                </div>
              )}

              {mode === 'sync' && (
                <div className="p-4">
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
                <div className="p-5">
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
          </div>
        </>
      )}

      {/* 版本信息 */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-600">
        Digital Twin V3
      </div>
    </div>
  );
}

export default App;