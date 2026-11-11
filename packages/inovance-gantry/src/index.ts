/**
 * 汇川龙门 XY 象棋分拣 —— 独立设备场景。
 *
 * 与传送带分拣 / 自动配药 / MD520 一样，通过 DeviceDefinition 接入平台壳；
 * 平台壳不感知内部实现。运动由 position 坐标变量驱动，ETHERCAT 仅保留
 * gantryVariables.ts 里的变量 / 信号映射表，不实现底层硬件链路。
 */
import type { DeviceDefinition, PlatformModeState } from '@digital-twin/platform';
import type { Mode } from '@digital-twin/shared';
import { GantrySceneContent } from './scenes/GantrySceneContent';
import { GantrySceneWrapper } from './platform/GantrySceneWrapper';
import { GantryModePanel } from './platform/GantryModePanel';
import { GantryDeviceEffects } from './platform/GantryDeviceEffects';
import { useGantryAppStore } from './stores/useGantryAppStore';
import { useGantryStore, exportGantrySnapshot } from './stores/useGantryStore';

function useGantryModeState(): PlatformModeState {
  const mode = useGantryAppStore((s) => s.mode);
  const setMode = useGantryAppStore((s) => s.setMode);
  return { mode, setMode: (m: Mode) => setMode(m === 'sim' ? 'sim' : 'manual') };
}

export const inovanceGantryDevice: DeviceDefinition = {
  id: 'inovance-gantry',
  name: '汇川龙门 XY 象棋分拣',
  icon: '♟',
  gradient: 'from-sky-700 to-indigo-700',
  version: '1.0',
  description: 'XY 直角坐标双伺服龙门，Z 气缸吸盘按 position 坐标变量完成棋盘格象棋棋子的吸取、移动与放置；ETHERCAT 仅作变量/信号映射。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: GantryModePanel },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: GantryModePanel },
  ],
  SceneContent: GantrySceneContent,
  cameraPosition: [1.55, 1.0, 1.95],
  SceneWrapper: GantrySceneWrapper,
  effects: GantryDeviceEffects,
  useModeState: useGantryModeState,
  onModeChange: () => {
    useGantryStore.getState().stopAuto();
    useGantryStore.getState().setControlSource('local');
  },
  onCleanup: () => {
    useGantryStore.getState().stopAuto();
    useGantryStore.getState().resetAll();
  },
  /** 观众只读镜像：数值键，Number.isFinite 守卫由 store 内部保证 */
  applyBroadcast: (v: Record<string, boolean | number>) => {
    useGantryStore.getState().applyBroadcast(v);
  },
  /** 主控上报：与 applyBroadcast 键名一一对应，手动模式同样可同步 */
  exportSnapshot: () => exportGantrySnapshot(),
};
