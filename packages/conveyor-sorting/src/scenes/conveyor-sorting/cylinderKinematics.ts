/**
 * 气缸运动学单一真值。
 *
 * 修复「推料穿模」的核心：旧版推板由 PhysicsCylinder 的本地 ref 阻尼推进，
 * 工件由 PhysicsMaterial 从 store 读 currentExtension 推进，两个 useFrame
 * 各算各的，一帧时序差 + kinematic 瞬移让推板插进工件里。
 *
 * 现在由 CylinderMotionDriver 每帧统一计算三个气缸的行程，写进这个模块；
 * 视觉推杆、推板刚体、工件都只读同一份快照。快照是**原地修改**而非替换，
 * 因此即使组件持有的是旧引用，读到的仍是本帧同一组数值 —— 推板与工件
 * 永远使用同一个 extension，不可能出现相对位移。
 */
import type { CylinderName } from '../../types/device';
import {
  COMPONENT, CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
} from './constants';

export type CylinderExtensions = Record<CylinderName, number>;

const snapshot: CylinderExtensions = {
  feed: CYLINDER_RETRACT_POS,
  sorting1: CYLINDER_RETRACT_POS,
  sorting2: CYLINDER_RETRACT_POS,
};

/** 本帧行程写入（原地修改，保证所有读方看到同一份数据） */
export function writeCylinderExtensions(next: CylinderExtensions): void {
  snapshot.feed = next.feed;
  snapshot.sorting1 = next.sorting1;
  snapshot.sorting2 = next.sorting2;
}

/** 本帧行程读取：推板刚体 / 视觉推杆 / 工件必须都用这里的值 */
export function readCylinderExtensions(): CylinderExtensions {
  return snapshot;
}

/** 目标行程：伸出时按气缸用途取对应限位，缩回统一回 CYLINDER_RETRACT_POS */
export function cylinderTarget(name: CylinderName, extended: boolean): number {
  if (!extended) return CYLINDER_RETRACT_POS;
  return name === 'feed' ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;
}

/**
 * 带阻尼 + 单帧限速的行程推进（纯函数，便于单测）。
 * 限速是必要的：kinematic 刚体一帧跳太远会直接穿过动态刚体，也会让
 * 「推板贴着工件」的视觉在快速伸出时脱节。
 */
export function stepExtension(current: number, target: number, delta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= COMPONENT.CYLINDER_THRESHOLD) return target;

  const clampedDelta = Math.max(0, Math.min(delta, 0.05));
  const factor = 1 - Math.pow(1 - COMPONENT.CYLINDER_SMOOTH_FACTOR, clampedDelta * 60);
  const step = diff * factor;
  const limited = Math.max(-COMPONENT.CYLINDER_MAX_STEP, Math.min(COMPONENT.CYLINDER_MAX_STEP, step));
  const next = current + limited;
  return Math.abs(target - next) <= COMPONENT.CYLINDER_THRESHOLD ? target : next;
}
