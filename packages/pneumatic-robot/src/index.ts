import type { DeviceDefinition, PlatformModeState } from '@digital-twin/platform';
import type { Mode } from '@digital-twin/shared';
import { PneumaticRobotSceneContent } from './scenes/pneumatic-robot/SceneContent';
import { ManualModePanel } from './platform/ManualModePanel';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { plcService } from './services/plc-websocket';
import { SimModePanel } from './platform/SimModePanel';
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
  icon: '⚙',
  gradient: 'from-cyan-500 to-blue-600',
  version: '1.2',
  description: '三气缸气动机械手教学设备：平移、升降、夹取。支持 Modbus / S7 / 三菱 MX 协议联调。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  modes: [
    { id: 'manual', label: '手动', icon: '✋', color: 'from-blue-500 to-cyan-500', panel: ManualModePanel },
    { id: 'sim', label: '仿真', icon: '⚙', color: 'from-orange-500 to-yellow-500', panel: SimModePanel, needsConnection: true },
  ],
  SceneContent: PneumaticRobotSceneContent,
  SceneWrapper: PneumaticSceneWrapper,
  useModeState: usePneumaticModeState,
  onCleanup: disconnectIfNeeded,
};
