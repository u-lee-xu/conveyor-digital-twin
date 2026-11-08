import type { DeviceDefinition, PlatformModeDef } from '@digital-twin/platform';
import { DispensingSceneContent } from './scenes/auto-dispensing/SceneContent';
import { buildDispensingHelpContent } from './scenes/auto-dispensing/helpContent';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import { SCENE_CAMERA } from './scenes/auto-dispensing/constants';
import {
  PlatformManualPanel, PlatformDemoPanel, PlatformSimPanel,
} from './platform/PlatformModePanels';
import { DispensingSceneWrapper } from './platform/DispensingSceneWrapper';
import { useAppStore } from './stores/useAppStore';
import { useDispensingStore, type MagazineId } from './stores/useDispensingStore';
import { plcService } from './services/plc-websocket';

/** 模式面板（评分暂不开通，与独立 App 的三模式一致） */
const MODES: PlatformModeDef[] = [
  { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: PlatformManualPanel },
  { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: PlatformDemoPanel },
  { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: PlatformSimPanel, needsConnection: true },
];

/** 平台唯一模式读写入口：转接设备自己的 UI store */
function useDispensingModeState() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  return { mode, setMode };
}

/** 工作区常驻副作用：演示状态机、气缸/翻转动画、药片飞行均由此驱动 */
function DispensingDeviceEffects() {
  useDispenseLoop();
  return null;
}

/** 切换模式或退出工作区：停演示循环 + 断开 PLC，避免后台继续写线圈 */
function stopAndDisconnect() {
  useDispensingStore.getState().resetAuto();
  void plcService.disconnect().catch(() => undefined);
}

/**
 * 观众只读镜像：把 8082 广播快照写回设备 store。
 * 观众端不挂载 effects（无演示循环）；位置直接取广播里的 32 位 DINT 数值
 * ENCODER_PULSES，由 setEncoderPulses 同源对齐滑块位置、寄存器读数与两个位置传感器；
 * 不再从 8 位线圈重建，也不占用任何输入点。其余执行器/灯塔按 PLC 输出变量直接置位。
 */
function applyBroadcast(v: Record<string, boolean | number>) {
  const s = useDispensingStore.getState();

  // 快照缺少位置字段时（例如 read-words 读取失败）保留上一次位置，
  // 不能把 undefined/NaN 当作 0 写回，否则观众端滑台会被误拉回原点。
  const encoderValue = v['ENCODER_PULSES'];
  if (typeof encoderValue === 'number' && Number.isFinite(encoderValue)) {
    s.setEncoderPulses(encoderValue);
  }
  s.setMotor(!!v['MOTOR_FWD'], !!v['MOTOR_REV']);

  (['A', 'B', 'C', 'D'] as MagazineId[]).forEach((mag) => {
    const on = !!v[`CYL_SEND_${mag}`];
    if (s.sendCyl[mag].extended !== on) s.setSendCyl(mag, on, on ? 1 : 0);
  });

  const tilt = !!v['CYL_TILT'];
  if (s.tiltCyl.tilted !== tilt) s.setTiltCyl(tilt, tilt ? 1 : 0);
  s.setLamps({
    green: !!v['LAMP_GREEN'],
    yellow: !!v['LAMP_YELLOW'],
    red: !!v['LAMP_RED'],
  });
}

/**
 * 主控上报：与 applyBroadcast 键名一一对应。
 * 位置取 32 位 DINT 脉冲真值（不是滑块浮点位置），观众端由 setEncoderPulses
 * 同源对齐滑台位置、寄存器读数与两个位置传感器。
 */
function exportSnapshot(): Record<string, boolean | number> {
  const s = useDispensingStore.getState();
  return {
    ENCODER_PULSES: s.encoderPulses,
    MOTOR_FWD: s.motorFwd,
    MOTOR_REV: s.motorRev,
    CYL_SEND_A: s.sendCyl.A.extended,
    CYL_SEND_B: s.sendCyl.B.extended,
    CYL_SEND_C: s.sendCyl.C.extended,
    CYL_SEND_D: s.sendCyl.D.extended,
    CYL_TILT: s.tiltCyl.tilted,
    LAMP_GREEN: s.lamp.green,
    LAMP_YELLOW: s.lamp.yellow,
    LAMP_RED: s.lamp.red,
  };
}

export const dispensingDevice: DeviceDefinition = {
  id: 'auto-dispensing',
  name: '自动配药',
  icon: '💊',
  gradient: 'from-teal-500 to-cyan-600',
  version: '1.0',
  description: '自动配药教学设备：四仓选药 → 丝杆送料 → 旋转料斗翻转倒药，支持 PLC 联调与仿真控制。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  helpContent: buildDispensingHelpContent(),
  modes: MODES,
  SceneContent: DispensingSceneContent,
  cameraPosition: SCENE_CAMERA,
  SceneWrapper: DispensingSceneWrapper,
  effects: DispensingDeviceEffects,
  useModeState: useDispensingModeState,
  onModeChange: stopAndDisconnect,
  onCleanup: stopAndDisconnect,
  applyBroadcast,
  exportSnapshot,
};
