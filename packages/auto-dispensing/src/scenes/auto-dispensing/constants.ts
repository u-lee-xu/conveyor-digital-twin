/**
 * 自动配药系统 - 核心常量定义
 *
 * 分区说明：
 *   LAYOUT    — 布局坐标、位置
 *   VISUAL    — 颜色、外观风格
 *   COMPONENT — 部件尺寸参数
 *   ADDRESS   — PLC 变量地址表（与 websocket-server/mock-addresses.js 保持一致）
 *
 * 颜色 / 布光 / 贴面间隙来自 @digital-twin/shared 的工业视觉令牌，
 * 与传送带分拣场景共用同一来源；本文件只保留配药设备专属的配色与几何。
 */

// 直接引用共享包里的纯常量模块：本文件会被 Node 端自检单测导入，
// 走 @digital-twin/shared 总入口会把 React / WebSocket 服务一并拉进来。
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL,
} from '../../../../shared/src/styles/industrialVisual';

// ============================================================
// LAYOUT 布局坐标
// ============================================================

/**
 * 整机渲染的等比放大系数（视觉部件 / 相机 / 物理世界共用）。
 * 放在 constants.ts 是为了让物理层也能引用同一尺度，避免出现第二套「3 倍」硬编码。
 */
export const SCENE_SCALE = 3.0;

/** 传送轴总长（X 方向） */
export const AXIS_LENGTH = 2.2;
/** 滑台料斗行程起点（X）— 起始限位位 */
export const SLIDER_MIN_X = 0.25;
/** 滑台料斗行程终点（X）— 终点限位位（翻转取药位） */
export const SLIDER_MAX_X = 1.95;

/** 传动轴高度（Y，轴心） */
export const AXIS_Y = 1.0;
/** 滑台顶部平台高度 */
export const SLIDER_TOP_Y = 1.1;

/** 药仓位置（X，均匀分布），料斗停该位接药 */
export const MAGAZINE_X = {
  A: 0.55,
  B: 0.95,
  C: 1.35,
  D: 1.75,
} as const;
export type MagazineId = 'A' | 'B' | 'C' | 'D';

/** 取药仓位置：滑台终点就是放药位，仓左缘正对翻转后的料斗口 */
export const COLLECT_BIN_X = SLIDER_MAX_X + 0.17;
/** 灯塔立杆位置 */
export const LIGHT_TOWER_X = SLIDER_MIN_X - 0.42;

/** 控制柜位置 */
export const CABINET_POSITION: [number, number, number] = [-0.1, 0.55, 0.52];

/**
 * 默认整机机位（SCENE_SCALE=3 后的世界坐标；独立 App 与平台壳共用）。
 *
 * 旧机位站在起点端外侧、俯角 33°，长轴沿视线斜向压缩、远端细节变小。
 * 新机位把相机移到设备中心正侧方：俯角约 16°、水平斜角约 13°，长轴基本水平展开，
 * 同时 target.x 比设备中心（≈3.35）偏左约 1 个单位，让设备落在左侧固定面板
 * （独立 App 17rem / 平台壳 w-80）右边的可用视口里，而不是被面板压住左端。
 */
export const SCENE_CAMERA: [number, number, number] = [0.2, 5.0, 9.8];
export const SCENE_TARGET: [number, number, number] = [2.4, 2.3, 0.3];
export const SCENE_FOV = 38;

/** ?part=hopper 部件预览专用近景相机：对准滑块/旋转气缸/料斗装配体 */
export const HOPPER_PREVIEW_CAMERA: [number, number, number] = [2.1, 4.3, 2.4];
export const HOPPER_PREVIEW_TARGET: [number, number, number] = [0.75, 3.45, 0.45];
export const HOPPER_PREVIEW_FOV = 28;

/** ?part=magazine 供药总成预览相机：正对四料筒/推药气缸/落料斜槽，核对形状与相对位置 */
export const MAGAZINE_PREVIEW_CAMERA: [number, number, number] = [1.3, 7.4, 2.4];
export const MAGAZINE_PREVIEW_TARGET: [number, number, number] = [3.45, 4.25, -0.02];
export const MAGAZINE_PREVIEW_FOV = 34;

// ============================================================
// COMPONENT 部件尺寸参数
// ============================================================

export const AXIS_R = 0.015;
export const SUPPORT_TUBE_R = 0.035;

/** 滑台（滑块）尺寸 */
export const SLIDER_SIZE: [number, number, number] = [0.16, 0.09, 0.22];

/** 滚珠丝杆/导轨轴高（= 滑块中心：光杆和丝杆从滑块中间水平穿过） */
export const SCREW_Y = SLIDER_TOP_Y + SLIDER_SIZE[1] / 2;
/** 导轨半径 */
export const TRACK_R = 0.013;
/** 导轨中心高度（与丝杆同高，从滑块中间穿过） */
export const TRACK_Y = SCREW_Y;
// ---- 药片 / 供药料筒 ----
/** 药片：平放的圆柱（圆面水平、轴沿 Y），可沿托板 / 斜槽滑行 */
export const PILL_R = 0.020;
export const PILL_H = 0.014;
/** 药仓通道内半径：药片 φ0.040 + 单列间隙 */
export const MAG_TUBE_INNER_R = PILL_R + 0.004;
/** 药仓壁厚 / 外半径 */
export const MAG_WALL = 0.006;
export const MAG_TUBE_OUTER_R = MAG_TUBE_INNER_R + MAG_WALL;
/** 药仓容量（每仓最多堆叠药片数） */
export const MAG_CAPACITY = 10;
/** 药片堆叠步长（平放，一片厚度 + 可见层隙，便于展台逐片核对而不是看成实心柱） */
export const PILL_STACK_STEP = PILL_H + 0.0025;
/** 药仓管道高度：容纳整叠药片 + 顶部余量 */
export const MAG_TUBE_H = MAG_CAPACITY * PILL_STACK_STEP + 0.045;

/** 供药料筒底部托板上表面 Y：最底药片从这里被水平推出，须高于料斗开口 */
export const CHUTE_Y = 1.34;
/** 最底药片中心 Y（也是推药气缸轴线高度，两者必须严格对齐） */
export const PILL_BASE_Y = CHUTE_Y + PILL_H / 2;
/** 药仓底部托板（推杆把药片沿此板推到出口） */
export const MAG_TRAY_Y = CHUTE_Y - 0.004;
export const MAG_TRAY_Z0 = -0.06;
export const MAG_TRAY_Z1 = 0.06;
export const MAG_TRAY_W = 0.070;

/** 药仓安装托架：横梁 + 两根后置立柱（立柱 Z 在滑台行程之外，不挡滑块） */
export const MAG_RACK_Y = CHUTE_Y - 0.045;
export const MAG_RACK_Z = -0.10;
export const MAG_RACK_DEPTH = 0.30;
export const MAG_RACK_W = (MAGAZINE_X.D - MAGAZINE_X.A) + 0.30;
export const MAG_RACK_PILLAR_Z = -0.22;
export const MAG_RACK_PILLAR_X = [MAGAZINE_X.A - 0.12, MAGAZINE_X.D + 0.12] as const;

// ---- 推药气缸（圆筒，沿 +Z 推出最底一粒药）----
/** 缸体前端面 Z（活塞杆出口，缸体占 Z ∈ [FEED_CYL_Z - LEN, FEED_CYL_Z]） */
export const FEED_CYL_Z = -0.10;
/** 缸体长度 / 半径、推杆半径、推板厚度 */
export const FEED_CYL_LEN = 0.12;
export const FEED_CYL_R = 0.018;
export const FEED_ROD_R = 0.005;
export const FEED_PUSH_TH = 0.005;
/**
 * 推板「前表面」退回位 Z：紧贴最底药片的 -Z 缘（药片中心 Z=0，半径 PILL_R）。
 * 这样推杆一开始就顶住药片，不会出现「空推半程才碰到药」的错位。
 */
export const FEED_PUSH_Z0 = -PILL_R - 0.004;
/** 药片离开托板、进入落料斜槽时的中心 Z（= 托板 +Z 端） */
export const CHUTE_EXIT_Z = MAG_TRAY_Z1;
/** 推板前表面伸到位 Z（药片中心 = 该值 + PILL_R） */
export const FEED_PUSH_Z1 = CHUTE_EXIT_Z - PILL_R;
/** 推杆行程：由「退回贴片」到「把药片顶出托板」严格推导，不再手写 */
export const CYL_FEED_STROKE = FEED_PUSH_Z1 - FEED_PUSH_Z0;
/** 退药气缸伸/缩时间（s）：物理世界的推出初速度 = 行程 / 该时间，保证视觉与刚体同源 */
export const FEED_CYL_TIME = 0.35;
/**
 * 「本行程是否已出药」的真值放在 store.dispensed[mag]，由统一的伸到位上升沿事件写入，
 * 完全缩回才清除。这里不再从气缸 position 反推：用户伸缸未到位就点缩回时，
 * 位置推断会把「没出过药」误判成「已出药」，导致底层视觉药片凭空消失却没生成刚体。
 * 视觉渲染与物理刚体现在共用同一个显式状态，杜绝两边不同步。
 */
/** 料筒顶盖下沿 Y（标签/相机取景用） */
export const MAG_TUBE_TOP_Y = CHUTE_Y + MAG_TUBE_H;

// ------------------------------------------------------------
// 旋转气缸 + 取药料斗：全部几何量的唯一来源
//
// 参考件 ATEC HRQ10（见包内 旋转气缸.png）：主体 0.72×0.16×0.50 m 扁平铝块，
// 输出盘 φ0.56 装在顶面(+Y)，气管接头在 -X 侧。按 ~0.14 比例缩放到本场景。
//
// 安装姿态：**侧立**——把参考件的顶面(+Y)转向观众(+Z)，输出轴由 Y 变为 Z。
// 这样料斗能绕水平 Z 轴摆动 90°：angle=0 开口朝 +Y 接药，angle=1 开口朝 +X 倒药。
// 侧立后的坐标映射：参考宽 X→BODY_W，参考深 Z→BODY_H，参考高 Y→BODY_D。
// ------------------------------------------------------------

/** 气缸主体尺寸（侧立后，X 宽 × Y 高 × Z 厚） */
export const ROTARY_BODY = { W: 0.100, H: 0.070, D: 0.024 } as const;
/** 输出法兰盘（盘面朝 +Z，轴线沿 Z；盘径 ≈ 主体宽度的 78%，与参考件一致） */
export const ROTARY_DISC = { R: 0.039, TH: 0.008 } as const;
/** 气缸主体中心相对「滑块组原点」的偏移（贴滑块 +Z 侧面、与滑块中心同高） */
export const ROTARY_CENTER = {
  Y: SLIDER_SIZE[1] / 2,
  Z: SLIDER_SIZE[2] / 2 + ROTARY_BODY.D / 2 + 0.004,
} as const;
/** 料斗与法兰盘之间的连接臂厚度（沿 Z） */
export const HOPPER_BRACKET_TH = 0.006;
/** 取药料斗外形尺寸（X 宽 × Y 深 × Z 深）；开口朝 +Y，内腔可容纳 φ0.04 药片 */
export const HOPPER = { W: 0.072, H: 0.055, D: 0.060, T: 0.005 } as const;
/** 料斗底部相对盘面中心留的间隙（连接臂托住料斗底） */
export const HOPPER_FOOT_GAP = 0.006;

/** 法兰盘中心世界 Y（滑块组原点在 SLIDER_TOP_Y） */
export const DISC_CENTER_Y = SLIDER_TOP_Y + ROTARY_CENTER.Y;
/** 法兰盘中心世界 Z */
export const DISC_CENTER_Z = ROTARY_CENTER.Z + ROTARY_BODY.D / 2 + ROTARY_DISC.TH / 2;
/** 料斗中心相对盘心的局部偏移（在盘 group 内，随盘一起绕 Z 翻转） */
export const HOPPER_LOCAL_Y = HOPPER_FOOT_GAP + HOPPER.H / 2;
export const HOPPER_LOCAL_Z = ROTARY_DISC.TH / 2 + HOPPER_BRACKET_TH + HOPPER.D / 2;
/** 料斗中心世界坐标（angle=0，滑块在 sliderX 时） */
export const HOPPER_CENTER_Y = DISC_CENTER_Y + HOPPER_LOCAL_Y;
export const HOPPER_CENTER_Z = DISC_CENTER_Z + HOPPER_LOCAL_Z;
/** 料斗开口平面 Y（接药落点） */
export const HOPPER_OPEN_Y = HOPPER_CENTER_Y + HOPPER.H / 2;
/** 药片落入斗内一点的 Y（略低于开口，避免停在口沿上） */
export const PILL_LAND_Y = HOPPER_OPEN_Y - 0.012;

// ---- 落料斜槽：把推出的药片从料筒出口导到料斗口后缘上方 ----
/** 斜槽起点（与托板 +Z 端齐平，槽面高度 = 托板面，药片无台阶地滑上去） */
export const CHUTE_RAMP_Z0 = CHUTE_EXIT_Z;
export const CHUTE_RAMP_Y0 = CHUTE_Y;
/** 斜槽末端 Z（落在料斗开口范围内，即料斗 -Z 壁内侧一点） */
export const CHUTE_RAMP_END_Z = HOPPER_CENTER_Z - HOPPER.D / 2 + 0.006;
/** 斜槽末端槽面 Y（略高于料斗口，药片离开后正好落进斗） */
export const CHUTE_RAMP_END_Y = HOPPER_OPEN_Y + 0.022;
export const CHUTE_RAMP_DZ = CHUTE_RAMP_END_Z - CHUTE_RAMP_Z0;
export const CHUTE_RAMP_DY = CHUTE_RAMP_Y0 - CHUTE_RAMP_END_Y;
export const CHUTE_RAMP_LEN = Math.sqrt(CHUTE_RAMP_DZ ** 2 + CHUTE_RAMP_DY ** 2);
/** 绕 X 轴倾角：+Z 端下降，药片靠重力滑向料斗 */
export const CHUTE_RAMP_ANGLE = Math.atan2(CHUTE_RAMP_DY, CHUTE_RAMP_DZ);
export const CHUTE_RAMP_MID_Z = (CHUTE_RAMP_Z0 + CHUTE_RAMP_END_Z) / 2;
export const CHUTE_RAMP_MID_Y = (CHUTE_RAMP_Y0 + CHUTE_RAMP_END_Y) / 2;
/** 药片在斜槽起点/末端的中心 Y（槽面 + 半片厚） */
export const CHUTE_RAMP_PILL_START_Y = CHUTE_RAMP_Y0 + PILL_H / 2;
export const CHUTE_RAMP_PILL_END_Y = CHUTE_RAMP_END_Y + PILL_H / 2;
/**
 * 接药段旧「脚本插值飞行」的阶段分界，现已不再驱动渲染（改为 Rapier 刚体）。
 * 保留该比值只供几何自检校验斜槽段/落斗段的配比仍落在 (0,1) 内。
 */
export const PILL_FLIGHT_SPLIT = 0.62;
/** 料斗中心相对滑块中心的 X 偏移：料斗与法兰盘、滑块同轴，故为 0。
 *  演示停靠位 = 药仓 X - 该值，改装配时必须同步修改这里。 */
export const HOPPER_OFFSET_X = 0;
/** 翻转到位后料斗口相对滑块中心的坐标（倒药起点） */
export const DUMP_MOUTH_X = HOPPER_LOCAL_Y + HOPPER.H / 2;
export const DUMP_MOUTH_Y = DISC_CENTER_Y;
export const DUMP_MOUTH_Z = HOPPER_CENTER_Z;

/** 翻转缸行程 */
export const CYL_TILT_STROKE = 0.06;

/** 取药仓尺寸 */
export const COLLECT_BIN_SIZE: [number, number, number] = [0.22, 0.14, 0.26];
/** 取药仓台座高度：把放药位抬到接近料斗翻转高度，倒药落差合理 */
export const BIN_BASE_Y = 0.80;
/** 取药仓顶面 Y（倒药动画落点） */
export const BIN_TOP_Y = BIN_BASE_Y + COLLECT_BIN_SIZE[1];
/** 倒药落点 Y：取药仓顶面内侧一点（药片停在仓内可见位置） */
export const DUMP_LAND_Y = BIN_TOP_Y - 0.035;

/**
 * 丝杆/导轨两端（X）：右端必须越过取药仓右缘再留出一根立柱的宽度，
 * 否则 MachineFrame 的末端支撑柱会直接穿过抬高的取药仓。
 */
export const FRAME_AXLE_FROM = SLIDER_MIN_X - 0.1;
export const FRAME_AXLE_TO = COLLECT_BIN_X + COLLECT_BIN_SIZE[0] / 2 + 0.17;

/** 控制柜尺寸 */
export const CABINET_SIZE: [number, number, number] = [0.34, 0.5, 0.2];

// ============================================================
// 控制柜面板 / 操作元件（φ22 工业按钮盒比例）
//
// 全部为部件局部坐标：局部原点 = 柜脚安装基准，y=0 在柜脚，
// 面板法线朝 +Z（朝观察者）。面板尺寸由 CABINET_SIZE 推导，
// 门板后表面严格贴合柜体前表面，避免悬浮或 z-fighting。
// 组件只按这里的表格渲染，不在组件里回填坐标。
// ============================================================

const CABINET_PANEL_T = 0.006;

export const CABINET_PANEL = {
  W: CABINET_SIZE[0] - 0.04,              // 0.30
  H: CABINET_SIZE[1] - 0.10,              // 0.40
  T: CABINET_PANEL_T,
  CENTER_Y: CABINET_SIZE[1] / 2 + 0.01,   // 0.26，与柜体同高
  /** 面板前表面 Z = 柜体前表面 + 门板厚度 */
  FRONT_Z: CABINET_SIZE[2] / 2 + CABINET_PANEL_T,  // 0.106
  /** 银色安装环 / 黑色内圈 / 凸出的按钮头 */
  BEZEL_R: 0.017,
  BEZEL_T: 0.004,
  COLLAR_R: 0.0135,
  HEAD_R: 0.0115,
  HEAD_T: 0.010,
  /** 急停：黄色警示底盘 + 更大的红色蘑菇头 */
  ESTOP_BASE_R: 0.028,
  ESTOP_HEAD_R: 0.019,
  ESTOP_T: 0.018,
  /** 指示灯：金属环 + 凸面玻璃透镜 */
  LAMP_BEZEL_R: 0.014,
  LAMP_LENS_R: 0.0105,
  /** 元件下方的丝印铭牌 */
  PLATE_W: 0.058,
  PLATE_H: 0.014,
  PLATE_DY: -0.038,
  /** 分区标题条 / 分隔线 / 底部型号条 */
  TITLE_Y: 0.432,
  TITLE_W: 0.24,
  TITLE_H: 0.026,
  DIVIDER_Y: 0.302,
  FOOTER_Y: 0.085,
  /** 选择开关（φ22 两位旋钮） */
  SELECTOR_R: 0.017,
  SELECTOR_HANDLE_W: 0.008,
  SELECTOR_HANDLE_L: 0.022,
  /** 柜门锁芯 */
  LOCK_X: 0.128,
  LOCK_Y: 0.26,
  /** 元件细节色（金属安装环 / 内圈 / 警示底盘 / 铭牌） */
  COLORS: {
    bezel: '#e9eef4',
    collar: '#20272f',
    trim: '#4a5563',
    /** 急停标牌：RAL1021 警示黄 + 黑字，与实物一致 */
    estopBase: '#f2c200',
    warningText: '#1b1b1b',
    nameplate: '#f1f5f9',
    text: '#1f2937',
    symbol: '#ffffff',
  },
} as const;

/**
 * 五个操作按钮：两排分区，急停独占下排左侧（蘑菇头）。
 * 布局遵循施耐德官方规范「指示灯在上部、指令开关在下部，操作时手不遮挡指示」。
 */
export const CABINET_BUTTONS = [
  { key: 'start', label: '启动', color: '#15803d', x: -0.085, y: 0.258, kind: 'push' },
  { key: 'stop', label: '停止', color: '#c62828', x: 0, y: 0.258, kind: 'push' },
  { key: 'reset', label: '复位', color: '#d99a1b', x: 0.085, y: 0.258, kind: 'push' },
  { key: 'estop', label: '急停', color: '#c62828', x: -0.085, y: 0.160, kind: 'estop' },
  { key: 'confirm', label: '取药确认', color: '#2563a8', x: 0.085, y: 0.160, kind: 'push' },
] as const;

/** 手动 / 自动 两位选择开关：φ22 黑色短手柄，手柄角度只读跟随当前 AppMode */
export const CABINET_SELECTOR = {
  x: 0,
  y: 0.160,
  label: '手动 / 自动',
  /** 各 AppMode 对应的手柄偏角（rad，面板平面内；scoring 归到中位） */
  angles: { manual: -0.7, sim: 0, scoring: 0, auto: 0.7 },
} as const;

/** 三个状态指示灯：颜色统一取 VISUAL.LAMP_*，这里只管位置与铭牌 */
export const CABINET_LAMPS = [
  { key: 'green', label: '运行', x: -0.085 },
  { key: 'yellow', label: '待机', x: 0 },
  { key: 'red', label: '报警', x: 0.085 },
] as const;

/** 指示灯排高度（与按钮排分区） */
export const CABINET_LAMP_Y = 0.365;

/** 信号灯塔（局部原点 = 立杆底面，y=0 为地面） */
export const LIGHT_DOME_R = 0.045;
/** 最下层（红）灯罩中心高度，同时也是立杆顶面：灯罩必须坐在杆顶，不能悬浮 */
export const LIGHT_POLE_Y = 1.15;
/** 立杆高度由灯罩中心高度推导（旧值 0.55 会让灯头凭空悬浮 0.6m，展台核对时暴露） */
export const LIGHT_POLE_H = LIGHT_POLE_Y;
/** 三色灯罩堆叠步距（= 一个灯罩半径，灯罩彼此贴合） */
export const LIGHT_DOME_STEP = LIGHT_DOME_R;

// ============================================================
// ASSEMBLY 装配层
//
// 三层结构：部件层（局部原点 + 接口面） → 装配层（本区块） → 场景层（SceneContent）。
// 组件内部一律使用「相对自身原点」的局部坐标，禁止出现 CHUTE_Y / SLIDER_TOP_Y
// 等世界常量；把部件搬到别处只需改这里的 position，不必重算组件内几十处坐标。
// ============================================================

export type Vec3 = [number, number, number];

export interface PartPlacement {
  /** 部件局部原点在世界坐标中的位置 */
  position: Vec3;
  /** 局部原点的定义（组件实现必须遵守） */
  origin: string;
}

/** 托架横梁中心 X */
export const MAG_RACK_CX = (MAGAZINE_X.A + MAGAZINE_X.D) / 2;

/**
 * 装配表。局部原点约定：
 *  frame         机架左端轴承位在地面；局部 +X 沿丝杆、y=0 为地面
 *  magazineRack  托架横梁中心；y=0 为横梁中心面
 *  magazineX     托板上表面中心；+Y 向上、+Z 为推药出药方向
 *  sliderHopper  滑块底面中心；X 由 store.sliderX 动态覆盖
 *  collectBin    台座顶面 / 仓体底面；y=0 为仓底
 *  cabinet       控制柜安装基准（柜脚局部 y=0.01）
 *  lightTower    灯塔立杆底面；y=0 为地面
 */
export const ASSEMBLY: Record<
  'frame' | 'magazineRack' | 'sliderHopper' | 'collectBin' | 'cabinet' | 'lightTower',
  PartPlacement
> = {
  frame: {
    position: [FRAME_AXLE_FROM, 0, 0],
    origin: '机架左端轴承位，局部 +X 沿丝杆，y=0 为地面',
  },
  magazineRack: {
    position: [MAG_RACK_CX, MAG_RACK_Y, MAG_RACK_Z],
    origin: '托架横梁中心，y=0 为横梁中心面',
  },
  sliderHopper: {
    position: [SLIDER_MIN_X, SLIDER_TOP_Y, 0],
    origin: '滑块底面中心，X 由 store.sliderX 动态覆盖',
  },
  collectBin: {
    position: [COLLECT_BIN_X, BIN_BASE_Y, 0],
    origin: '台座顶面 / 仓体底面，y=0 为仓底',
  },
  cabinet: {
    position: [...CABINET_POSITION] as Vec3,
    origin: '控制柜安装基准，柜脚局部 y=0.01',
  },
  lightTower: {
    position: [LIGHT_TOWER_X, 0, 0],
    origin: '灯塔立杆底面，y=0 为地面',
  },
};

/** 四个供药单元共用同一套局部几何，装配表只给出各自的 X */
export const MAGAZINE_ASSEMBLY: Record<MagazineId, Vec3> = {
  A: [MAGAZINE_X.A, CHUTE_Y, 0],
  B: [MAGAZINE_X.B, CHUTE_Y, 0],
  C: [MAGAZINE_X.C, CHUTE_Y, 0],
  D: [MAGAZINE_X.D, CHUTE_Y, 0],
};

// ---- 部件局部几何（全部相对各自原点，供组件直接取用）----

/**
 * 贴面细节与宿主表面之间允许的最小错开量（m，局部坐标）。
 *
 * 整机渲染时整体 ×SCENE_SCALE(3)，而旧代码大量用 0.0005~0.001 的「几乎贴着」
 * 偏置：在远距离相机 + 软件渲染的深度精度下，两个面会反复争夺深度值，
 * 表现为灰/黑斑驳闪烁（z-fighting）。现在统一用这个量把可见面错开；
 * 若两个实体必须接触，则让贴合面**嵌进宿主内部**（朝内的面不可见），
 * 而不是让两个朝外的面停在同一平面。
 */
export const SURFACE_GAP = INDUSTRIAL_DETAIL.SURFACE_GAP;

/**
 * 落料斜槽的侧挡边（视觉 MagazineUnit.ChuteRamp 与物理 railCollidersWorld 共用）。
 * 旧版挡边外沿与底板外沿同为 ±MAG_TRAY_W/2、挡边底面又落在底板中心线上，
 * 两个朝外的面完全共面 → 斜槽一闪闪地穿模。现在外沿向外错开 OUT、
 * 底面高于底板顶面 RISE，视觉与碰撞体一起改，药片仍被真实挡住。
 */
export const CHUTE_RAIL = {
  /** 斜槽底板厚度（Y）；视觉 box 与 rampColliderWorld 共用 */
  RAMP_T: 0.004,
  /** 挡边厚度（X） */
  T: 0.004,
  /** 挡边高度（Y） */
  H: 0.018,
  /** 挡边外沿超出底板外沿的量；同时是挡边内沿让出的量 */
  OUT: SURFACE_GAP + 0.0005,
  /** 挡边底面高出底板顶面的量 */
  RISE: SURFACE_GAP,
} as const;

/** 机架垫脚顶面高出底座顶面的量：两者不再共面，避免灰/黑重叠闪烁 */
export const FOOT_RISE = 0.008;

/** 机架：原点 = 左端轴承位地面 */
export const FRAME = {
  AXLE_FROM: 0,
  AXLE_TO: FRAME_AXLE_TO - FRAME_AXLE_FROM,
  SCREW_H: SCREW_Y,
  TRACK_H: TRACK_Y,
  TRACK_Z: 0.09,
  BASE_H: 0.04,
  BASE_PAD: 0.5,
  BASE_D: 0.5,
  SUPPORT_W: 0.05,
  SUPPORT_D: 0.3,
  BEARING_R: 0.05,
  FOOT_W: 0.08,
  FOOT_D: 0.55,
  FOOT_OFFSET: 0.15,
} as const;
export const FRAME_LEN = FRAME.AXLE_TO - FRAME.AXLE_FROM;
export const FRAME_CX = FRAME_LEN / 2;

/**
 * 滚珠丝杆传动参数：几何 / 自转联动 / 演示速度共用同一来源。
 *
 * 旧实现把「螺距」写死在 MachineFrame.tsx 里为 0.09 m/转：对 Ø30 主轴而言
 * 导程/直径 = 3.0、螺纹升角 43.7°、全长仅 25 圈，是一根稀疏弹簧而非滚珠丝杆。
 * 真实 Ø32 滚珠丝杆标准导程 5 / 10 / 20 mm，升角约 3°~12°；取 20 mm/转
 * （大导程系列），升角 12.0°、112.5 圈 / 2.25 m，牙顶外径 ≈ Ø41。
 *
 * 注意：PULSES_PER_M 是「直线标尺式」PLC 高速计数（1 脉冲 = 10 mm 直线位移），
 * 并非电机轴编码器，因此不与 LEAD 做「每转脉冲数」换算，两者语义独立。
 */
export const SCREW_DETAIL = {
  /** 导程：丝杆每转一圈，滑台移动的距离（m/转） */
  LEAD: 0.020,
  /** 螺旋筋中心半径：内缘略嵌入轴面，避免牙悬空 */
  THREAD_R: AXIS_R + 0.0025,
  /** 螺旋筋半径：牙顶 = THREAD_R + 此值，必须小于滚珠螺母内孔 */
  THREAD_TUBE_R: 0.003,
  /**
   * TubeGeometry 每圈采样点。导程细化后圈数从 25 增至 112.5，
   * 每圈取 12 点（配合 radial=4）可把三角形总量压回旧实现同量级，
   * 细牙在屏幕上仅数像素，折线化不可见，但软件渲染帧率不受拖累。
   */
  SEGMENTS_PER_TURN: 12,
  /** 螺旋筋截面的径向分段 */
  THREAD_RADIAL_SEGMENTS: 4,
  /** 演示滑台速度（m/s）；丝杆转速 = SLIDER_SPEED / LEAD */
  SLIDER_SPEED: 0.32,
} as const;

/**
 * 机架拟真细节（全部相对机架局部原点，只做「增细节」不改装配坐标）。
 * 参照滚珠丝杆直线模组实物：铝挤型底座、方形直线导轨、固定端轴承座、
 * 一端伺服电机 + 梅花联轴器、侧面拖链槽。
 *
 * 关键接口：方轨半高 = TRACK_R，因此导轨下沿仍是 FRAME.TRACK_H - TRACK_R，
 * 与 SENSOR.BRACKET_TOP_Y（原点/终点传感器 L 形吊架夹持面）严格闭合。
 */
export const FRAME_DETAIL = {
  // 铝挤型底座：侧面 T 槽、端盖、顶面安装螺栓
  PROFILE_SLOT_W: 0.012,
  PROFILE_SLOT_H: 0.006,
  PROFILE_SLOT_INSET: 0.012,
  END_CAP_T: 0.012,
  BOLT_R: 0.004,
  BOLT_H: 0.003,
  BOLT_PITCH: 0.22,
  // 方形直线导轨（半高 = TRACK_R，保持传感器吊架接口不变）
  RAIL_HALF: TRACK_R,
  RAIL_GROOVE_W: 0.004,
  RAIL_BOLT_R: 0.0035,
  RAIL_BOLT_PITCH: 0.18,
  // 伺服电机 + 联轴器：沿 -X 从固定端轴承座向外伸。
  // 轴承座长 0.08（局部 -0.04~+0.04）；联轴器右端贴近 -0.04、左端接电机法兰，
  // 把整段间隙填满，从侧机位能真正看见联轴器，而不是被电机本体挡住。
  MOTOR_FLANGE_X: -0.095,
  MOTOR_FLANGE_T: 0.008,
  MOTOR_FLANGE_W: 0.085,
  MOTOR_X0: -0.099,
  MOTOR_BODY_LEN: 0.058,
  MOTOR_BODY_W: 0.064,
  ENCODER_LEN: 0.014,
  ENCODER_R: 0.028,
  COUPLING_X: -0.0665,
  COUPLING_LEN: 0.045,
  COUPLING_R: 0.016,
  COUPLING_JAW_R: 0.020,
  /** 电机最外端（局部）；自检会换算到世界 X，确认不碰到灯塔 / 控制柜 */
  MOTOR_MIN_X: -0.099 - 0.058 - 0.014,
  // 固定端 / 支撑端轴承座端盖螺栓
  BEARING_BOLT_R: 0.004,
  BEARING_BOLT_OFFSET: 0.036,
  // 侧面拖链铝槽（真实模组的静态部件；动态链带留待后续）
  CARRIER_Z: -(FRAME.TRACK_Z + 0.075),
  CARRIER_Y: FRAME.SCREW_H - 0.10,
  CARRIER_CHANNEL_W: 0.032,
  CARRIER_CHANNEL_H: 0.012,
  CARRIER_CHANNEL_LEN: FRAME_LEN * 0.62,
  CARRIER_END_T: 0.010,
} as const;

/**
 * 滑台拟真细节：四只直线轴承滑块座、滚珠螺母座、台面螺纹孔阵列。
 * 四滑块配置（±X 端面 × ±Z 两条方轨）是真实滚珠丝杆模组的标准做法，
 * 中间 z=0 留给与丝杆同心的滚珠螺母法兰，互不占位。
 */
export const SLIDER_DETAIL = {
  /** 方轨穿过滑块座的中心（与机架 FRAME.TRACK_Z 同源，组件不依赖机架常量） */
  RAIL_Z: FRAME.TRACK_Z,
  RAIL_HALF: TRACK_R,
  // 直线轴承滑块座：每侧每轨一只，共 4 只
  CARRIAGE_T: 0.008,
  CARRIAGE_H: 0.060,
  CARRIAGE_D: 0.040,
  CARRIAGE_BOLT_R: 0.0035,
  CARRIAGE_BOLT_DY: 0.020,
  CARRIAGE_BOLT_DZ: 0.016,
  GREASE_NIPPLE_R: 0.0035,
  GREASE_NIPPLE_L: 0.008,
  // 滚珠螺母座：装在 -X 端中央（朝伺服电机），避开取药仓一侧
  NUT_FLANGE_R: 0.030,
  NUT_FLANGE_T: 0.006,
  NUT_BODY_R: 0.021,
  NUT_LEN: 0.030,
  NUT_BOLT_R: 0.0035,
  /** 法兰螺栓的周向半径（小于法兰半径，螺栓不越出法兰） */
  NUT_BOLT_PITCH: 0.021,
  // 台面螺纹孔阵列（4 列 × 2 行）
  TOP_HOLE_R: 0.0035,
  TOP_HOLE_X: 0.052,
  TOP_HOLE_Z: 0.075,
  TOP_HOLE_ROWS: [-1, 1] as const,
  TOP_HOLE_COLS: [-1.5, -0.5, 0.5, 1.5] as const,
  // 侧面型号铭牌（纯几何蚀刻纹，避免整机负缩放时文字被镜像）
  PLATE_W: 0.072,
  PLATE_H: 0.016,
} as const;

/** 料筒托架：原点 = 横梁中心 */
export const RACK = {
  BEAM_W: MAG_RACK_W,
  BEAM_H: 0.015,
  BEAM_D: MAG_RACK_DEPTH,
  /** 立柱顶面嵌进横梁 SURFACE_GAP：旧值正好等于横梁底面 -BEAM_H/2，两面精确共面 */
  PILLAR_TOP_Y: -0.0075 + SURFACE_GAP,
  PILLAR_BOTTOM_Y: 0.02 - MAG_RACK_Y,
  PILLAR_Z: MAG_RACK_PILLAR_Z - MAG_RACK_Z,
  PILLAR_X: [
    MAG_RACK_PILLAR_X[0] - MAG_RACK_CX,
    MAG_RACK_PILLAR_X[1] - MAG_RACK_CX,
  ],
  PILLAR_W: 0.035,
} as const;
export const RACK_PILLAR_H = RACK.PILLAR_TOP_Y - RACK.PILLAR_BOTTOM_Y;
export const RACK_PILLAR_CY = (RACK.PILLAR_TOP_Y + RACK.PILLAR_BOTTOM_Y) / 2;

/** 供药单元：原点 = 托板上表面中心（y=0 即 CHUTE_Y） */
export const UNIT = {
  TRAY_Y: MAG_TRAY_Y - CHUTE_Y,
  TRAY_Z0: MAG_TRAY_Z0,
  TRAY_Z1: MAG_TRAY_Z1,
  TRAY_W: MAG_TRAY_W,
  /** 最底药片中心 / 推药气缸轴线 */
  PILL_Y: PILL_H / 2,
  TUBE_CY: MAG_TUBE_H / 2,
  CAP_Y: MAG_TUBE_H + 0.007,
  RING_Y: 0.020,
  EMPTY_LAMP_Y: 0.030,
  /** 料筒底座：下接托架横梁、上接托板 */
  PEDESTAL_Y: (MAG_RACK_Y - CHUTE_Y) / 2,
  PEDESTAL_H: CHUTE_Y - MAG_RACK_Y,
  TRAY_SUPPORT_Y: (MAG_RACK_Y + MAG_TRAY_Y) / 2 - CHUTE_Y,
  TRAY_SUPPORT_H: MAG_TRAY_Y - MAG_RACK_Y,
  /** 斜槽中点（相对单元的局部 Y；世界 CHUTE_RAMP_MID_Y - CHUTE_Y） */
  RAMP_MID_Y: -CHUTE_RAMP_DY / 2,
  RAMP_MID_Z: CHUTE_RAMP_MID_Z,
  RAMP_LEN: CHUTE_RAMP_LEN,
  RAMP_ANGLE: CHUTE_RAMP_ANGLE,
  /** 气缸鞍座高度（长度量，不随原点平移变化） */
  FEED_SADDLE_H: PILL_BASE_Y - FEED_CYL_R - (MAG_RACK_Y + 0.0075),
} as const;

/** 取药仓：原点 = 仓底 / 台座顶面 */
export const BIN = {
  W: COLLECT_BIN_SIZE[0],
  H: COLLECT_BIN_SIZE[1],
  D: COLLECT_BIN_SIZE[2],
  WALL_T: 0.008,
  PEDESTAL_W: 0.10,
  PEDESTAL_H: BIN_BASE_Y - 0.04,
  PEDESTAL_Y: -(BIN_BASE_Y - 0.04) / 2,
  FOOT_W: 0.18,
  FOOT_H: 0.01,
  /** 脚垫底面比台座底面低 SURFACE_GAP：两者不再共面（旧版同为世界 y=0.04） */
  FOOT_Y: 0.045 - BIN_BASE_Y - SURFACE_GAP,
  LAMP_Y: COLLECT_BIN_SIZE[1] + 0.06,
} as const;

// ============================================================
// PART STAGE 部件展台（?stage=<name>）
//
// 每个部件单独放到原点、scale=1、配 0.1m 标尺网格与专用近景相机，
// 先把形状/方向/比例逐个核对，再按 ASSEMBLY 拼回整机。
// ============================================================

export interface PartStage {
  label: string;
  camera: Vec3;
  target: Vec3;
  fov: number;
  /** 标尺网格边长（格数自动 = 边长 / 0.1，即每格 0.1m） */
  grid: number;
  /** 网格所在局部 y（贴部件底面，避免穿过部件） */
  gridY: number;
}

export const PART_STAGES: Record<string, PartStage> = {
  frame: { label: '机架', camera: [1.1, 1.7, 3.0], target: [1.1, 0.55, 0], fov: 40, grid: 3, gridY: 0 },
  rack: { label: '料筒托架', camera: [0.75, 0.9, 1.6], target: [0, -0.6, 0], fov: 42, grid: 2, gridY: 0.02 - MAG_RACK_Y },
  // 从 +X 侧 3/4 俯视：推药气缸(-Z)、料筒、托板、斜槽(+Z) 同框，可直接核对推杆方向
  unit: { label: '供药单元', camera: [0.62, 0.30, 0.30], target: [0, 0.03, 0], fov: 34, grid: 0.8, gridY: -0.13 },
  // 侧视装配链：滑块 → 气缸主体 → 法兰盘 → 支架 → 开口料斗
  hopper: { label: '滑块·旋转气缸·料斗', camera: [0.40, 0.28, 0.38], target: [0, 0.045, 0.085], fov: 30, grid: 0.6, gridY: -0.01 },
  // 取药仓含 0.76m 台座 + 仓顶指示灯，相机需覆盖 y ∈ [-0.76, 0.218]（自检 covers() 断言）
  bin: { label: '取药仓', camera: [0.60, 0.35, 0.95], target: [0, -0.28, 0], fov: 50, grid: 1.2, gridY: -(BIN_BASE_Y - 0.04) },
  // 正面偏 17° 而非 33°，φ22 按钮环 / 铭牌在展台里才能逐个看清
  cabinet: { label: '控制柜', camera: [0.30, 0.42, 0.95], target: [0, 0.26, 0], fov: 36, grid: 1, gridY: 0 },
  // 灯塔总高 1.285m，相机需覆盖 y ∈ [0, 1.285]（自检 covers() 断言）
  tower: { label: '信号灯塔', camera: [0.80, 1.20, 2.30], target: [0, 0.66, 0], fov: 38, grid: 1.6, gridY: 0 },
};

/** 展台部件的局部原点定义：截图/自检时明确「这个部件以哪个面为基准」 */
export const PART_STAGE_ORIGIN: Record<string, string> = {
  frame: ASSEMBLY.frame.origin,
  rack: ASSEMBLY.magazineRack.origin,
  unit: '托板上表面中心，y=0 即出药平面，+Z 为推药方向',
  hopper: ASSEMBLY.sliderHopper.origin,
  bin: ASSEMBLY.collectBin.origin,
  cabinet: ASSEMBLY.cabinet.origin,
  tower: ASSEMBLY.lightTower.origin,
};

// ============================================================
// VIEW PRESET 整机观察机位（?view=<name>）
//
// 注意：以下都是 SCENE_SCALE=3 之后的**世界坐标**。
// 设备包围盒约 X[-0.6, 7.3] / Y[0, 5.0] / Z[-0.7, 1.7]，中心约 (3.35, 2.5, 0.5)。
// 旧机位 current 站在起点端外侧、俯角 33°，长轴沿视线斜向压缩，仅留作对照。
// 新默认 overview 是微斜正侧总览：俯角约 16°、长轴基本水平展开，
// 且 target.x 比设备中心偏左，让整机落在左侧固定面板右边的可用视口里。
// 局部机位同样把 target.x 略向左偏，避免料筒被面板压住。
// ============================================================

export interface ViewPreset {
  label: string;
  desc: string;
  camera: Vec3;
  target: Vec3;
  fov: number;
}

export const VIEW_PRESETS: Record<string, ViewPreset> = {
  /** 旧默认机位，留作对照 */
  current: {
    label: '旧机位（对照）', desc: '起点端外侧高俯角，长轴斜向压缩',
    camera: [-0.8, 8.2, 7.8] as Vec3, target: [3.5, 2.5, 0.2] as Vec3, fov: 45,
  },
  /** 新的默认总览机位：与 SCENE_CAMERA / SCENE_TARGET / SCENE_FOV 同源 */
  overview: {
    label: '整机总览', desc: '长轴水平展开、微斜保留立体感，避开左侧面板',
    camera: [...SCENE_CAMERA] as Vec3, target: [...SCENE_TARGET] as Vec3, fov: SCENE_FOV,
  },
  /** 保留「起点靠近观察者」，但压低俯角、拉近、让工艺顺序由近及远展开 */
  origin: {
    label: '起点在近处', desc: '顺工艺流程看：原点 → 四料仓 → 终点放药位',
    camera: [-0.3, 4.8, 8.8], target: [3.4, 2.3, 0.2], fov: 38,
  },
  /** 相机移到设备中心正侧方：长轴水平展开、两端等距、细节均匀 */
  front: {
    label: '正侧总览', desc: '长轴水平展开，四料仓/滑台行程无透视压缩',
    camera: [3.4, 5.0, 10.2], target: [3.4, 2.3, 0.3], fov: 38,
  },
  /** 俯视看平面布局与滑台行程 */
  top: {
    label: '俯视布局', desc: '看四仓分布、丝杆行程与取药仓相对位置',
    camera: [3.4, 11.5, 4.2], target: [3.4, 1.5, 0.2], fov: 40,
  },
  /**
   * 驱动端局部：伺服电机 / 梅花联轴器 / 固定端轴承座 / 方形导轨起点 /
   * 滑台滚珠螺母座与四滑块、原点接近开关。
   * 丝杆滑台拟真改造后，整机机位下这些零件太小，用专用近景核对。
   */
  drive: {
    label: '驱动端', desc: '伺服电机、联轴器、轴承座、方形导轨与滑台螺母座特写',
    // 从 +Z 侧偏 -X 看：电机 / 联轴器 / 轴承座沿 X 排开，联轴器不会被电机本体挡住
    camera: [-1.0, 4.0, 3.2] as Vec3, target: [0.30, 3.20, 0.05] as Vec3, fov: 30,
  },
  /** 供药段局部：料筒 / 推药气缸 / 斜槽 / 接药 */
  feed: {
    label: '供药段', desc: '四料筒、推药气缸、落料斜槽特写',
    // target.x 向左偏 0.35 + 略微放宽 fov：A 仓让开左侧面板，右端传感器标签也不被切掉
    camera: [1.65, 6.0, 4.6], target: [3.05, 4.0, 0], fov: 38,
  },
  /** 放药位局部：翻转料斗 / 取药仓 / 终点传感器 */
  dump: {
    label: '放药位', desc: '翻转倒药、取药仓、终点传感器特写（需先把滑台开到终点）',
    // target 必须同时罩住料斗口（y≈3.6）与取药仓顶（y≈2.8），否则翻转机构会被切掉
    camera: [7.2, 5.0, 4.6], target: [6.1, 3.2, 0.3], fov: 40,
  },
};

/**
 * 镜像布局：整机沿 YZ 中轴面把 X 翻转（只在场景根 group 做负缩放）。
 * 装配表 / 几何常量 / 自检一律不动，翻转后起点落到右手侧、按钮箱随起点一起过去。
 *
 * 镜像后设备中心由 +3.35 变成 -3.35，若把机位 X 简单取反，设备会被左侧固定面板压住；
 * 因此机位统一按「关于 x = MIRROR_VIEW_SHIFT/2 的镜像」变换：x' = -x + SHIFT。
 */
export const MIRROR_VIEW_SHIFT = -1.9;

/**
 * 局部特写（feed / dump）的镜像平移量要小得多：
 * 特写视野窄，整机用的 -1.9 会把远端料筒直接推出画面右侧。
 */
export const MIRROR_LOCAL_VIEW_SHIFT = -0.8;

/** 镜像布局下「起点在近处」专用机位：相机移到右前方，让起点端真正离观察者更近 */
export const MIRROR_ORIGIN_VIEW: ViewPreset = {
  label: '起点近右手', desc: '镜像布局下从右前方顺工艺流程观察',
  camera: [2.5, 5.0, 8.0], target: [-3.0, 2.3, 0.3], fov: 38,
};

// ============================================================
// VISUAL 颜色、外观风格
// ============================================================

/**
 * 整机配色：深中性背景 + 铝银灰结构件 + 石墨蓝灰柜体 + 浅灰门板，
 * 暖色功能件收敛成「琥珀家族（滑台深 / 料斗亮）+ 一个砖橙对比（取药仓）」，
 * 四料筒保留药品区分但降饱和；绿/黄/红是安全色，只做微调不换色相。
 *
 * 公共工业色 / 布光直接展开自共享令牌（与传送带分拣同源），
 * 这里只补配药设备专属的琥珀、砖橙、药仓与药片色。
 */
export const VISUAL = {
  ...INDUSTRIAL_VISUAL,
  SCENE_LIGHTING: INDUSTRIAL_LIGHTING,
  FLANGE_COLOR: '#e0a51c',       // 旋转气缸输出法兰
  SLIDER_COLOR: '#d18f16',       // 滑台（深琥珀）
  HOPPER_COLOR: '#f0b429',       // 料斗（亮琥珀，同族不同明度）
  TUBE_COLOR: '#94a3b8',         // 药仓通道
  TUBE_BACK_COLOR: '#475569',
  MAG_COLOR: { A: '#d96666', B: '#4f9e72', C: '#5b87c4', D: '#9a76bd' }, // 四药仓标识色（降饱和）
  PILL_COLOR: { A: '#b3382f', B: '#2e8b57', C: '#2563a8', D: '#7d54a8' }, // 药片色（比料筒更深）
  BIN_COLOR: '#d45f24',          // 取药仓（砖橙红，与琥珀拉开）
} as const;

// ============================================================
// ADDRESS PLC 变量地址表
// ============================================================
// 与 websocket-server/mock-addresses.js 的 DISPENSING_* 组保持一致（node mock-addresses.js --check 校验）
// 约定：地址 0-9  物理按钮输入
//       地址 10-29 传感器/磁性开关输入
//       地址 30-39 电机/气缸/灯塔输出（可写）
//       寄存器 100+ 编码器位置

export const MODBUS_READ_VARS = {
  // —— 输入：按钮（0-4）——
  BUTTON_START: 0,
  BUTTON_STOP: 1,
  BUTTON_RESET: 2,
  BUTTON_ESTOP: 3,
  BUTTON_CONFIRM: 4,      // 取药确认
  // —— 输入：限位/传感器（10-17）——
  S_LIMIT_START: 10,      // 原点传感器（滑台回到起点即触发，兼作编码器 Z 相回零）
  S_LIMIT_END: 11,        // 终点传感器（滑台到达放药位触发）
  S_MAG_A_EMPTY: 12,      // A 空仓
  S_MAG_B_EMPTY: 13,
  S_MAG_C_EMPTY: 14,
  S_MAG_D_EMPTY: 15,      // D 空仓
  S_BIN_HAS_DRUG: 16,     // 取药仓有药
  // —— 输入：磁性开关（20-29）——
  MSC_A_BACK: 20,   // A 送药缸 退回位
  MSC_A_FRONT: 21,  // A 送药缸 伸出位
  MSC_B_BACK: 22,
  MSC_B_FRONT: 23,
  MSC_C_BACK: 24,
  MSC_C_FRONT: 25,
  MSC_D_BACK: 26,
  MSC_D_FRONT: 27,
  MSC_TILT_HOLD: 28, // 翻转缸 盛药位
  MSC_TILT_DUMP: 29, // 翻转缸 翻转位
  // —— 输出：电机（30-31）——
  MOTOR_FWD: 30,
  MOTOR_REV: 31,
  // —— 输出：气缸（32-37）——
  CYL_SEND_A: 32,
  CYL_SEND_B: 33,
  CYL_SEND_C: 34,
  CYL_SEND_D: 35,
  CYL_TILT: 36,
  // —— 输出：灯塔（38-40）——
  LAMP_GREEN: 38,
  LAMP_YELLOW: 39,
  LAMP_RED: 40,
  // —— 编码器位置（8 位二进制，孪生→PLC 输入，0.01m=1 脉冲）——
  ENCODER_BIT0: 42,
  ENCODER_BIT1: 43,
  ENCODER_BIT2: 44,
  ENCODER_BIT3: 45,
  ENCODER_BIT4: 46,
  ENCODER_BIT5: 47,
  ENCODER_BIT6: 48,
  ENCODER_BIT7: 49,
} as const;

export type DispensingVarName = keyof typeof MODBUS_READ_VARS;

/**
 * 保持寄存器（数据寄存器）地址表 —— 与 websocket-server/mock-addresses.js 的
 * DISPENSING_REGISTERS 互为单一来源，由 `node mock-addresses.js --check` 校验。
 * 线圈表 MODBUS_READ_VARS 只放布尔量；数值型寄存器另立一块，避免地址语义混淆。
 */
export const MODBUS_HOLDING_REGISTERS = {
  /** 增量式编码器脉冲计数（原点=0，前进 +、后退 -，回原点传感器时归零） */
  ENCODER_PULSES: 120,
} as const;

// ----- S7（M 区） -----
export const S7_VARS = {
  BUTTON_START: 'M0.0',
  BUTTON_STOP: 'M0.1',
  BUTTON_RESET: 'M0.2',
  BUTTON_ESTOP: 'M0.3',
  BUTTON_CONFIRM: 'M0.4',
  S_LIMIT_START: 'M20.0',
  S_LIMIT_END: 'M20.1',
  S_MAG_A_EMPTY: 'M20.2',
  S_MAG_B_EMPTY: 'M20.3',
  S_MAG_C_EMPTY: 'M20.4',
  S_MAG_D_EMPTY: 'M20.5',
  S_BIN_HAS_DRUG: 'M20.6',
  MSC_A_BACK: 'M20.7', MSC_A_FRONT: 'M21.0',
  MSC_B_BACK: 'M21.1', MSC_B_FRONT: 'M21.2',
  MSC_C_BACK: 'M21.3', MSC_C_FRONT: 'M21.4',
  MSC_D_BACK: 'M21.5', MSC_D_FRONT: 'M21.6',
  MSC_TILT_HOLD: 'M21.7', MSC_TILT_DUMP: 'M22.0',
  MOTOR_FWD: 'M30.0',
  MOTOR_REV: 'M30.1',
  CYL_SEND_A: 'M30.2',
  CYL_SEND_B: 'M30.3',
  CYL_SEND_C: 'M30.4',
  CYL_SEND_D: 'M30.5',
  CYL_TILT: 'M30.6',
  LAMP_GREEN: 'M30.7',
  LAMP_YELLOW: 'M31.0',
  LAMP_RED: 'M31.1',
  ENCODER_BIT0: 'M31.2',
  ENCODER_BIT1: 'M31.3',
  ENCODER_BIT2: 'M31.4',
  ENCODER_BIT3: 'M31.5',
  ENCODER_BIT4: 'M31.6',
  ENCODER_BIT5: 'M31.7',
  ENCODER_BIT6: 'M32.0',
  ENCODER_BIT7: 'M32.1',
} as const;

// ----- 三菱（X/Y） -----
export const MITSUBISHI_READ_VARS = {
  BUTTON_START: 'X0',
  BUTTON_STOP: 'X1',
  BUTTON_RESET: 'X2',
  BUTTON_ESTOP: 'X3',
  BUTTON_CONFIRM: 'X4',
  S_LIMIT_START: 'X10',
  S_LIMIT_END: 'X11',
  S_MAG_A_EMPTY: 'X12',
  S_MAG_B_EMPTY: 'X13',
  S_MAG_C_EMPTY: 'X14',
  S_MAG_D_EMPTY: 'X15',
  S_BIN_HAS_DRUG: 'X16',
  MSC_A_BACK: 'X20', MSC_A_FRONT: 'X21',
  MSC_B_BACK: 'X22', MSC_B_FRONT: 'X23',
  MSC_C_BACK: 'X24', MSC_C_FRONT: 'X25',
  MSC_D_BACK: 'X26', MSC_D_FRONT: 'X27',
  MSC_TILT_HOLD: 'X30', MSC_TILT_DUMP: 'X31',
  ENCODER_BIT0: 'X40', ENCODER_BIT1: 'X41', ENCODER_BIT2: 'X42', ENCODER_BIT3: 'X43',
  ENCODER_BIT4: 'X44', ENCODER_BIT5: 'X45', ENCODER_BIT6: 'X46', ENCODER_BIT7: 'X47',
} as const;
export const MITSUBISHI_WRITE_VARS = {
  MOTOR_FWD: 'Y0',
  MOTOR_REV: 'Y1',
  CYL_SEND_A: 'Y2',
  CYL_SEND_B: 'Y3',
  CYL_SEND_C: 'Y4',
  CYL_SEND_D: 'Y5',
  CYL_TILT: 'Y6',
  LAMP_GREEN: 'Y7',
  LAMP_YELLOW: 'Y10',
  LAMP_RED: 'Y11',
} as const;

export const MODBUS_DISPLAY_VARS = Object.fromEntries(
  Object.entries(MODBUS_READ_VARS).map(([k, v]) => [k, `Coil ${v}`]),
) as Record<keyof typeof MODBUS_READ_VARS, string>;

export const S7_DISPLAY_VARS = S7_VARS;
export const MITSUBISHI_DISPLAY_VARS = { ...MITSUBISHI_READ_VARS, ...MITSUBISHI_WRITE_VARS };

// ============================================================
// 配方
// ============================================================

export const RECIPE_LIMIT = 9; // 每仓 0~9 份

/** 编码器脉冲换算：0.01m = 1 脉冲（与 mock PLC 一致） */
export const PULSES_PER_M = 100;

// ============================================================
// 位置反馈：原点/终点接近开关 + 增量式编码器数据寄存器
// ============================================================

/** 传感器触发窗口（m）：进入 ON 与离开 OFF 用不同阈值做滞回，避免边界抖动闪烁 */
export const LIMIT_ENTER_TOL = 0.005;
export const LIMIT_EXIT_TOL = 0.015;
/** 行程最大脉冲：原点寄存器 = 0，终点寄存器 = 该值（170，落在 8 位镜像范围内） */
export const ENCODER_PULSES_MAX = Math.round((SLIDER_MAX_X - SLIDER_MIN_X) * PULSES_PER_M);
/** 增量式编码器数据寄存器在各协议中的显示地址 */
export const ENCODER_REG_LABEL = 'HR120 · MW120 · D120';

/**
 * 原点 / 终点接近开关（局部坐标，装在机架部件上）。
 * 机架局部原点在 FRAME_AXLE_FROM，行程两端需减去该偏移；
 * 组件只允许使用 SENSOR，不得直接写世界 X。
 */
export const SENSOR = {
  ORIGIN_X: SLIDER_MIN_X - ASSEMBLY.frame.position[0],
  END_X: SLIDER_MAX_X - ASSEMBLY.frame.position[0],
  /** 探头略低于滑块底面，朝上感应滑块 */
  Y: FRAME.TRACK_H - 0.080,
  /** 装在滑块 +Z 外侧，避开滑台行程 */
  Z: FRAME.TRACK_Z + 0.075,
  BODY_W: 0.030,
  BODY_H: 0.045,
  BODY_D: 0.022,
  LED_R: 0.010,
  /**
   * 安装支架：L 形吊架把开关固定到 +Z 侧导轨下沿。
   * 传感器顶面（Y + BODY_H/2）比导轨下沿低约 4.5cm，不补这段连接件会显得悬空。
   */
  BRACKET_TOP_Y: FRAME.TRACK_H - TRACK_R,
  BRACKET_RAIL_Z: FRAME.TRACK_Z,
  BRACKET_W: 0.014,
  BRACKET_T: 0.006,
  /** 场景层标签相对传感器本体的高度 */
  LABEL_Y: 0.13,
  /** 终点标签单独偏置：沿 +X 让开翻转料斗，保持原高度以免挤进上方标签簇 */
  LABEL_END_OFFSET: [0.22, 0.13, 0.06] as Vec3,
} as const;

/** 传感器世界坐标（场景层标签用；由装配表 + 局部几何推导，不手写） */
export const SENSOR_WORLD = {
  ORIGIN: [ASSEMBLY.frame.position[0] + SENSOR.ORIGIN_X, SENSOR.Y, SENSOR.Z] as Vec3,
  END: [ASSEMBLY.frame.position[0] + SENSOR.END_X, SENSOR.Y, SENSOR.Z] as Vec3,
} as const;

/** 由寄存器脉冲值派生 8 位线圈镜像（ENCODER_BIT0..7），保证寄存器是唯一真值 */
export function encoderMirrorBits(pulses: number): boolean[] {
  const p = Math.min(255, Math.max(0, Math.round(pulses)));
  return Array.from({ length: 8 }, (_, i) => ((p >> i) & 1) === 1);
}

export const MAGAZINE_LABELS: Record<MagazineId, string> = { A: 'A 药', B: 'B 药', C: 'C 药', D: 'D 药' };