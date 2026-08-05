import type { DeviceDefinition } from '@digital-twin/platform';
import { modbusService } from '@digital-twin/shared';
import { ConveyorSortingSceneContent } from './scenes/conveyor-sorting/SceneContent';
import { ViewControlPanel } from './components/panels';
import { useDeviceStore } from './stores';
import { ManualModePanel } from './platform/ManualModePanel';
import { AutoModePanel } from './platform/AutoModePanel';
import { ScoringModePanel } from './platform/ScoringModePanel';
import { SimModePanel } from './platform/SimModePanel';
import { ConveyorDeviceEffects } from './platform/ConveyorDeviceEffects';

function useConveyorModeState() {
  const mode = useDeviceStore((s) => s.mode);
  const setMode = useDeviceStore((s) => s.setMode);
  return { mode, setMode };
}

function disconnectIfNeeded() {
  const state = useDeviceStore.getState();
  if (state.isConnected) {
    void modbusService.disconnect().catch(() => undefined);
    state.setConnected(false);
  }
}

export const conveyorDevice: DeviceDefinition = {
  id: 'conveyor-sorting',
  name: '传送带分拣控制',
  icon: '⚙',
  gradient: 'from-blue-500 to-blue-600',
  version: '1.1',
  description: '传送带物料分拣教学设备：上料、色标识别、气缸分拣。支持 PLC 联调与自动评分。',
  protocols: ['modbus', 's7'],
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: ManualModePanel },
    { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: AutoModePanel },
    { id: 'scoring', label: '评分', icon: '🏆', color: 'from-green-500 to-emerald-500', panel: ScoringModePanel, needsConnection: true },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: SimModePanel, needsConnection: true },
  ],
  SceneContent: ConveyorSortingSceneContent,
  sidebarExtras: ViewControlPanel,
  effects: ConveyorDeviceEffects,
  useModeState: useConveyorModeState,
  onModeChange: () => {
    useDeviceStore.getState().setScoringRunning(false);
    disconnectIfNeeded();
  },
  onCleanup: disconnectIfNeeded,
};
