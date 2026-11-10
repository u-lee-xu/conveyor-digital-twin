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
import { useDispensingStore, type MagazineId, type PendingPill } from './stores/useDispensingStore';
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

/** 快照药仓的扁平索引：A/B/C/D → 0..3，exportSnapshot / applyBroadcast 共用同一顺序 */
const SNAPSHOT_MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

/**
 * 观众只读镜像：把 8082 广播快照写回设备 store。
 * 观众端不挂载 effects（无演示循环）；位置直接取广播里的 32 位 DINT 数值
 * ENCODER_PULSES，由 setEncoderPulses 同源对齐滑块位置、寄存器读数与两个位置传感器；
 * 不再从 8 位线圈重建，也不占用任何输入点。其余执行器/灯塔按 PLC 输出变量直接置位。
 * 气缸 / 翻转缸跟随主控插值位置，倒药药片 / 计数 / 按钮按扁平键一次写回。
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

  // 气缸 / 翻转缸：优先跟随主控的插值位置，缺字段或 NaN 才退回布尔终值语义，
  // 避免观众端只在电平翻转时瞬间跳到全伸 / 全缩（姿态瞬跳）。
  const posOf = (raw: boolean | number | undefined, on: boolean) =>
    typeof raw === 'number' && Number.isFinite(raw) ? raw : (on ? 1 : 0);
  const onA = !!v['CYL_SEND_A'];
  const onB = !!v['CYL_SEND_B'];
  const onC = !!v['CYL_SEND_C'];
  const onD = !!v['CYL_SEND_D'];
  s.setSendCyl('A', onA, posOf(v['CYL_SEND_A_POS'], onA));
  s.setSendCyl('B', onB, posOf(v['CYL_SEND_B_POS'], onB));
  s.setSendCyl('C', onC, posOf(v['CYL_SEND_C_POS'], onC));
  s.setSendCyl('D', onD, posOf(v['CYL_SEND_D_POS'], onD));
  const tilt = !!v['CYL_TILT'];
  const tiltRaw = v['CYL_TILT_ANGLE'];
  s.setTiltCyl(tilt, typeof tiltRaw === 'number' && Number.isFinite(tiltRaw) ? tiltRaw : (tilt ? 1 : 0));
  // 选择开关是布尔输入，缺字段时保留上次档位（与位置数值同一容错口径）
  if (typeof v['SEL_AUTO'] === 'boolean') s.setSelectorAuto(v['SEL_AUTO']);
  // 电磁阀接线类型是硬件选型：观众端只读跟随主控口径，不显示切换按钮。
  // 姿态本身由上面 5 个 CYL_* 键承载，双电控脉冲断电后观众不会错误回位。
  if (typeof v['SOLENOID_DOUBLE'] === 'boolean') {
    s.setSolenoidType(v['SOLENOID_DOUBLE'] ? 'double' : 'single');
  }
  s.setLamps({
    green: !!v['LAMP_GREEN'],
    yellow: !!v['LAMP_YELLOW'],
    red: !!v['LAMP_RED'],
  });

  // ---- 观众端镜像状态：按 exportSnapshot 的扁平键一次写回，不破坏其它字段 ----
  const dumpCountRaw = v['PILL_DUMP_COUNT'];
  const dumpCount = typeof dumpCountRaw === 'number' && Number.isFinite(dumpCountRaw)
    ? Math.max(0, Math.min(64, Math.floor(dumpCountRaw))) : 0;
  const dumpingPills: PendingPill[] = [];
  for (let i = 0; i < dumpCount; i += 1) {
    const magRaw = v[`PILL_DUMP_${i}_MAG`];
    const magIndex = typeof magRaw === 'number' && Number.isFinite(magRaw)
      ? Math.max(0, Math.min(3, Math.floor(magRaw))) : 0;
    const progressRaw = v[`PILL_DUMP_${i}_PROGRESS`];
    const progress = typeof progressRaw === 'number' && Number.isFinite(progressRaw)
      ? Math.max(0, Math.min(1, progressRaw)) : 0;
    dumpingPills.push({ id: `viewer-${i}`, mag: SNAPSHOT_MAGS[magIndex], progress });
  }

  const numOf = (raw: boolean | number | undefined) =>
    typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const hopperStock: Record<MagazineId, number> = {
    A: numOf(v['HOPPER_STOCK_A']), B: numOf(v['HOPPER_STOCK_B']),
    C: numOf(v['HOPPER_STOCK_C']), D: numOf(v['HOPPER_STOCK_D']),
  };
  const binPills: Record<MagazineId, number> = {
    A: numOf(v['BIN_PILLS_A']), B: numOf(v['BIN_PILLS_B']),
    C: numOf(v['BIN_PILLS_C']), D: numOf(v['BIN_PILLS_D']),
  };
  const binHasDrug = Object.values(binPills).some((n) => n > 0);

  const buttons = {
    start: !!v['BUTTON_START'],
    stop: !!v['BUTTON_STOP'],
    reset: !!v['BUTTON_RESET'],
    estop: !!v['BUTTON_ESTOP'],
    confirm: !!v['BUTTON_CONFIRM'],
  };

  // 观众不挂 Rapier：接药段刚体不重建，pendingPills 恒为空数组，
  // 避免残留不受广播驱动的本地刚体。PILL_PENDING_COUNT 只作为主控在途数量快照。
  // 只展开当前 sensors 覆盖 binHasDrug：上面 setSendCyl / setTiltCyl 写的
  // mscBack / mscFront / mscTilt* 传感器位都保留，不破坏其它字段。
  const sensors = useDispensingStore.getState().sensors;
  useDispensingStore.setState({
    dumpingPills,
    hopperStock,
    binPills,
    buttons,
    pendingPills: [],
    sensors: { ...sensors, binHasDrug },
  });
}

/**
 * 主控上报：与 applyBroadcast 键名一一对应。
 * 位置取 32 位 DINT 脉冲真值（不是滑块浮点位置），观众端由 setEncoderPulses
 * 同源对齐滑台位置、寄存器读数与两个位置传感器。
 */
function exportSnapshot(): Record<string, boolean | number> {
  const s = useDispensingStore.getState();
  const snap: Record<string, boolean | number> = {
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
    // 两位选择开关：观众端 3D 旋钮跟随主控拨动的档位（两档互锁）
    SEL_MANUAL: !s.selectorAuto,
    SEL_AUTO: s.selectorAuto,
    // 电磁阀接线类型（单 / 双电控）：观众端保持与主控同口径
    SOLENOID_DOUBLE: s.solenoidType === 'double',
  };

  // 气缸 / 翻转缸插值位置：主控 useDispenseLoop 本来就在插值，观众直接跟随即可平滑。
  snap['CYL_SEND_A_POS'] = s.sendCyl.A.position;
  snap['CYL_SEND_B_POS'] = s.sendCyl.B.position;
  snap['CYL_SEND_C_POS'] = s.sendCyl.C.position;
  snap['CYL_SEND_D_POS'] = s.sendCyl.D.position;
  snap['CYL_TILT_ANGLE'] = s.tiltCyl.angle;

  // 倒药飞行药片：MAG 用 A/B/C/D → 0..3 扁平数值，PROGRESS 是 0..1 插值进度。
  snap['PILL_DUMP_COUNT'] = s.dumpingPills.length;
  s.dumpingPills.forEach((p, i) => {
    snap[`PILL_DUMP_${i}_MAG`] = Math.max(0, SNAPSHOT_MAGS.indexOf(p.mag));
    snap[`PILL_DUMP_${i}_PROGRESS`] = p.progress;
  });
  snap['PILL_PENDING_COUNT'] = s.pendingPills.length;

  // 料斗 / 取药仓计数与面板按钮，键与 applyBroadcast 一一对应。
  snap['HOPPER_STOCK_A'] = s.hopperStock.A;
  snap['HOPPER_STOCK_B'] = s.hopperStock.B;
  snap['HOPPER_STOCK_C'] = s.hopperStock.C;
  snap['HOPPER_STOCK_D'] = s.hopperStock.D;
  snap['BIN_PILLS_A'] = s.binPills.A;
  snap['BIN_PILLS_B'] = s.binPills.B;
  snap['BIN_PILLS_C'] = s.binPills.C;
  snap['BIN_PILLS_D'] = s.binPills.D;
  snap['BUTTON_START'] = s.buttons.start;
  snap['BUTTON_STOP'] = s.buttons.stop;
  snap['BUTTON_RESET'] = s.buttons.reset;
  snap['BUTTON_ESTOP'] = s.buttons.estop;
  snap['BUTTON_CONFIRM'] = s.buttons.confirm;

  return snap;
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
