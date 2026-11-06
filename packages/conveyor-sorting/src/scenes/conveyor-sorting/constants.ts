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
export const CYLINDER_RETRACT_POS = -0.22;
export const CYLINDER_EXTEND_POS_FEED = 0.405;
export const CYLINDER_EXTEND_POS_SORT = 0.33;
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

  // 物料
  MATERIAL_HALF_SIZE: 0.07,
  MATERIAL_TABLE_HALF_XZ: 0.25,
  MATERIAL_TABLE_HALF_Y: 0.025,
  MATERIAL_TABLE_LEG_OFFSET: 0.12,
  MATERIAL_TABLE_LEG_HEIGHT: 0.5,

  // 气缸
  CYLINDER_BODY_HALF_LEN: 0.4,
  CYLINDER_ROD_LEN: 0.7,
  CYLINDER_PUSH_PLATE_HALF: [0.1, 0.09, 0.02] as [number, number, number],
  CYLINDER_SMOOTH_FACTOR: 0.12,
  CYLINDER_THRESHOLD: 0.001,
  CYLINDER_SURFACE_OFFSET: 0.72,
  CYLINDER_PUSH_OFFSET: 0.02,
  CYLINDER_PUSH_TARGET_OFFSET: 0.12,

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

  // 传感器
  SENSOR_BULB_SCALE: 1.5,
  SENSOR_BULB_RADIUS: 0.012,
  SENSOR_BULB_OFFSET_Y: 0.06,
  SENSOR_BULB_OFFSET_Z: 0.04,
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

/** 气缸拟真细节：拉杆、T 槽贴片、黄铜气接头与端盖螺栓 */
export const CYLINDER_DETAIL = {
  TIE_ROD_R: 0.008,      // 四角拉杆
  TIE_ROD_XZ: 0.072,     // 拉杆中心距气缸轴线
  TIE_ROD_LEN: 0.82,
  SLOT_W: 0.014,         // 缸体侧向 T 槽
  SLOT_T: 0.004,
  PORT_R: 0.018,         // 气口
  PORT_T: 0.014,
  BOLT_R: 0.006,         // 端盖螺栓
  BOLT_T: 0.004,
  BOLT_XZ: 0.062,
} as const;

// ============================================================
// 机位（与自动配药 VIEW_PRESETS / CameraRig 同款交互）
// ============================================================

/**
 * 默认总览机位：与自动配药「整机总览」保持相近的画面占比。
 * 传送带本体世界尺寸比放大 3 倍的配药整机小，故用 36° 收窄视角；
 * target.x 略向 -X 偏，让设备落在左侧固定面板右边的可用视口里。
 */
export const SCENE_FOV = 36;
export const SCENE_CAMERA: [number, number, number] = [4.2, 3.1, 5.4];
export const SCENE_TARGET: [number, number, number] = [-0.25, 0.95, 0.1];

export const VIEW_PRESETS = {
  overview: {
    label: '整机总览', desc: '微斜正侧，看清整条输送线、三组气缸与灯塔',
    camera: SCENE_CAMERA, target: SCENE_TARGET, fov: SCENE_FOV,
  },
  top: {
    label: '俯视', desc: '从上方核对物料走向与三个分拣位',
    camera: [0.01, 6.4, 0.02] as [number, number, number],
    target: [0, 0.95, 0] as [number, number, number], fov: 45,
  },
  feed: {
    label: '上料段', desc: '近景核对上料气缸、物料台与上料传感器',
    camera: [-2.6, 2.0, 2.6] as [number, number, number],
    target: [-1.15, 1.05, 0.25] as [number, number, number], fov: 38,
  },
  sorting: {
    label: '分拣段', desc: '近景核对色标/物料传感器与两只分拣气缸',
    camera: [2.4, 2.0, 2.7] as [number, number, number],
    target: [0.55, 1.05, 0.15] as [number, number, number], fov: 38,
  },
  tower: {
    label: '灯塔端', desc: '从末端看三色灯塔与输送线驱动端',
    camera: [3.3, 1.9, -1.9] as [number, number, number],
    target: [1.55, 1.2, -0.45] as [number, number, number], fov: 38,
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
