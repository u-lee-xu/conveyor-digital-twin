import type { DeviceDefinition, PlatformModeState } from '@digital-twin/platform';
import type { Mode } from '@digital-twin/shared';
import { PneumaticRobotSceneContent } from './scenes/pneumatic-robot/SceneContent';
import { ManualModePanel } from './platform/ManualModePanel';
import { DemoPanel } from './scenes/pneumatic-robot/panels/DemoPanel';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { plcService } from './services/plc-websocket';
import { SimModePanel } from './platform/SimModePanel';
import { ScoringModePanel } from './platform/ScoringModePanel';
import { useRobotStore } from './scenes/pneumatic-robot/useRobotStore';
import { buildRobotHelpContent } from './scenes/pneumatic-robot/helpContent';
import { PneumaticSceneWrapper } from './platform/PneumaticSceneWrapper';

function usePneumaticModeState(): PlatformModeState {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  return {
    mode,
    setMode: (m: Mode) => setMode(m as AppMode),
  };
}

function disconnectIfNeeded() {
  if (plcService.connected) {
    void plcService.disconnect().catch(() => undefined);
  }
}

export const pneumaticDevice: DeviceDefinition = {
  id: 'pneumatic-robot',
  name: '气动机械手',
  icon: '🗜️',
  gradient: 'from-cyan-500 to-blue-600',
  version: '1.3',
  description: '三气缸气动机械手教学设备：平移、升降、夹取。支持 Modbus / S7 / 三菱 MX 协议联调与自动评分。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  helpContent: buildRobotHelpContent(),
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: ManualModePanel },
    { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: DemoPanel },
    { id: 'scoring', label: '评分', icon: '🏆', color: 'from-green-500 to-emerald-500', panel: ScoringModePanel, needsConnection: true },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: SimModePanel, needsConnection: true },
  ],
  SceneContent: PneumaticRobotSceneContent,
  SceneWrapper: PneumaticSceneWrapper,
  useModeState: usePneumaticModeState,
  onModeChange: () => {
    useRobotStore.getState().setScoringRunning(false);
    disconnectIfNeeded();
  },
  onCleanup: disconnectIfNeeded,
};
