/**
 * 「滑块-旋转气缸-料斗」共同旋转基准：纯函数 / 纯常量，无 React、无 WebGL。
 *
 * 约定（全部在「气缸主体局部坐标」中表达，主体原点 = 气缸几何中心）：
 *   PIVOT_LOCAL            法兰盘端面中心，同时也是料斗 -Z 侧面外表面中心。
 *                          这是圆盘与料斗唯一的共同旋转基准，绕 Z 轴旋转。
 *   HOPPER_SIDE_FACE_LOCAL 料斗在自身局部坐标中的侧面中心，恒为 [0,0,0]；
 *                          组件把 <Hopper /> 直接挂到 PIVOT_LOCAL 上，一点不多移。
 *   HOPPER_AXIAL_OFFSET    pivot → 料斗几何中心：只有 +Z 分量（旋转轴方向），
 *                          绕 Z 旋转时该向量不变 ⇒ 料斗中心全程不动、XY 偏心恒为 0。
 *   DISC_BODY_OFFSET       pivot → 盘体积中心：只有 -Z 分量，同理不产生偏心。
 *
 * 「不产生偏心或额外位移」在这里是可计算的结论，而不是口头约定：
 * 任意 angle 下 hopperSideFaceInPivot() 恒等于 [0,0,0]，
 * hopperCenterInPivot() 恒等于 HOPPER_AXIAL_OFFSET。
 */
import {
  ROTARY_PIVOT_IN_BODY_Z, ROTARY_DISC, HOPPER,
} from './constants';

export type LocalVec3 = [number, number, number];

/** 共同旋转基准：盘端面中心 = 料斗侧面中心（气缸主体局部坐标） */
export const PIVOT_LOCAL: LocalVec3 = [0, 0, ROTARY_PIVOT_IN_BODY_Z];
/** 料斗 -Z 侧面中心就是料斗组件的局部原点 */
export const HOPPER_SIDE_FACE_LOCAL: LocalVec3 = [0, 0, 0];
/** pivot → 料斗几何中心：只沿旋转轴让位半个斗深 */
export const HOPPER_AXIAL_OFFSET: LocalVec3 = [0, 0, HOPPER.D / 2];
/** pivot → 盘体积中心：只沿旋转轴向后半个盘厚 */
export const DISC_BODY_OFFSET: LocalVec3 = [0, 0, -ROTARY_DISC.TH / 2];

/** angle 0→1 对应 0°→-90°；圆盘与料斗共用这唯一一个角度 */
export function rotaryAngleRad(angle: number): number {
  const a = Math.max(0, Math.min(1, angle));
  // 显式返回 +0：否则 -0 * π/2 会得到 -0，Three.js 的 Object.is 等价校验与
  // 自检断言都要求「零角度」是精确的正零（无旋转）。
  return a === 0 ? 0 : -a * Math.PI / 2;
}

/** 绕共同基准的 Z 轴旋转一个局部偏移向量 */
export function rotateAboutPivot(offset: LocalVec3, angle: number): LocalVec3 {
  const theta = rotaryAngleRad(angle);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [offset[0] * c - offset[1] * s, offset[0] * s + offset[1] * c, offset[2]];
}

/** 共同基准不随角度移动（旋转中心本身固定） */
export function pivotInBody(angle: number): LocalVec3 {
  void angle;
  return [...PIVOT_LOCAL];
}

/** 料斗侧面中心在 pivot 坐标系中的位置：任意角度都精确等于基准点 */
export function hopperSideFaceInPivot(angle: number): LocalVec3 {
  return rotateAboutPivot(HOPPER_SIDE_FACE_LOCAL, angle);
}

/** 料斗几何中心在 pivot 坐标系中的位置：任意角度都相同（只沿旋转轴让位） */
export function hopperCenterInPivot(angle: number): LocalVec3 {
  return rotateAboutPivot(HOPPER_AXIAL_OFFSET, angle);
}

/** 盘体积中心在 pivot 坐标系中的位置：任意角度都相同 */
export function discBodyInPivot(angle: number): LocalVec3 {
  return rotateAboutPivot(DISC_BODY_OFFSET, angle);
}

/** 料斗几何中心相对共同基准的平面偏心半径（XY），恒为 0 */
export function hopperEccentricity(angle: number): number {
  const c = hopperCenterInPivot(angle);
  return Math.hypot(c[0], c[1]);
}
