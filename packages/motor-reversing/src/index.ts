/**
 * 电机正反转控制 —— 第 8 个独立设备场景。
 *
 * 契约 v1.0：按钮 → PLC → 硬件互锁接触器 → 电机 → 传送带。
 * 柜内无 KM 辅助常开自锁接线；两接触器常闭辅助触点互串 + 机械联锁。
 * 转速 / 皮带位移 / 热累积是唯一真值；三模式共用面板外壳；
 * 仿真对接外部 PLC 仿真软件或实物 PLC，不依赖内置虚拟 PLC、不新增端口或进程。
 */
import type { DeviceDefinition, PlatformModeState, Mode } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { MOTOR_VISUAL } from './constants/motorConstants';
import { MotorSceneContent } from './scenes/MotorSceneContent';
import { MotorSceneWrapper } from './platform/MotorSceneWrapper';
import { MotorModePanel } from './platform/MotorModePanel';
import { MotorDeviceEffects } from './platform/MotorDeviceEffects';
import { useMotorAppStore } from './stores/useMotorAppStore';
import { useMotorStore, exportMotorSnapshot } from './stores/useMotorStore';

function useMotorModeState(): PlatformModeState {
  const mode = useMotorAppStore((s) => s.mode);
  const setMode = useMotorAppStore((s) => s.setMode);
  // 评分模式不开放，任何非三模式值落到手动
  return { mode, setMode: (m: Mode) => setMode(m === 'sim' ? 'sim' : m === 'auto' ? 'auto' : 'manual') };
}

/** 切模式 / 退出工作区：停演示、断 PLC、清连接态，避免后台继续 300ms 轮询或写线圈 */
function stopAndDisconnect() {
  const store = useMotorStore.getState();
  store.stopDemo();
  store.setControlSource('local');
  store.setConnected(false);
  useMotorAppStore.getState().setPlcConnected(false);
  void modbusService.disconnect().catch(() => undefined);
}

export const motorReversingDevice: DeviceDefinition = {
  id: 'motor-reversing',
  name: '电机正反转控制',
  icon: '↻',
  gradient: 'from-amber-700 to-orange-700',
  version: '1.0',
  description: '按钮经 PLC 控制两只硬件互锁的交流接触器，驱动三相电机正反转并拖动传送带；控制柜内空气开关、熔断器、接触器与热继电器可观察，接触器吸合与过载跳闸可见。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  /**
   * 三模式共用 MotorModePanel 外壳：平台壳按 mode 渲染 panel，
   * 外壳内部按同一个 useMotorAppStore.mode 分发，data-dt-motor-panel 锚点始终唯一。
   */
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: MotorModePanel },
    { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: MotorModePanel },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: MotorModePanel, needsConnection: true },
  ],
  SceneContent: MotorSceneContent,
  cameraPosition: MOTOR_VISUAL.SCENE_CAMERA,
  SceneWrapper: MotorSceneWrapper,
  effects: MotorDeviceEffects,
  useModeState: useMotorModeState,
  onModeChange: (mode) => {
    stopAndDisconnect();
    useMotorStore.getState().setControlSource(mode === 'sim' ? 'plc' : 'local');
  },
  onCleanup: () => {
    stopAndDisconnect();
    useMotorStore.getState().resetAll();
  },
  /** 观众只读镜像：数值键成对，有限性守卫由 store 内部保证 */
  applyBroadcast: (v: Record<string, boolean | number>) => {
    useMotorStore.getState().applyBroadcast(v);
  },
  /** 主控上报：与 applyBroadcast 键名一一对应，手动 / 演示模式同样可同步 */
  exportSnapshot: () => exportMotorSnapshot(),
};
