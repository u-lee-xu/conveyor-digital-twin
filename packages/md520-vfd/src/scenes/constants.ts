/**
 * MD520 独立场景可见尺寸唯一来源。
 * 从传送带分拣的第 7 个展台整体迁入，数值一字未改，保证模型外观不漂移。
 */
export const SURFACE_GAP = 0.0025;

export const VFD_DRIVE_DETAIL = {
  /** 底座：y=0 为网格面，z 略后移给外露风扇留位 */
  BASE_W: 1.90, BASE_D: 0.80, BASE_T: 0.04, BASE_Y: -0.02, BASE_Z: -0.08,

  /** 变频器柜体：面板朝 -Z，x 在皮带左侧且不被电机遮挡 */
  CABINET_W: 0.40, CABINET_H: 0.72, CABINET_D: 0.24,
  CABINET_X: -0.72, CABINET_Z: 0.06,
  DOOR_T: 0.012,
  DISPLAY_W: 0.30, DISPLAY_H: 0.14, DISPLAY_Y: 0.50,
  /** 三只灯放在数字牌上方，避开电机接线盒对柜门下部的遮挡 */
  LED_R: 0.017, LED_Y: 0.64, LED_GAP: 0.082,
  VENT_W: 0.22, VENT_H: 0.006, VENT_GAP: 0.019, VENT_COUNT: 5,
  NAMEPLATE_W: 0.20, NAMEPLATE_H: 0.055, NAMEPLATE_Y: 0.11,

  /** 三相电机：轴线沿 Z，与左滚筒同轴；尾端风扇朝 -Z 外露 */
  MOTOR_R: 0.105, MOTOR_LEN: 0.28,
  MOTOR_X: -0.22, MOTOR_Y: 0.30, MOTOR_Z: -0.31,
  FIN_T: 0.008, FIN_COUNT: 8, FIN_LEN: 0.22,
  FAN_R: 0.088, FAN_BLADE_L: 0.072, FAN_BLADE_W: 0.038, FAN_BLADE_H: 0.007,
  FAN_BLADE_COUNT: 6,
  SHAFT_R: 0.016, SHAFT_LEN: 0.16,
  COUPLING_R: 0.032, COUPLING_LEN: 0.075, COUPLING_Z: -0.13,

  /** 短皮带与双滚筒：带面沿 X，滚筒轴沿 Z */
  BELT_LEN: 0.94, BELT_W: 0.22, BELT_T: 0.012, BELT_Y: 0.30,
  BELT_CENTER_X: 0.22,
  ROLLER_R: 0.068, ROLLER_LEN: 0.26, ROLLER_DX: 0.44,
  STRIPE_W: 0.020, STRIPE_T: 0.004, STRIPE_COUNT: 10,
  STAND_H: 0.23, STAND_W: 0.028,

  /** 动画：50Hz 对应 4 极电机 1500rpm；这里用视觉演示转速，不做真实传动比 */
  MAX_RPS: 2.6, BELT_SPEED: 0.46, RPM_PER_HZ: 30,
} as const;
