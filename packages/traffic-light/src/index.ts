import type { DeviceDefinition, PlatformModeState } from '@digital-twin/platform';
import type { Mode } from '@digital-twin/shared';
import { TrafficSceneContent } from './scenes/traffic-light/SceneContent';
import { ManualModePanel } from './platform/ManualModePanel';
import { DemoModePanel } from './platform/DemoModePanel';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { plcService } from './services/plc-websocket';
import { SimModePanel } from './platform/SimModePanel';
import { ScoringModePanel } from './platform/ScoringModePanel';
import { useTrafficStore } from './scenes/traffic-light/useTrafficStore';
import { buildTrafficHelpContent } from './scenes/traffic-light/helpContent';
import { TrafficSceneWrapper } from './platform/TrafficSceneWrapper';

function useTrafficModeState(): PlatformModeState {
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

export const trafficLightDevice: DeviceDefinition = {
  id: 'traffic-light',
  name: '交通灯',
  icon: '🚦',
  gradient: 'from-red-500 to-amber-500',
  version: '1.0',
  description: '十字路口交通灯数字孪生教学设备：东西/南北双向信号灯联调与自动评分。支持 Modbus / S7 / 三菱 MX 协议。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  helpContent: buildTrafficHelpContent(),
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: ManualModePanel },
    { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: DemoModePanel },
    { id: 'scoring', label: '评分', icon: '🏆', color: 'from-green-500 to-emerald-500', panel: ScoringModePanel, needsConnection: true },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: SimModePanel, needsConnection: true },
  ],
  SceneContent: TrafficSceneContent,
  SceneWrapper: TrafficSceneWrapper,
  useModeState: useTrafficModeState,
  onModeChange: () => {
    useTrafficStore.getState().setScoringRunning(false);
    disconnectIfNeeded();
  },
  onCleanup: disconnectIfNeeded,
};
