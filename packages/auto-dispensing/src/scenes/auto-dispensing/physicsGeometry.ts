/**
 * 自动配药「物理世界」的纯几何层与运行时诊断（无 React / 无 WebGL，可被单测直接引用）。
 *
 * 为什么物理层要单独放：
 *   视觉整机挂在 `<group scale={[±SCENE_SCALE, SCENE_SCALE, SCENE_SCALE]}>` 下，
 *   镜像布局时 X 是**负缩放**。Rapier 的 collider 不接受负行列式变换，
 *   把刚体塞进那个 group 会导致碰撞体退化或反向。因此刚体与静态碰撞体统一放在
 *   `<Physics>` 下、用本文件的 toPhysicsWorld() 直接换算成世界坐标。
 *
 * 尺度约定：所有长度 × SCENE_SCALE，重力也 × SCENE_SCALE。
 *   由 d = ½gt² 可知长度与重力同比例放大后运动**时间尺度不变**，
 *   所以物理过程与 1:1 真实设备一致，推出速度只需按长度比例 × SCENE_SCALE。
 */
import {
  SCENE_SCALE, PILL_R, PILL_H,
  CHUTE_EXIT_Z, CHUTE_RAMP_MID_Y, CHUTE_RAMP_MID_Z,
  CHUTE_RAMP_LEN, CHUTE_RAMP_ANGLE, CHUTE_RAMP_PILL_START_Y,
  CHUTE_RAMP_END_Z, CHUTE_RAMP_END_Y,
  HOPPER, HOPPER_CENTER_Y, HOPPER_CENTER_Z, HOPPER_OPEN_Y,
  MAG_TRAY_W, MAG_TRAY_Y, MAG_TRAY_Z0, MAG_TRAY_Z1,
  MAGAZINE_X, CYL_FEED_STROKE, FEED_CYL_TIME, CHUTE_RAIL,
  type Vec3, type MagazineId,
} from './constants';

const S = SCENE_SCALE;

export const PHYSICS = {
  SCALE: S,
  /** 与长度同比例放大，保持运动时间尺度与真实设备一致 */
  GRAVITY: -9.8 * S,
  TIME_STEP: 1 / 60,
  /** 退药气缸推板速度 = 行程 / 伸缸时间；药片以该初速度沿 +Z 被推出料筒 */
  PUSH_SPEED: (CYL_FEED_STROKE / FEED_CYL_TIME) * S,
  /** 药片生成时略高于斜槽面，避免初始穿透被求解器弹飞 */
  SPAWN_CLEARANCE: 0.004,
  /**
   * 斜槽面板 / 侧导轨尺寸，与 MagazineUnit.ChuteRamp 的视觉 boxGeometry 完全一致。
   * 全部取自 constants.ts 的 CHUTE_RAIL（视觉与碰撞体的唯一来源），
   * 挡边外移 / 抬高后碰撞体同步移动，不会出现「看不见的墙」或「看得见却挡不住」。
   */
  RAMP_T: CHUTE_RAIL.RAMP_T,
  RAIL_T: CHUTE_RAIL.T,
  RAIL_H: CHUTE_RAIL.H,
  /** 侧导轨 X 中心相对底板外沿的回退量：MAG_TRAY_W/2 - RAIL_X = 挡边中心 X */
  RAIL_X: CHUTE_RAIL.T / 2 - CHUTE_RAIL.OUT,
  /** 侧导轨 Y 中心相对斜槽中心的抬升量：底板顶面 + RISE + 半个挡边高 */
  RAIL_Y: CHUTE_RAIL.RAMP_T / 2 + CHUTE_RAIL.RISE + CHUTE_RAIL.H / 2,
  /** tan(斜槽角)≈1.15，摩擦取 0.28：能靠重力滑下去，又不至于打滑失控 */
  FRICTION: 0.28,
  RESTITUTION: 0.02,
  ANGULAR_DAMPING: 2.5,
  /**
   * 有物理世界时的兜底超时（s）。软件渲染 / 低帧率下物理步进可能慢于真实时间，
   * 放宽到 1.8s 让刚体自己落斗；无物理世界（单测、纯逻辑环境）仍用原来的 0.55s。
   */
  PILL_TIMEOUT: 1.8,
} as const;

export interface WorldPoint { x: number; y: number; z: number }

export interface ColliderBox {
  /** 刚体（世界）中心 */
  position: Vec3;
  /** 碰撞体相对刚体的旋转；斜槽绕 X 轴倾斜，镜像 X 不改变该角度 */
  rotation: Vec3;
  /** CuboidCollider 半尺寸（世界单位） */
  half: Vec3;
}

/** 局部装配坐标 → 放大后的物理世界坐标；镜像布局只翻 X */
export function toPhysicsWorld(x: number, y: number, z: number, mirrored: boolean): Vec3 {
  return [S * (mirrored ? -x : x), S * y, S * z];
}

/** 药片被推板顶出托板出口时的中心（与斜槽起点共点） */
export function pillSpawnWorld(mag: MagazineId, mirrored: boolean): Vec3 {
  return toPhysicsWorld(
    MAGAZINE_X[mag],
    CHUTE_RAMP_PILL_START_Y + PHYSICS.SPAWN_CLEARANCE,
    CHUTE_EXIT_Z,
    mirrored,
  );
}

/** 水平托板：药片从料筒底部被推过这段板后进入斜槽 */
export function trayColliderWorld(mag: MagazineId, mirrored: boolean): ColliderBox {
  return {
    position: toPhysicsWorld(
      MAGAZINE_X[mag], MAG_TRAY_Y, (MAG_TRAY_Z0 + MAG_TRAY_Z1) / 2, mirrored,
    ),
    rotation: [0, 0, 0],
    half: [MAG_TRAY_W / 2 * S, 0.003 * S, (MAG_TRAY_Z1 - MAG_TRAY_Z0) / 2 * S],
  };
}

/** 落料斜槽面：绕 X 轴倾斜，+Z 端下降，药片靠重力滑向料斗 */
export function rampColliderWorld(mag: MagazineId, mirrored: boolean): ColliderBox {
  return {
    position: toPhysicsWorld(MAGAZINE_X[mag], CHUTE_RAMP_MID_Y, CHUTE_RAMP_MID_Z, mirrored),
    rotation: [CHUTE_RAMP_ANGLE, 0, 0],
    half: [MAG_TRAY_W / 2 * S, PHYSICS.RAMP_T / 2 * S, CHUTE_RAMP_LEN / 2 * S],
  };
}

/** 斜槽两侧导轨：约束药片不从 ±X 滚出槽外 */
export function railCollidersWorld(mag: MagazineId, mirrored: boolean): ColliderBox[] {
  return [-1, 1].map((side) => ({
    position: toPhysicsWorld(
      MAGAZINE_X[mag] + side * (MAG_TRAY_W / 2 - PHYSICS.RAIL_X),
      CHUTE_RAMP_MID_Y + PHYSICS.RAIL_Y,
      CHUTE_RAMP_MID_Z,
      mirrored,
    ),
    rotation: [CHUTE_RAMP_ANGLE, 0, 0],
    half: [PHYSICS.RAIL_T / 2 * S, PHYSICS.RAIL_H / 2 * S, CHUTE_RAMP_LEN / 2 * S],
  }));
}

/** 四个供药单元的全部静态碰撞体 */
export function allStaticColliders(mag: MagazineId, mirrored: boolean): ColliderBox[] {
  return [
    trayColliderWorld(mag, mirrored),
    rampColliderWorld(mag, mirrored),
    ...railCollidersWorld(mag, mirrored),
  ];
}

/** 取药料斗中心的物理世界坐标（料斗固定在滑块上，X 随 sliderX 变化） */
export function hopperCenterWorld(sliderXLocal: number, mirrored: boolean): Vec3 {
  return toPhysicsWorld(sliderXLocal, HOPPER_CENTER_Y, HOPPER_CENTER_Z, mirrored);
}

export interface HopperColliderPart { center: Vec3; half: Vec3 }

/**
 * 取药料斗的内腔碰撞体：底板 + 四壁（相对斗心的局部偏移，均为世界单位）。
 * 药片滑出斜槽后会被 +Z 壁挡住并落到底板上，而不是高速飞过料斗。
 * 斜槽末端高于斗口 0.022m，药片从 -Z 壁上方飞入，不会撞在壁顶。
 */
export function hopperColliderParts(): HopperColliderPart[] {
  const { W, H, D, T } = HOPPER;
  const halfW = W / 2 * S;
  const halfH = H / 2 * S;
  const halfD = D / 2 * S;
  const t = T * S;
  return [
    { center: [0, -halfH + t / 2, 0], half: [halfW, t / 2, halfD] },
    { center: [-(halfW - t / 2), 0, 0], half: [t / 2, halfH, halfD] },
    { center: [halfW - t / 2, 0, 0], half: [t / 2, halfH, halfD] },
    { center: [0, 0, -(halfD - t / 2)], half: [halfW - t, halfH, t / 2] },
    { center: [0, 0, halfD - t / 2], half: [halfW - t, halfH, t / 2] },
  ];
}

/**
 * 落斗判定：药片**越过料斗口平面**且交点落在内腔 X/Z 范围内。
 *
 * 关键点：R3F 的 useFrame 是渲染帧，软件渲染下可能只有 10~15fps，
 * 而 Rapier 内部按 1/60 步进，两次采样之间刚体可能已经飞过整个斗腔，
 * 直接拿「当前帧位置」判断会漏判。这里改为在 prev→cur 线段上求与斗口
 * 平面的交点，用**交点**而非终点判定，低帧率下依然精确。
 *
 * 判定成立即把刚体移除并计入 hopperStock，斗内药片仍由 SliderHopper 静态渲染。
 */
export function crossedHopperMouth(
  prev: WorldPoint,
  cur: WorldPoint,
  hopperXLocal: number,
  mirrored: boolean,
): boolean {
  const hx = S * (mirrored ? -hopperXLocal : hopperXLocal);
  const hz = S * HOPPER_CENTER_Z;
  const halfW = (HOPPER.W / 2 - HOPPER.T) * S;
  const halfD = (HOPPER.D / 2 - HOPPER.T) * S;
  const rimY = HOPPER_OPEN_Y * S;
  const bottomY = (HOPPER_OPEN_Y - HOPPER.H) * S;

  const insideXZ = (x: number, z: number) =>
    Math.abs(x - hx) < halfW && Math.abs(z - hz) < halfD;

  // ① 正常情况：本帧从斗口上方穿到下方 → 用插值求交点
  if (prev.y > rimY && cur.y <= rimY) {
    const u = (prev.y - rimY) / (prev.y - cur.y);
    return insideXZ(
      prev.x + (cur.x - prev.x) * u,
      prev.z + (cur.z - prev.z) * u,
    );
  }

  // ② 已经处于斗腔内（首帧即低于斗口 / 采样起点偏低）→ 补判，但不能已穿出斗底
  return cur.y <= rimY && cur.y > bottomY && insideXZ(cur.x, cur.z);
}

// ============================================================
// 运行时能力标记 / 诊断计数
//
// useDispenseLoop 需要知道「当前是否挂了真实物理世界」才能选择兜底超时；
// 单测里只有 hook、没有 Canvas，标记保持 false，工艺链仍能按原节奏跑完。
// ============================================================

export interface PhysicsStats {
  active: boolean;
  spawned: number;
  landedByPhysics: number;
  resolvedByFallback: number;
}

const stats: PhysicsStats = {
  active: false, spawned: 0, landedByPhysics: 0, resolvedByFallback: 0,
};

export function setPhysicsActive(active: boolean) { stats.active = active; }
export function isPhysicsActive() { return stats.active; }
export function notePillSpawned() { stats.spawned += 1; }
export function notePillLanded() { stats.landedByPhysics += 1; }
export function notePillResolvedByFallback() { stats.resolvedByFallback += 1; }
export function getPhysicsStats(): PhysicsStats { return { ...stats }; }

/** 开发期轨迹采样：CDP 自检用来确认药片是沿斜槽滑行而不是自由下落 */
export interface PillTracePoint {
  id: string; at: number; x: number; y: number; z: number;
}
const pillTrace: PillTracePoint[] = [];
export function notePillFrame(id: string, p: WorldPoint) {
  pillTrace.push({ id, at: performance.now(), x: p.x, y: p.y, z: p.z });
  if (pillTrace.length > 800) pillTrace.splice(0, pillTrace.length - 800);
}
export function getPillTrace(): PillTracePoint[] { return pillTrace.slice(); }

/** 供单测 / 几何自检复用的斜槽端点（局部坐标） */
export const RAMP_GEOMETRY = {
  startZ: CHUTE_EXIT_Z,
  endZ: CHUTE_RAMP_END_Z,
  endY: CHUTE_RAMP_END_Y,
  length: CHUTE_RAMP_LEN,
  angle: CHUTE_RAMP_ANGLE,
  pillRadius: PILL_R,
  pillHeight: PILL_H,
} as const;
