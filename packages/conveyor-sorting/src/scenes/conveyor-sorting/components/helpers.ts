import { COMPONENT, PUSH_KINEMATICS } from '../constants';

/**
 * 推板中心 Z 的基准值（不含刚体让位）。
 * 气缸组 rotation=[π/2,0,π] 把局部 +Y 映射到世界 -Z，
 * 因此推杆伸出 = 推板朝 -Z 移动，工件在推板更小的 Z 一侧。
 */
export function getPushPlateWorldZ(cylinderZ: number, extension: number): number {
  return cylinderZ - (extension + COMPONENT.CYLINDER_SURFACE_OFFSET);
}

/** 推板刚体 / 可见推板的实际中心 Z */
export function getPushPlateCenterZ(cylinderZ: number, extension: number): number {
  return getPushPlateWorldZ(cylinderZ, extension) + COMPONENT.CYLINDER_PUSH_OFFSET;
}

/**
 * 被推工件中心 Z：推板中心往前让开「推板半厚 + 工件半宽 + 安全间隙」。
 * 与 getPushPlateCenterZ 共用同一个基准，推板和工件不可能互相插入。
 */
export function getPushedMaterialZ(cylinderZ: number, extension: number): number {
  return getPushPlateCenterZ(cylinderZ, extension) - PUSH_KINEMATICS.FOLLOW_GAP;
}
