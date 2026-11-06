/**
 * 分拣斜槽的几何与落料轨迹：纯函数，无 React / 无 WebGL，可被单测直接引用。
 * 可见槽面、挡边、收集盒与工件滑落轨迹全部由这里的一组常量推导，
 * 避免出现「看得见的槽」和「工件走的路径」对不上而穿模。
 */
import { SORT_CHUTE, COMPONENT, CYLINDERS, type SortSlot } from './constants';

/** 工件中心相对槽面的抬升：底板半厚 + 工件半高 + 一点防共面余量 */
export const CHUTE_LIFT = SORT_CHUTE.PLATE_T / 2 + COMPONENT.MATERIAL_HALF_SIZE + 0.006;

/** 槽面倾角（沿 -Z 方向下降） */
export const CHUTE_ANGLE = Math.atan2(
  SORT_CHUTE.ENTRY_Y - SORT_CHUTE.EXIT_Y,
  SORT_CHUTE.ENTRY_Z - SORT_CHUTE.EXIT_Z,
);

/** 槽底板绕 X 轴的旋转：局部 +Z 端抬高，对应世界 -Z 端降低 */
export const CHUTE_PLATE_ROTATION: [number, number, number] = [-CHUTE_ANGLE, 0, 0];

/** 槽底板：中心点、长度（沿斜面）、旋转 */
export const CHUTE_PLATE = {
  center: [
    0,
    (SORT_CHUTE.ENTRY_Y + SORT_CHUTE.EXIT_Y) / 2 - SORT_CHUTE.PLATE_T / 2,
    (SORT_CHUTE.ENTRY_Z + SORT_CHUTE.EXIT_Z) / 2,
  ] as [number, number, number],
  length: Math.hypot(
    SORT_CHUTE.ENTRY_Z - SORT_CHUTE.EXIT_Z,
    SORT_CHUTE.ENTRY_Y - SORT_CHUTE.EXIT_Y,
  ),
} as const;

/** 收集盒中心 Z（接在槽尾外侧） */
export const BIN_CENTER_Z = SORT_CHUTE.EXIT_Z - SORT_CHUTE.BIN_HALF_Z;

/** 盒内工件中心高度（落在盒底板上） */
export const BIN_REST_Y = SORT_CHUTE.BIN_FLOOR_Y + COMPONENT.MATERIAL_HALF_SIZE + 0.008;

/** 槽位 X 与分拣气缸 X 严格同源 */
export function sortSlotX(slot: SortSlot): number {
  return CYLINDERS[slot];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 槽面在给定 Z 处的高度（线性斜面） */
export function chuteSurfaceY(z: number): number {
  const t = clamp01((z - SORT_CHUTE.ENTRY_Z) / (SORT_CHUTE.EXIT_Z - SORT_CHUTE.ENTRY_Z));
  return SORT_CHUTE.ENTRY_Y + (SORT_CHUTE.EXIT_Y - SORT_CHUTE.ENTRY_Y) * t;
}

/** 滑落阶段中「沿槽面」所占的时间比例，其余时间用于落进收集盒 */
export const CHUTE_SLIDE_RATIO = 0.72;

/**
 * 工件滑落轨迹：t ∈ [0,1]。
 * 前段沿槽面加速下滑（u² 模拟重力），后段从槽尾落入收集盒并停稳。
 */
export function sortChutePoint(slot: SortSlot, t: number): [number, number, number] {
  const x = sortSlotX(slot);
  const p = clamp01(t);

  if (p <= CHUTE_SLIDE_RATIO) {
    const u = p / CHUTE_SLIDE_RATIO;
    const s = u * u;
    const z = SORT_CHUTE.ENTRY_Z + (SORT_CHUTE.EXIT_Z - SORT_CHUTE.ENTRY_Z) * s;
    return [x, chuteSurfaceY(z) + CHUTE_LIFT, z];
  }

  const v = (p - CHUTE_SLIDE_RATIO) / (1 - CHUTE_SLIDE_RATIO);
  const z = SORT_CHUTE.EXIT_Z + (BIN_CENTER_Z - SORT_CHUTE.EXIT_Z) * v;
  const startY = chuteSurfaceY(SORT_CHUTE.EXIT_Z) + CHUTE_LIFT;
  return [x, startY + (BIN_REST_Y - startY) * v, z];
}

/** 工件中心越过槽口即进入滑落阶段（由推板送出的最后一段行程判定） */
export function isAtChuteEntry(z: number): boolean {
  return z <= SORT_CHUTE.ENTRY_Z;
}
