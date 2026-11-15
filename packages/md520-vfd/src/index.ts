/**
 * MD520 虚拟变频器 —— 独立设备场景。
 *
 * 与传送带分拣 / 自动配药完全独立：自己的设备包、自己的三维装置。
 * 仿真模式连外部 PLC 仿真软件 / 实物 PLC；内置虚拟 PLC 靶机只用于开发验收，不随教学交付启动。
 * 平台壳只通过 DeviceDefinition 接入，不感知内部实现。
 */
import type { DeviceDefinition, PlatformModeState } from '@digital-twin/shared';
import type { Mode } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { VfdSceneContent } from './scenes/vfd/SceneContent';
import { VfdSceneWrapper } from './platform/VfdSceneWrapper';
import { VfdModePanel } from './platform/VfdModePanel';
import { VfdDeviceEffects } from './platform/VfdDeviceEffects';
import { useVfdAppStore } from './stores/useVfdAppStore';
import { useVfdStore } from './stores/useVfdStore';

function useVfdModeState(): PlatformModeState {
  const mode = useVfdAppStore((s) => s.mode);
  const setMode = useVfdAppStore((s) => s.setMode);
  return { mode, setMode: (m: Mode) => setMode(m === 'sim' ? 'sim' : 'manual') };
}

function disconnectIfNeeded() {
  const s = useVfdAppStore.getState();
  if (s.connected) {
    void modbusService.disconnect().catch(() => undefined);
    s.setConnected(false);
  }
}

export const md520VfdDevice: DeviceDefinition = {
  id: 'md520-vfd',
  name: 'MD520 变频器',
  icon: '⚡',
  gradient: 'from-slate-600 to-sky-600',
  version: '1.0',
  description: '汇川 MD520 虚拟变频器独立教学设备：三级菜单参数设定、面板 / DI 多段速 / AI 模拟量 / 485 通信四种给定，PLC 双向联调与三维电机联动。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: VfdModePanel },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: VfdModePanel, needsConnection: true },
  ],
  SceneContent: VfdSceneContent,
  SceneWrapper: VfdSceneWrapper,
  effects: VfdDeviceEffects,
  useModeState: useVfdModeState,
  onModeChange: () => {
    useVfdStore.getState().setEngaged(false);
    disconnectIfNeeded();
  },
  onCleanup: () => {
    useVfdStore.getState().setEngaged(false);
    disconnectIfNeeded();
  },
  /** 观众只读镜像：全数值键，Number.isFinite 守卫由 store 内部保证 */
  applyBroadcast: (v: Record<string, boolean | number>) => {
    useVfdStore.getState().applyBroadcast(v);
  },
  /** 主控上报：与 applyBroadcast 键名一一对应，手动模式同样可同步 */
  exportSnapshot: () => {
    const s = useVfdStore.getState();
    const vfd = s.snapshot();
    const p = s.params;
    return {
      VFD_SETPOINT_HZ: vfd.setpointHz,
      VFD_OUTPUT_HZ: vfd.outputHz,
      VFD_CURRENT: vfd.outputCurrent,
      VFD_POWER: vfd.outputPower,
      VFD_DIRECTION: vfd.direction,
      VFD_RUN_DIRECTION: vfd.runDirection,
      VFD_COMMAND: vfd.command,
      VFD_STATUS: vfd.status,
      VFD_DI_FLAGS: vfd.diFlags,
      VFD_DO_FLAGS: vfd.doFlags,
      VFD_FAULT: vfd.faultCode ? 1 : 0,
      VFD_ENGAGED: vfd.engaged ? 1 : 0,
      VFD_AI1: s.ai1,
      VFD_AI2: s.ai2,
      VFD_SOURCE: p['F0-02'],
      VFD_FREQ_SOURCE: p['F0-03'],
      VFD_PRESET_HZ: p['F0-08'],
      VFD_MAX_HZ: p['F0-10'],
    };
  },
};
