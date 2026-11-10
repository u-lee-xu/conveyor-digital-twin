/**
 * 传送带分拣场景 - 场景常量定义
 * 从 shared/constants.ts 迁移，作为场景特定配置
 *
 * 分区说明：
 *   LAYOUT   — 布局坐标、位置
 *   VISUAL   — 颜色、外观风格（公共色来自共享工业视觉令牌）
 *   COMPONENT — 部件尺寸参数
 *   PHYSICS  — 碰撞组、物理参数
 *
 * 颜色 / 布光 / 贴面间隙与自动配药场景共用
 * shared/src/styles/industrialVisual.ts 这一个来源；本文件只保留
 * 传送带设备专属的输送带、物料与机位参数。
 */

// 直接引用纯常量模块，避免 Node 端自检把 shared 总入口的 React / WS 服务拉进来
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL, LABEL_COLORS,
} from '../../../../shared/src/styles/industrialVisual';

// ============================================================
// LAYOUT 布局坐标
// ============================================================

// 传感器位置参数
export const SENSORS = {
  feed: -1.3,
  color: -0.2,
  material: 0.9,
} as const;

// 气缸位置参数
export const CYLINDERS = {
  feed: -1.3,
  sorting1: -0.2,
  sorting2: 0.9,
} as const;

// 传送带参数
export const CONVEYOR_SPEED = 0.01;
export const CONVEYOR_END_X = 1.8;
export const CONVEYOR_START_X = -1.75;
export const CONVEYOR_Z_MIN = -0.35;
export const CONVEYOR_Z_MAX = 0.35;

// 传感器参数
export const SENSOR_RANGE = 0.15;

// 物料参数
export const MATERIAL_INITIAL_POSITION: [number, number, number] = [-1.3, 1.10, 0.6];

// 3D对象位置
export const CYLINDER_POSITIONS = {
  feed: [-1.3, 1.12, 1.2] as [number, number, number],
  sorting1: [-0.2, 1.12, 0.8] as [number, number, number],
  sorting2: [0.9, 1.12, 0.8] as [number, number, number],
} as const;

export const SENSOR_POSITIONS = {
  feed: [-1.3, 1.45, 0] as [number, number, number],
  color: [-0.2, 1.45, 0] as [number, number, number],
  material: [0.9, 1.45, 0] as [number, number, number],
} as const;

export const MATERIAL_TABLE_POSITION: [number, number, number] = [-1.3, 0.98, 0.6];

// 气缸行程参数
// 分拣行程由 0.33 加到 0.40：推板要一直把工件送过带边、送到斜槽槽口，
// 否则工件会停在带面上再由推板「撞出去」，既容易穿模也看不到滑落过程。
export const CYLINDER_RETRACT_POS = -0.22;
export const CYLINDER_EXTEND_POS_FEED = 0.405;
export const CYLINDER_EXTEND_POS_SORT = 0.40;
export const CYLINDER_LIMIT_ZONE = 0.04;

// ============================================================
// VISUAL 视觉风格
// ============================================================

export const VISUAL = {
  ...INDUSTRIAL_VISUAL,
  SCENE_LIGHTING: INDUSTRIAL_LIGHTING,

  // 传送带专属：橡胶带面用暗槽色，带边/台面用亮银与铝银
  BELT_COLOR: INDUSTRIAL_VISUAL.PROFILE_SLOT_COLOR,
  BELT_EDGE_COLOR: INDUSTRIAL_VISUAL.ENDCAP_COLOR,
  TABLE_COLOR: INDUSTRIAL_VISUAL.BASE_COLOR,

  // 物料：蓝色工件 / 黑色工件（与四药仓标识色同族，降饱和）
  MATERIAL_BLUE_COLOR: '#3b82f6',
  MATERIAL_BLACK_COLOR: '#4b5563',

  // 亮态发光强度：与配药场景的按钮柜指示灯、三色灯塔同一档
  LAMP_EMISSIVE: 2.2,
  SENSOR_EMISSIVE_INTENSITY: 1.5,
  LED_EMISSIVE_INTENSITY: 2.0,

  // 传感器「检测到」状态：浅绿在深蓝背景下对比不足，改用高饱和亮琥珀橙
  // （区别于灯塔的红/黄/绿，又比原浅绿亮得多），并提高自发光档位。
  SENSOR_ACTIVE_COLOR: '#ff9020',
  // 3.6 会在 tone mapping 下过曝成白点，反而失去橙色辨识度
  SENSOR_ACTIVE_EMISSIVE: 2.0,

  // 三维标签 chip：与配药场景共用同一份配色
  LABEL_COLORS,
} as const;

/** 相邻可见面最小贴面错开量（与配药场景共用，防 z-fighting） */
export const SURFACE_GAP = INDUSTRIAL_DETAIL.SURFACE_GAP;

// ============================================================
// COMPONENT 部件尺寸
// ============================================================

export const COMPONENT = {
  // 传送带
  CONVEYOR_LENGTH: 3.5,
  CONVEYOR_WIDTH: 0.6,
  CONVEYOR_HEIGHT: 1.0,
  CONVEYOR_SURFACE_Y: 1.0,
  ROLLER_COUNT: 12,
  ROLLER_RADIUS: 0.06,
  ROLLER_SPEED: 0.03,

  // 物料：可见 BoxGeometry 与 CuboidCollider 都由这一个半尺寸推导，
  // 不允许再出现「看得见的 0.075 / 碰得到的 0.07」这种错位（穿模来源之一）。
  MATERIAL_HALF_SIZE: 0.07,
  MATERIAL_TABLE_HALF_XZ: 0.25,
  MATERIAL_TABLE_HALF_Y: 0.025,
  MATERIAL_TABLE_LEG_OFFSET: 0.12,
  MATERIAL_TABLE_LEG_HEIGHT: 0.5,

  // 气缸：紧凑型带导杆气缸（截面 0.22 见方、缸长 0.62），比旧的
  // 0.18×0.8 细长盒更接近实物的缸径/行程比例；推板加宽到 0.26×0.20。
  CYLINDER_BODY_HALF_LEN: 0.31,
  CYLINDER_BODY_HALF_XZ: 0.11,
  CYLINDER_ROD_LEN: 0.7,
  CYLINDER_PUSH_PLATE_HALF: [0.13, 0.10, 0.0225] as [number, number, number],
  CYLINDER_SMOOTH_FACTOR: 0.10,
  /** 单帧最大行程：kinematic 瞬移过快会穿透刚体，也便于物料严格跟随 */
  CYLINDER_MAX_STEP: 0.045,
  CYLINDER_THRESHOLD: 0.001,
  CYLINDER_SURFACE_OFFSET: 0.72,
  CYLINDER_PUSH_OFFSET: 0.02,

  // 信号灯塔
  TOWER_MODULE_RADIUS: 0.065,
  TOWER_MODULE_HEIGHT: 0.13,
  TOWER_DOME_RADIUS: 0.065,
  TOWER_BASE_RADIUS_TOP: 0.075,
  TOWER_BASE_RADIUS_BOTTOM: 0.09,
  TOWER_BASE_HEIGHT: 0.04,
  TOWER_POLE_RADIUS: 0.025,
  TOWER_POLE_HEIGHT: 0.22,
  TOWER_GAP: 0.015,
  TOWER_GLOW_RADIUS: 0.03,
  TOWER_GLOW_OFFSET: 0.025,
  TOWER_POSITION: [1.6, 0.98, -0.5] as [number, number, number],

  // 传感器状态 LED：贴壳体顶面的小灯珠，不再是比壳体还抢眼的大黑球
  SENSOR_BULB_SCALE: 1,
  SENSOR_BULB_RADIUS: 0.009,
  SENSOR_BULB_OFFSET_Y: 0.066,
  SENSOR_BULB_OFFSET_Z: 0,
  SENSOR_HALO_INNER: 0.012,
  SENSOR_HALO_OUTER: 0.022,
} as const;

// ============================================================
// BELT_DETAIL 输送线拟真细节（视觉与碰撞体尺寸互不改写）
// 参考自动配药机机架的「铝挤型材 + T 槽 + 端盖 + 可调地脚」语言
// ============================================================

export const BELT_DETAIL = {
  RAIL_H: 0.10,          // 铝挤型侧梁高
  RAIL_T: 0.05,          // 侧梁厚（Z 向）
  RAIL_OUT: 0.02,        // 侧梁内侧面相对滚筒端面的让位（留出滚筒端盖空间）
  SLOT_W: 0.016,         // T 槽开口宽
  SLOT_H: 0.006,         // T 槽视觉深度
  SLOT_INSET: SURFACE_GAP,
  END_PLATE_T: 0.012,    // 端部封板
  END_PLATE_H: 0.11,
  ROLLER_SHAFT_R: 0.012, // 滚筒轴
  ROLLER_CAP_R: 0.018,   // 滚筒端盖
  ROLLER_CAP_T: 0.008,
  LEG_T: 0.055,          // 支腿方型材
  FOOT_R: 0.048,         // 可调地脚
  FOOT_H: 0.018,
  CROSS_H: 0.035,        // 支腿间横撑
  GUIDE_H: 0.038,        // 侧挡边
  GUIDE_T: 0.008,
  MOTOR_R: 0.055,        // 驱动端减速电机
  MOTOR_LEN: 0.13,
  MOTOR_FLANGE_R: 0.065,
  LAMP_STEP: 0.13,       // 三色灯塔分层灯罩间距
} as const;

/** 气缸拟真细节：拉杆、双导杆、T 槽贴片、黄铜气接头与安装支座 */
export const CYLINDER_DETAIL = {
  TIE_ROD_R: 0.008,      // 四角拉杆
  TIE_ROD_XZ: 0.072,     // 拉杆中心距气缸轴线
  TIE_ROD_LEN: 0.66,     // 随缸体缩短到 0.62
  SLOT_W: 0.014,         // 缸体侧向 T 槽
  SLOT_T: 0.004,
  PORT_R: 0.018,         // 气口
  PORT_T: 0.014,
  BOLT_R: 0.006,         // 端盖螺栓
  BOLT_T: 0.004,
  BOLT_XZ: 0.062,
  GUIDE_ROD_R: 0.014,    // 双导杆（防推板转动，实物带导杆气缸标配）
  GUIDE_ROD_X: 0.088,
  /**
   * 三根杆（中心活塞杆 + 双导杆）插进缸体内的尾段。
   * 杆系整体随 rodRef 平移，但根部必须始终留在缸体里，否则伸出行程会把
   * 杆整根拉出端盖、出现「推杆和缸体断开」的空隙。
   * 约束：EXTEND_FEED - TAIL <= 端盖外沿(0.345)，且 RETRACT - TAIL >= -0.345
   *       => 0.06 <= TAIL <= 0.125，取 0.10；__model_detail_check.test.ts 锁死。
   */
  ROD_TAIL: 0.10,
  /** 三根杆统一长度：推板位置 + 尾部插入段，导杆与活塞杆同源 */
  GUIDE_ROD_LEN: COMPONENT.CYLINDER_ROD_LEN + 0.10,
  MOUNT_Z0: 0.36,        // 安装支座从带侧梁外沿伸到缸体下方
  MOUNT_Z1: 0.82,
  MOUNT_Y: 0.96,
  MOUNT_T: 0.016,

  // 磁性开关：嵌在缸体侧面 T 槽里的细长模块，不是顶面的大方块
  MAGSWITCH_LEN: 0.060,
  MAGSWITCH_T: 0.010,
  MAGSWITCH_W: 0.014,
  // 教学展台里略放大到 7mm，保证「伸出位开关亮」在远景可辨
  MAGSWITCH_LED_R: 0.007,
  MAGSWITCH_CABLE_R: 0.0025,
  // 中心活塞杆：实物镀硬铬亮银且比两根导杆细，旧版 φ70 深色棒过于抢眼
  ROD_R: 0.022,
  GUIDE_BUSHING_R: 0.022,
  GUIDE_BUSHING_LEN: 0.018,
  PLATE_BOLT_R: 0.005,
  PLATE_BOLT_X: 0.095,
  PLATE_BOLT_Z: 0.068,
  // 部件展台专用展示底座：只读视觉，整机恒不启用
  STAND_W: 0.30,
  STAND_D: 0.76,
  STAND_T: 0.014,
  STAND_Y: -0.14,
  // 网格面到缸体底面只有 0.03：托板加矮支柱刚好把缸体垫实，不插进缸体
  STAND_PILLAR_H: 0.030,
  STAND_PILLAR_Z: 0.22,
} as const;

/**
 * 传感器拟真尺寸：上料 / 物料是同型号漫反射光电开关，色标是独立的颜色传感器。
 * 与 CYLINDER_DETAIL / BELT_DETAIL 同层，所有可见尺寸只在这里定义一次。
 */
export const SENSOR_DETAIL = {
  // 共用壳体与支架
  BODY_W: 0.048,
  BODY_H: 0.062,
  BODY_D: 0.078,
  BODY_Y: 0.030,
  FRONT_Z: 0.039,
  BACK_Z: -0.039,
  BRACKET_H: 0.15,
  BRACKET_W: 0.02,
  BASE_W: 0.07,
  BASE_D: 0.05,
  BASE_T: 0.012,
  CABLE_R: 0.005,
  CABLE_LEN: 0.022,
  LABEL_W: 0.015,
  LABEL_H: 0.015,
  LABEL_D: 0.02,
  // 漫反射光电：双圆透镜 + 灵敏度旋钮 + 状态灯
  LENS_R: 0.009,
  LENS_X: 0.011,
  TRIMMER_R: 0.007,
  STATUS_R: 0.005,
  PANEL_W: 0.034,
  PANEL_H: 0.046,
  // 色标传感器：更厚机身 + 宽矩形投受光窗 + 可见光斑 + 示教键
  COLOR_BODY_W: 0.058,
  COLOR_BODY_H: 0.072,
  COLOR_BODY_D: 0.086,
  COLOR_FRONT_Z: 0.043,
  WINDOW_W: 0.034,
  WINDOW_H: 0.022,
  SPOT_R: 0.006,
  TEACH_W: 0.010,
  TEACH_H: 0.010,
  BAR_W: 0.010,
  BAR_H: 0.024,
  DISPLAY_W: 0.028,
  DISPLAY_H: 0.006,
} as const;

/** 部件展台里可切换的三只传感器型号，键集合与 SENSOR_POSITIONS 一致 */
export const SENSOR_VARIANTS = {
  feed: '上料光电',
  color: '色标传感器',
  material: '物料光电',
} as const;

export type SensorVariant = keyof typeof SENSOR_VARIANTS;

export function isSensorVariant(name: string | null | undefined): name is SensorVariant {
  return !!name && Object.prototype.hasOwnProperty.call(SENSOR_VARIANTS, name);
}

/**
 * 推板 → 工件跟随的运动学常量。
 * 推板刚体中心 Z 与工件中心 Z 的差必须 ≥ 两个半厚之和，否则必然视觉穿模；
 * 这里由几何常量推导，不再像旧版那样写死 0.12 的「目标偏移」。
 */
export const PUSH_KINEMATICS = {
  CLEARANCE: 0.012,
  FOLLOW_GAP: COMPONENT.CYLINDER_PUSH_PLATE_HALF[2]
    + COMPONENT.MATERIAL_HALF_SIZE + 0.012,
} as const;

/**
 * 分拣槽 / 收集盒：工件被推出带面后沿斜槽滑落，不再凭空消失。
 * 两个分拣位各一条槽，X 与 CYLINDERS.sorting1 / sorting2 对齐；
 * 槽在 -Z 侧（推料方向），整体低于带面，避免挡住带面上的工件。
 */
export const SORT_CHUTE = {
  ENTRY_Z: -0.40,        // 槽口：刚过带边 / 侧梁外沿
  EXIT_Z: -1.00,         // 槽尾
  ENTRY_Y: 0.98,         // 槽面高度（带面 1.00 略低，工件顺势滑出）
  EXIT_Y: 0.50,
  HALF_W: 0.16,          // 槽半宽（工件半宽 0.07，留足余量）
  WALL_H: 0.075,
  PLATE_T: 0.02,

  // 槽面细节：亮银钢板 + 窄导向暗线 + 横向防滑压条。
  // 旧版把整条槽面铺成深槽色，从总览机位看就是两条黑带，读不出「斜槽」。
  GUIDE_HALF_W: 0.022,
  CLEAT_COUNT: 5,
  CLEAT_T: 0.006,
  CLEAT_D: 0.014,

  BIN_HALF_X: 0.20,
  BIN_HALF_Z: 0.18,
  BIN_FLOOR_Y: 0.42,
  BIN_WALL_H: 0.18,
  // 靠近观察者的 -Z 侧做成低唇口，否则四壁等高会把盒子画成一块实心方块
  BIN_FRONT_WALL_H: 0.075,
  // 靠槽口的 +Z 侧也做低唇口：动态工件沿槽滑到底时底面约 0.51m，
  // 全高盒壁（顶 0.60m）会把它挡在盒外。
  BIN_BACK_WALL_H: 0.065,
  BIN_RIM_T: 0.008,
  WALL_T: 0.014,

  // 进口引导挡板：从槽口朝 +Z（传送带方向）延伸一小段，末端外张成喇叭口，
  // 把被推板送过来的工件导进槽道（工厂滑槽常见做法）。末端必须停在
  // 带面工件（Z≈0、半宽 0.07）之前，否则会挡住沿 X 输送的物料。
  GUIDE_LEN: 0.26,
  GUIDE_FLARE_LEN: 0.05,
  GUIDE_FLARE_ANGLE: 0.30,
  GUIDE_H: 0.09,
  GUIDE_BOTTOM_Y: 0.97,

  // 真实物理滑落：工件以 dynamic 刚体在倾斜槽面上由重力加速下滑
  CHUTE_FRICTION: 0.22,      // 与工件 0.6 取平均后仍小于 tan(38.7°)=0.80，保证能滑动
  // 静态槽板碰撞体向下加厚（顶面仍与可见槽面重合）：薄板在快速接触时
  // 求解器容易允许瞬时穿透，加厚后接触更稳定。
  COLLIDER_HALF_T: 0.04,
  // 释放到 dynamic 时几乎贴着槽面（1mm），避免自由落一小段再砸出穿透
  SLIDE_START_GAP: 0.001,
  SLIDE_LAUNCH_SPEED: 0.45,  // 沿下坡切线的入场初速度，避免起步卡住
  SLIDE_ALIGN_SECONDS: 0.12, // 入槽前用 kinematic 把偏离的 X 平滑归位
  SLIDE_MAX_SECONDS: 1.60,   // 看门狗：物理卡住也不能让演示状态机死等
  DROP_SECONDS: 0.28,        // 槽尾 → 盒内的落盒插值（姿态同时回正）
  SLIDE_SECONDS: 0.70,       // 兜底脚本轨迹时长（与重力滑落耗时同量级）
  SETTLE_SECONDS: 0.40,      // 落盒后停留（让观众看到入盒）
  MAX_STACK: 6,              // 3 列 × 2 排刚好装满一层，不会溢出盒口
  SLOTS: ['sorting1', 'sorting2'] as const,
} as const;

export type SortSlot = typeof SORT_CHUTE.SLOTS[number];

// ============================================================
// 机位（与自动配药 VIEW_PRESETS / CameraRig 同款交互）
// ============================================================

/**
 * 默认总览机位：从**传送带侧（-Z）**看向 +Z 侧的气缸，看到的是推板前脸，
 * 而不是气缸后端盖（原 +Z 机位等于从「屁股」方向看）。
 *
 * - 气缸全部位于 +Z 侧（CYLINDER_POSITIONS.z = 0.8 / 1.2），推料方向 -Z；
 * - 相机移到 -Z 后，屏幕右方向变为 (-X, -Z)，因此 target.x 取正值才能把
 *   设备整体推到左侧固定面板右边的可用视口里（原 +Z 机位取的是负值）；
 * - FOV 36° 与自动配药「整机总览」保持相近的画面占比。
 */
export const SCENE_FOV = 36;
export const SCENE_CAMERA: [number, number, number] = [4.2, 3.2, -5.4];
export const SCENE_TARGET: [number, number, number] = [0.25, 0.95, 0.0];

export const VIEW_PRESETS = {
  overview: {
    label: '整机总览', desc: '从传送带侧看气缸前脸，看清整条输送线、三组气缸与灯塔',
    camera: SCENE_CAMERA, target: SCENE_TARGET, fov: SCENE_FOV,
  },
  top: {
    label: '俯视', desc: '从上方核对物料走向与三个分拣位',
    camera: [0.01, 6.4, 0.02] as [number, number, number],
    target: [0, 0.95, 0] as [number, number, number], fov: 45,
  },
  feed: {
    label: '上料段', desc: '近景核对上料气缸推板正面、物料台与上料传感器',
    camera: [-2.6, 2.1, -2.7] as [number, number, number],
    target: [-1.15, 1.05, 0.3] as [number, number, number], fov: 38,
  },
  sorting: {
    label: '分拣段', desc: '从带侧近景核对两只分拣气缸推板与分拣槽',
    camera: [2.4, 2.1, -2.9] as [number, number, number],
    target: [0.55, 1.0, -0.1] as [number, number, number], fov: 38,
  },
  tower: {
    label: '灯塔端', desc: '从末端看三色灯塔与输送线驱动端',
    camera: [3.3, 1.9, -2.4] as [number, number, number],
    target: [1.55, 1.15, -0.45] as [number, number, number], fov: 38,
  },
} as const;

export type ConveyorViewKey = keyof typeof VIEW_PRESETS;
export const VIEW_BUTTONS: ConveyorViewKey[] = ['overview', 'top', 'feed', 'sorting', 'tower'];

// ============================================================
// ASSEMBLY 装配层 / PART STAGE 部件展台
//
// 与自动配药 constants.ts 同一套三层结构：
//   部件层（组件内相对自身原点的局部几何） → 装配层（本区块位置表） → 场景层（SceneContent）。
//
// 展台把**同一个组件**放到局部原点 1:1 渲染，只换相机与标尺网格，不复制任何几何，
// 因此整机与展台不会出现两套形状/尺寸/材质漂移。气缸 / 传感器这类多实例部件
// 由 PART_INSTANCES 给出各实例的世界位置，仍从上面的 LAYOUT 常量派生。
// ============================================================

export type Vec3 = [number, number, number];
export type PartKind = 'belt' | 'cylinder' | 'sensor' | 'chute' | 'tower' | 'table';

export interface PartPlacement {
  /** 部件局部原点在整机世界坐标中的位置 */
  position: Vec3;
  /** 局部原点的定义（组件实现必须遵守） */
  origin: string;
}

/** 整机装配表：SceneContent 里不再出现散落的裸坐标 */
export const ASSEMBLY: Record<PartKind, PartPlacement> = {
  belt: {
    position: [0, 0, 0],
    origin: '输送线中心地面；+X 沿输送方向，y=0 为可调地脚底面',
  },
  chute: {
    position: [0, 0, 0],
    origin: '两条分拣槽共用带面基准；y=0 为地面，槽面按 ENTRY_Y / EXIT_Y 定义',
  },
  table: {
    position: [...MATERIAL_TABLE_POSITION] as Vec3,
    origin: '物料台台面中心；y=0 为台面，支腿沿 -Y 下探',
  },
  cylinder: {
    position: [...CYLINDER_POSITIONS.feed] as Vec3,
    origin: '气缸轴线中心；组件内 rotation=[π/2,0,π] 把局部 +Y 映射到世界 -Z 推料方向',
  },
  sensor: {
    position: [...SENSOR_POSITIONS.feed] as Vec3,
    origin: '传感器壳体中心；安装支架沿 -Y 下探到安装板',
  },
  tower: {
    position: [...COMPONENT.TOWER_POSITION] as Vec3,
    origin: '底座法兰底面；y=0 为地面，三色灯罩沿 +Y 分层',
  },
};

/** 多实例部件：整机各实例的世界位置（键集合与 useDeviceStore 的实体名一致） */
export const PART_INSTANCES: {
  cylinder: Record<'feed' | 'sorting1' | 'sorting2', Vec3>;
  sensor: Record<'feed' | 'color' | 'material', Vec3>;
} = {
  cylinder: { ...CYLINDER_POSITIONS },
  sensor: { ...SENSOR_POSITIONS },
};

export interface PartStage {
  label: string;
  camera: Vec3;
  target: Vec3;
  fov: number;
  /** 标尺网格边长（格数 = 边长 / 0.1，即每格 0.1m） */
  grid: number;
  /** 网格所在局部 y（贴部件底面，避免穿过部件） */
  gridY: number;
}

/** ?stage=<key>：单个部件居中、1:1 真实尺度、0.1m 标尺网格 + 专用近景相机 */
export const PART_STAGES: Record<PartKind, PartStage> = {
  belt: {
    label: '输送线本体',
    camera: [2.6, 1.9, 3.6], target: [0, 0.5, 0], fov: 45, grid: 4, gridY: -0.02,
  },
    // 从 +X 侧 3/4 看：站在 +Z 正后方会被缸体挡住整条推杆 / 推板链。
    // 展台补了展示底座后把网格与相机一起放宽，保证缸体、推杆、推板、底座全在画面内。
    cylinder: {
      label: '带导杆推料气缸',
      camera: [1.60, 0.78, 1.42], target: [0, -0.02, 0.08], fov: 44, grid: 2, gridY: -0.14,
    },
    sensor: {
      label: '传感器',
    camera: [0.30, 0.20, 0.40], target: [0, 0.01, 0], fov: 36, grid: 0.3, gridY: -0.16,
  },
  chute: {
    label: '分拣斜槽与收集盒',
    camera: [1.75, 1.25, 1.65], target: [0.40, 0.65, -0.55], fov: 45, grid: 2.4, gridY: 0.42,
  },
  tower: {
    label: '三色信号灯',
    camera: [0.55, 0.62, 1.35], target: [0, 0.35, 0], fov: 38, grid: 1, gridY: -0.02,
  },
  table: {
    label: '上料物料台',
    camera: [0.95, 0.55, 1.20], target: [0, -0.40, 0], fov: 40, grid: 1, gridY: -0.90,
  },
};

/** 展台部件的局部原点定义：截图 / 自检时明确「这个部件以哪个面为基准」 */
export const PART_STAGE_ORIGIN: Record<PartKind, string> = {
  belt: ASSEMBLY.belt.origin,
  cylinder: ASSEMBLY.cylinder.origin,
  sensor: ASSEMBLY.sensor.origin,
  chute: ASSEMBLY.chute.origin,
  tower: ASSEMBLY.tower.origin,
  table: ASSEMBLY.table.origin,
};

/**
 * 展台键校验：必须用 hasOwnProperty，不能写成 !!PART_STAGES[name]。
 * 普通对象的 `__proto__` / `constructor` 会沿原型链取到真值，
 * 会让 ?stage=__proto__ 这类输入绕过校验并污染相机目标。
 */
export function isPartStage(name: string | null | undefined): name is PartKind {
  return !!name && Object.prototype.hasOwnProperty.call(PART_STAGES, name);
}

// ============================================================
// PHYSICS 物理参数
// ============================================================

export const PHYSICS = {
  // 传送带碰撞
  CONVEYOR_BELT_FRICTION: 1.5,
  CONVEYOR_BELT_HALF_Y: 0.02,

  // 物料碰撞
  MATERIAL_FRICTION: 0.6,
  MATERIAL_RESTITUTION: 0.0,
  MATERIAL_LINEAR_DAMPING: 0.5,
  MATERIAL_ANGULAR_DAMPING: 0.8,
  MATERIAL_TABLE_FRICTION: 1.0,

  // 推板检测范围
  PUSH_DETECT_RANGE_X: 0.35,
  PUSH_DETECT_RANGE_Y: 0.4,

  // 传感器检测范围
  SENSOR_DETECT_RANGE_X: 0.2,
  SENSOR_DETECT_RANGE_Z: 0.35,

  // 掉落回收
  FALL_RECOVERY_Y: -1,
  CONVEYOR_Z_MARGIN: 0.05,
} as const;
