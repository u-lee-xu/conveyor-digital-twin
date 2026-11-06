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

  // 传感器：LED 移到壳体顶部并放大，机位翻到 -Z 侧后仍从斜上方可见
  SENSOR_BULB_SCALE: 1.35,
  SENSOR_BULB_RADIUS: 0.018,
  SENSOR_BULB_OFFSET_Y: 0.085,
  SENSOR_BULB_OFFSET_Z: 0,
  SENSOR_HALO_INNER: 0.026,
  SENSOR_HALO_OUTER: 0.046,
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
  GUIDE_ROD_LEN: 0.60,
  MOUNT_Z0: 0.36,        // 安装支座从带侧梁外沿伸到缸体下方
  MOUNT_Z1: 0.82,
  MOUNT_Y: 0.96,
  MOUNT_T: 0.016,
} as const;

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
  BIN_RIM_T: 0.008,
  WALL_T: 0.014,
  SLIDE_SECONDS: 0.70,   // 沿槽滑落时长
  SETTLE_SECONDS: 0.40,  // 落盒后停留（让观众看到入盒）
  MAX_STACK: 6,          // 3 列 × 2 排刚好装满一层，不会溢出盒口
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
