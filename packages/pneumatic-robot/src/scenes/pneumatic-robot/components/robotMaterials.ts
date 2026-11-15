/**
 * 气动机械臂场景共享材质单例 —— 从 RobotArm.tsx 原样收拢，色值与质感逐字不变。
 * 独立成文件也让 RobotArm.tsx 只导出组件，符合 fast-refresh 约束。
 */
import * as THREE from 'three';
import { applySurfaceTextures } from '@digital-twin/shared/three/surfaceTextures';
import { VISUAL } from '../constants';

function mkMat(color: number, metalness: number, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

export const ROBOT_MATERIALS = {
  matPost: mkMat(VISUAL.FRAME_COLOR, 0.75, 0.25),
  matCantilever: mkMat(VISUAL.BEAM_COLOR, 0.7, 0.3),
  matBase: mkMat(VISUAL.BASE_COLOR, 0.6, 0.4),
  matCylBody: mkMat(VISUAL.CYLINDER_BODY_COLOR, 0.7, 0.3),
  matCylRod: mkMat(VISUAL.CYLINDER_ROD_COLOR, 0.9, 0.1),
  matEndCap: mkMat(VISUAL.CYLINDER_END_CAP_COLOR, 0.65, 0.35),
  matPlate: mkMat(VISUAL.MOUNT_PLATE_COLOR, 0.65, 0.35),
  matGripBody: mkMat(VISUAL.GRIPPER_BODY_COLOR, 0.6, 0.35),
  matGripFinger: mkMat(VISUAL.GRIPPER_FINGER_COLOR, 0.55, 0.4),
  matWorkpiece: mkMat(0xD4A574, 0.5, 0.5),
  matSensorOn: new THREE.MeshStandardMaterial({
    color: VISUAL.MAG_SENSOR_ON, emissive: VISUAL.MAG_SENSOR_ON, emissiveIntensity: 1.5,
  }),
  matSensorOff: new THREE.MeshStandardMaterial({ color: VISUAL.MAG_SENSOR_OFF }),
} as const;

/**
 * 与汇川龙门场景一致的 Saltline 程序化表面细节：只挂机械臂金属结构件。
 * 物料工件（matWorkpiece）、磁性开关指示灯（matSensorOn/Off）与地面 A/B
 * 文字环（CanvasTexture）不挂，避免改动物料色与状态色。
 */
const ROBOT_METAL_KEYS = [
  'matPost', 'matCantilever', 'matBase', 'matCylBody', 'matCylRod',
  'matEndCap', 'matPlate', 'matGripBody', 'matGripFinger',
] as const;

/** 幂等惰性：由场景入口在首次渲染时调用一次 */
export function applyProceduralTextures(): void {
  applySurfaceTextures(ROBOT_MATERIALS, ROBOT_METAL_KEYS);
}
