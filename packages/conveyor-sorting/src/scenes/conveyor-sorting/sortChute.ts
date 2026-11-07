/**
 * 分拣斜槽的几何与落料轨迹：纯函数，无 React / 无 WebGL，可被单测直接引用。
 *
 * 这里同时是「可见槽面」「静态碰撞体」「工件入场姿态」三者的唯一几何源。
 * 关键约定：工件中心不是沿世界 +Y 抬高，而是沿**槽面法线**抬高 CHUTE_LIFT，
 * 且刚体姿态绕 X 轴旋转 -CHUTE_ANGLE。这样工件底面与槽面严格平行，
 * 不会出现「方块平放、斜槽倾斜」造成的下坡角穿模。
 */
import { SORT_CHUTE, COMPONENT, CYLINDERS, type SortSlot } from './constants';

/** 槽面倾角（沿 -Z 方向下降），dy/dz = 0.8 → 约 38.7° */
export const CHUTE_ANGLE = Math.atan2(
  SORT_CHUTE.ENTRY_Y - SORT_CHUTE.EXIT_Y,
  SORT_CHUTE.ENTRY_Z - SORT_CHUTE.EXIT_Z,
);

/** 槽面单位法线（朝上、略朝 -Z）；用于沿法线抬升工件与放置静态碰撞体 */
export const CHUTE_NORMAL: [number, number, number] = [
  0, Math.cos(CHUTE_ANGLE), -Math.sin(CHUTE_ANGLE),
];

/** 下坡单位切向量（-Z 且 -Y）；动态刚体的入场初速度方向 */
export const CHUTE_TANGENT: [number, number, number] = [
  0, -Math.sin(CHUTE_ANGLE), -Math.cos(CHUTE_ANGLE),
];

/** 槽底板 / 工件绕 X 轴的旋转（局部 +Z 端抬高，对应世界 -Z 端降低） */
export const CHUTE_PLATE_ROTATION: [number, number, number] = [-CHUTE_ANGLE, 0, 0];

/** 与 CHUTE_PLATE_ROTATION 等价的四元数，供 dynamic 刚体 setRotation 使用 */
export const CHUTE_QUATERNION: [number, number, number, number] = (() => {
  const half = -CHUTE_ANGLE / 2;
  return [Math.sin(half), 0, 0, Math.cos(half)];
})();

/**
 * 工件中心相对**槽板顶面**的抬升（沿槽面法线）：工件半高 + 防共面余量。
 *
 * 注意：ENTRY_Y / EXIT_Y 描述的是槽板顶面，不是板中心；旧版这里多加了一次
 * PLATE_T/2，导致工件悬空 1cm、净空公式又重复扣一次板厚，双重口径错位。
 */
export const CHUTE_LIFT = COMPONENT.MATERIAL_HALF_SIZE + 0.006;

/** dynamic 释放时的抬升：几乎贴着槽面，避免先自由落一小段再砸出求解器穿透 */
export const SLIDE_START_LIFT = COMPONENT.MATERIAL_HALF_SIZE + SORT_CHUTE.SLIDE_START_GAP;

/**
 * 槽底板：中心点、长度（沿斜面）、旋转。
 * 中心沿**法线**从顶面中点下移半个板厚，保证旋转后的板顶面
 * 与 ENTRY_Y / EXIT_Y 定义的斜面精确重合（含碰撞体顶面）。
 */
export const CHUTE_PLATE = {
  center: [
    0,
    (SORT_CHUTE.ENTRY_Y + SORT_CHUTE.EXIT_Y) / 2
      - (SORT_CHUTE.PLATE_T / 2) * CHUTE_NORMAL[1],
    (SORT_CHUTE.ENTRY_Z + SORT_CHUTE.EXIT_Z) / 2
      - (SORT_CHUTE.PLATE_T / 2) * CHUTE_NORMAL[2],
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

/** 引导挡板最靠 +Z 的末端：必须留在带面工件（Z≈0，半宽 0.07）之前 */
export const GUIDE_END_Z = SORT_CHUTE.ENTRY_Z + SORT_CHUTE.GUIDE_LEN + SORT_CHUTE.GUIDE_FLARE_LEN;

/** 工件中心到达槽尾时的 Z（沿法线抬升会把它往 -Z 推一点） */
export const CHUTE_END_CENTER_Z = SORT_CHUTE.EXIT_Z + CHUTE_LIFT * CHUTE_NORMAL[2];

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

/**
 * 工件中心：以「法线垂足的 Z」为参数，沿槽面法线抬升 CHUTE_LIFT。
 * 物理滑落的入场位置、兜底脚本轨迹、静态槽面三者都用这一个函数。
 */
export function chuteCenterAt(slot: SortSlot, footZ: number): [number, number, number] {
  return [
    sortSlotX(slot),
    chuteSurfaceY(footZ) + CHUTE_LIFT * CHUTE_NORMAL[1],
    footZ + CHUTE_LIFT * CHUTE_NORMAL[2],
  ];
}

/** dynamic 释放位置：贴着槽面、姿态与槽面平行，交给物理引擎后不再二次抬起 */
export function slideStartCenter(slot: SortSlot): [number, number, number] {
  return [
    sortSlotX(slot),
    chuteSurfaceY(SORT_CHUTE.ENTRY_Z) + SLIDE_START_LIFT * CHUTE_NORMAL[1],
    SORT_CHUTE.ENTRY_Z + SLIDE_START_LIFT * CHUTE_NORMAL[2],
  ];
}

/** 动态滑落是否已经到底（或已经掉出槽面），用于切回落盒阶段 */
export function isChuteEndReached(pos: { x: number; y: number; z: number }): boolean {
  return pos.z <= CHUTE_END_CENTER_Z + 0.02 || pos.y <= SORT_CHUTE.EXIT_Y + 0.02;
}

/**
 * 立方体沿给定法线的支撑半径：half * Σ|n · R·e_i|。
 * 方块平放在斜面上时，靠下坡的那个角会比「中心 − 半高」更低；
 * 只有按真实姿态算支撑半径，净空判定才不会把正常接触误报成穿模。
 */
function cubeSupport(ny: number, nz: number, q: { x: number; y: number; z: number; w: number }): number {
  const { x, y, z, w } = q;
  // 旋转矩阵第 1/2 行（法线只有 Y/Z 分量，不需要第 0 行）
  const r1 = [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)];
  const r2 = [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  let sum = 0;
  for (let i = 0; i < 3; i += 1) sum += Math.abs(ny * r1[i] + nz * r2[i]);
  return COMPONENT.MATERIAL_HALF_SIZE * sum;
}

/**
 * 工件底面到斜槽面的法向净空（米）。
 *
 * 槽面方程 y = slope*z + intercept，法向距离 = (y - slope*z - intercept)/√(1+slope²)。
 * 减去「按刚体实际姿态算出的工件支撑半径」后：
 * ≥ 0 表示没啃进槽面，< 0 就是穿模。CDP 逐帧采样这个值做量化验收。
 * 不传 rotation 时按「平放方块」计算，正好可以复现旧版穿模量。
 * planeDistance 的分母已经是顶面，不能再扣一次 PLATE_T/2。
 */
export function chuteClearance(
  pos: { x: number; y: number; z: number },
  rotation?: { x: number; y: number; z: number; w: number },
): number {
  const slope = (SORT_CHUTE.ENTRY_Y - SORT_CHUTE.EXIT_Y)
    / (SORT_CHUTE.ENTRY_Z - SORT_CHUTE.EXIT_Z);
  const intercept = SORT_CHUTE.ENTRY_Y - slope * SORT_CHUTE.ENTRY_Z;
  const norm = Math.hypot(1, slope);
  const planeDistance = (pos.y - slope * pos.z - intercept) / norm;
  const ny = 1 / norm;
  const nz = -slope / norm;
  // 未传姿态时用一个轴对齐（单位）四元数，等价于旧版「方块平放」
  const q = rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  return planeDistance - cubeSupport(ny, nz, q);
}

/** 滑落阶段中「沿槽面」所占的时间比例，其余时间用于落进收集盒 */
export const CHUTE_SLIDE_RATIO = 0.72;

/**
 * 兜底脚本轨迹：t ∈ [0,1]。物理引擎正常时不会走这条路径，
 * 只在看门狗超时 / 无物理世界的纯函数单测里使用；仍然保持与槽面平行。
 */
export function sortChutePoint(slot: SortSlot, t: number): [number, number, number] {
  const p = clamp01(t);

  if (p <= CHUTE_SLIDE_RATIO) {
    const u = p / CHUTE_SLIDE_RATIO;
    const s = u * u;
    const footZ = SORT_CHUTE.ENTRY_Z + (SORT_CHUTE.EXIT_Z - SORT_CHUTE.ENTRY_Z) * s;
    return chuteCenterAt(slot, footZ);
  }

  const v = (p - CHUTE_SLIDE_RATIO) / (1 - CHUTE_SLIDE_RATIO);
  const [, exitY, exitZ] = chuteCenterAt(slot, SORT_CHUTE.EXIT_Z);
  return [
    sortSlotX(slot),
    exitY + (BIN_REST_Y - exitY) * v,
    exitZ + (BIN_CENTER_Z - exitZ) * v,
  ];
}

/** 工件中心越过槽口即进入滑落阶段（由推板送出的最后一段行程判定） */
export function isAtChuteEntry(z: number): boolean {
  return z <= SORT_CHUTE.ENTRY_Z;
}
