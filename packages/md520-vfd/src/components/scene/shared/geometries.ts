/** MD520 独立场景共享几何单例：尺寸全部派生自 scenes/constants.ts */
import * as THREE from 'three';
import { VFD_DRIVE_DETAIL as V } from '../../../scenes/constants';

export const geometries = {
  vfdBase: new THREE.BoxGeometry(V.BASE_W, V.BASE_T, V.BASE_D),
  vfdCabinet: new THREE.BoxGeometry(V.CABINET_W, V.CABINET_H, V.CABINET_D),
  vfdDoor: new THREE.BoxGeometry(V.CABINET_W - 0.02, V.CABINET_H - 0.02, V.DOOR_T),
  vfdDisplay: new THREE.PlaneGeometry(V.DISPLAY_W, V.DISPLAY_H),
  vfdLed: new THREE.SphereGeometry(V.LED_R, 12, 12),
  vfdVent: new THREE.BoxGeometry(V.VENT_W, V.VENT_H, V.DOOR_T),
  vfdNameplate: new THREE.BoxGeometry(V.NAMEPLATE_W, V.NAMEPLATE_H, V.DOOR_T),

  vfdMotorBody: new THREE.CylinderGeometry(V.MOTOR_R, V.MOTOR_R, V.MOTOR_LEN, 24),
  vfdMotorEndcap: new THREE.CylinderGeometry(V.MOTOR_R * 1.02, V.MOTOR_R * 1.02, 0.018, 24),
  /** Torus 默认在 XY 平面、法向 +Z，与电机轴线一致，无需旋转 */
  vfdMotorFinRing: new THREE.TorusGeometry(V.MOTOR_R * 1.01, V.FIN_T, 6, 24),
  vfdMotorStand: new THREE.BoxGeometry(0.035, 0.19, 0.035),
  vfdMotorJunction: new THREE.BoxGeometry(0.10, 0.055, 0.09),
  vfdFanRing: new THREE.TorusGeometry(V.FAN_R, 0.007, 8, 24),
  vfdFanHub: new THREE.CylinderGeometry(0.018, 0.018, 0.022, 12),
  vfdFanBlade: new THREE.BoxGeometry(V.FAN_BLADE_L, V.FAN_BLADE_W, V.FAN_BLADE_H),
  vfdShaft: new THREE.CylinderGeometry(V.SHAFT_R, V.SHAFT_R, V.SHAFT_LEN, 12),
  vfdCoupling: new THREE.CylinderGeometry(V.COUPLING_R, V.COUPLING_R, V.COUPLING_LEN, 16),

  vfdRoller: new THREE.CylinderGeometry(V.ROLLER_R, V.ROLLER_R, V.ROLLER_LEN, 20),
  vfdRollerEnd: new THREE.CylinderGeometry(V.ROLLER_R * 1.15, V.ROLLER_R * 1.15, 0.018, 20),
  vfdBelt: new THREE.BoxGeometry(V.BELT_LEN, V.BELT_T, V.BELT_W),
  vfdStripe: new THREE.BoxGeometry(V.STRIPE_W, V.STRIPE_T, V.BELT_W * 0.90),
  vfdStand: new THREE.BoxGeometry(V.STAND_W, V.STAND_H, V.STAND_W),
} as const;
