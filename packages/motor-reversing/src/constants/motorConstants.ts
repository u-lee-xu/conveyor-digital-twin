/**
 * 电机正反转控制场景：几何 / 工艺 / 视觉 / 阶段的**唯一来源**（契约 v1.0）。
 *
 * 控制链路：按钮 → PLC → 接触器 → 电机 → 传送带。
 * 柜内**不设计 KM 辅助常开自锁接线**；KM1 / KM2 之间保留**硬件互锁**：
 * 常闭辅助触点互串 + 机械联锁杆，任意时刻只允许一只接触器吸合。
 *
 * 真值口径：转速、皮带位移、热累积、QF 合分、FR 跳闸是唯一可写真值；
 * KM 吸合状态、灯色、3D 动画、PLC 反馈全部由纯函数派生，不在组件里另算一遍。
 *
 * 几何语言沿用项目拟真范式：铝挤型材 + T 槽 + 端盖 + 可调地脚 + 侧装减速电机，
 * 电机轴线沿 Z 与主动滚筒同轴；柜内为落地柜 + DIN 导轨 + 走线槽 + 端子排。
 */
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL,
} from '@digital-twin/shared/styles/industrialVisual';

export type Vec3 = [number, number, number];

/** 相邻可见面错开量：全场景共用，禁止在组件里另写 0.001 / 0.003 */
export const GAP = INDUSTRIAL_DETAIL.SURFACE_GAP;

export const MOTOR_VISUAL = {
  SCENE_BACKGROUND: INDUSTRIAL_VISUAL.SCENE_BACKGROUND,
  SCENE_LIGHTING: INDUSTRIAL_LIGHTING,
  BASE_COLOR: INDUSTRIAL_VISUAL.BASE_COLOR,
  STRUCT_COLOR: INDUSTRIAL_VISUAL.STRUCT_COLOR,
  PROFILE_SLOT_COLOR: INDUSTRIAL_VISUAL.PROFILE_SLOT_COLOR,
  ENDCAP_COLOR: INDUSTRIAL_VISUAL.ENDCAP_COLOR,
  SILVER_COLOR: INDUSTRIAL_VISUAL.SILVER_COLOR,
  AXIS_COLOR: INDUSTRIAL_VISUAL.AXIS_COLOR,
  BRASS_COLOR: INDUSTRIAL_VISUAL.BRASS_COLOR,
  CABINET_COLOR: INDUSTRIAL_VISUAL.CABINET_COLOR,
  PANEL_COLOR: INDUSTRIAL_VISUAL.PANEL_COLOR,
  BELT_COLOR: INDUSTRIAL_VISUAL.PROFILE_SLOT_COLOR,
  MAGSWITCH_COLOR: INDUSTRIAL_VISUAL.MAGSWITCH_COLOR,
  LAMP_DARK: INDUSTRIAL_VISUAL.LAMP_DARK,
  LAMP_GREEN: INDUSTRIAL_VISUAL.LAMP_GREEN,
  LAMP_YELLOW: INDUSTRIAL_VISUAL.LAMP_YELLOW,
  LAMP_RED: INDUSTRIAL_VISUAL.LAMP_RED,
  /**
   * 操作台电源灯：亮银白（照旧，与正转绿区分）。
   * 柜内器件指示灯另走 `LAMP_DEVICE` 绿灯（第三十八轮）。
   */
  LAMP_POWER: INDUSTRIAL_VISUAL.SILVER_COLOR,
  /**
   * 柜内器件指示灯统一绿灯（第三十八轮）：开关电源 DC OK 与 PLC 的 POW / RUN。
   * 之前这两处也取亮银，在暗柜里看起来像一块白反光，读不出「亮 / 灭」。
   */
  LAMP_DEVICE: INDUSTRIAL_VISUAL.LAMP_GREEN,
  /** 整机机位：右前方斜视，让侧装电机筒体有长度而不是被压成一个端面圆 */
  SCENE_CAMERA: [2.6, 1.95, 3.7] as Vec3,
  SCENE_TARGET: [0, 0.78, 0.25] as Vec3,
} as const;

/**
 * 柜内元件配色：全部采样自用户上传的四个 STEP（brep_faces 面组颜色），
 * 按真实型号还原，不再沿用通用白/深灰。改色只改这一处。
 */
export const MOTOR_MODEL_PALETTE = {
  /** NXB-63G 3P：白色壳体 / 蓝色拨柄 [0.048,0.231,0.888] / 灰色檐 / 黑色侧孔 */
  POLE_WHITE: '#dbe3ec',
  HANDLE_BLUE: '#0c3be3',
  POLE_LIP: '#9aa7b6',
  /** NC5 接触器：上部浅灰灭弧罩 / 下部深棕灰线圈盒 [0.212,0.184,0.159] / 黄色内部件 */
  CONTACTOR_UPPER: '#c6d0da',
  CONTACTOR_LOWER: '#363029',
  CONTACTOR_COIL: '#d8b23a',
  /** NR4-80 热继电器：芥末黄主体 [0.791,0.708,0.067] / 红 STOP / 蓝绿 TEST / 奶白铭牌 */
  THERMAL_YELLOW: '#cab50f',
  STOP_RED: '#d32424',
  TEST_TEAL: '#2c4bd0',
  THERMAL_FACE: '#e6e9df',
  /** NRT28-63 3P 底座：浅蓝灰白 */
  FUSE_BASE: '#c8d2e0',
  /** 通用：银端子 / 深色孔腔 */
  TERMINAL_SILVER: '#dfe6ee',
  CAVITY_DARK: '#2b3441',
  /** 第三十轮：FR 端子大螺钉的绿铜色（用户实物正面照里六颗螺钉的镀层色） */
  TERMINAL_SCREW_GREEN: '#7c8b3a',
} as const;

/**
 * 柜内四个元件不再挂载 STEP GLB：按实物照片用 three.js 基础几何重画，
 * 尺寸 / 方向 / 装配关系完全可控，根除 GLB 几何超出柜内空间造成的穿插。
 * 原始 STEP 仅作为 `pic/motor-models/` 的外观参考素材保留，不参与运行时加载。
 */

/** 机位单一来源：?view= 与部件展台取景都从这里派生 */
export const MOTOR_VIEW_KEYS = ['overview', 'cabinet', 'motor', 'belt', 'console'] as const;
export type MotorViewKey = (typeof MOTOR_VIEW_KEYS)[number];
export interface MotorCameraGoal { position: Vec3; target: Vec3; label: string; }
export const MOTOR_CAMERA_GOALS: Record<MotorViewKey, MotorCameraGoal> = {
  overview: { position: [2.6, 1.95, 3.7], target: [0, 0.78, 0.25], label: '整机' },
  cabinet: { position: [-1.05, 1.34, 1.7], target: [-1.15, 1.0, 0.3], label: '控制柜' },
  motor: { position: [1.8, 0.98, 1.6], target: [1.45, 0.66, 0.49], label: '驱动电机' },
  belt: { position: [0.9, 1.62, 1.95], target: [0.42, 0.7, -0.12], label: '传送带' },
  console: { position: [0.86, 1.42, 2.05], target: [0.2, 0.87, 1.12], label: '操作台' },
};
export function isMotorViewKey(v: string | null): v is MotorViewKey {
  return !!v && (MOTOR_VIEW_KEYS as readonly string[]).includes(v);
}

/** 部件展台：与整机复用同一批组件，只换近景机位 */
export const MOTOR_PART_KINDS = [
  'contactor', 'thermal', 'breaker', 'fuse', 'motor', 'belt', 'console',
  'psu', 'plc', 'relay',
] as const;
export type MotorPartKind = (typeof MOTOR_PART_KINDS)[number];
export const MOTOR_PART_STAGE_GOALS: Record<MotorPartKind, MotorCameraGoal> = {
  contactor: { position: [0.3, 0.26, 0.66], target: [0, 0.08, 0], label: '交流接触器' },
  thermal: { position: [0.28, 0.24, 0.6], target: [0, 0.06, 0], label: '热继电器' },
  breaker: { position: [0.3, 0.25, 0.62], target: [0, 0.07, 0], label: '空气开关' },
  fuse: { position: [0.3, 0.24, 0.62], target: [0, 0.06, 0], label: '熔断器' },
  /** 第十五轮：24V 控制侧三件套，机位比强电件更近（元件本体更小） */
  psu: { position: [0.22, 0.2, 0.46], target: [0, 0.07, 0], label: '开关电源' },
  plc: { position: [0.28, 0.22, 0.5], target: [0, 0.06, 0], label: 'PLC' },
  /** 第二十轮：KA 按安装板结构沿 +Z 分层，机位正对 +Z 看透明壳内的变色方块；
   *  第二十九轮方块底边落地后目标抬到本体高度 */
  relay: { position: [0.04, 0.05, 0.26], target: [0, 0.02, 0.02], label: '中间继电器' },
  /** 偏 +Z 看向尾端，外露扇叶接近正对镜头；机身收短后相机相应拉近 */
  motor: { position: [0.16, 0.22, 1.02], target: [0, 0.06, 0.22], label: '三相电机' },
  belt: { position: [1.5, 0.95, 1.6], target: [0, 0.25, 0], label: '传送带' },
  console: { position: [0.85, 0.72, 0.95], target: [0, 0.12, 0], label: '操作台' },
};
export function isMotorPartStage(v: string | null): v is MotorPartKind {
  return !!v && (MOTOR_PART_KINDS as readonly string[]).includes(v);
}

/** 几何尺寸表：可见几何与碰撞体同源，组装层只摆放不重写尺寸 */
/**
 * 左右竖向线槽的位置与槽宽（第四十轮提到 MOTOR_GEOM 之前）：
 * DIN 导轨与横向线槽都必须按竖槽「内缘」收边，两端各留 GAP，
 * 否则导轨端头会插进槽体，两者实体穿插在屏幕上就是闪个不停（z-fighting）。
 * 这个值过去只写在 DUCT 里，导轨独立写死 0.86（半长 0.43 > 竖槽内缘 0.39）正是漏改点。
 */
const DUCT_VERTICAL_X = 0.415;
const DUCT_HEIGHT = 0.05;

/** 导轨与横向线槽共用的净长：两端止于左右竖槽内缘再留 GAP，唯一来源 */
export const DUCT_INNER_SPAN = 2 * (DUCT_VERTICAL_X - DUCT_HEIGHT / 2 - GAP);

/**
 * 第四十三轮：KM 端子区改成真凹陷——本体正面在六个端子位置开方孔，
 * 孔底退进本体 recessDepth，白色框与本体的原始前脸齐平，螺钉和圆孔都沉在孔内。
 * 这里只锁「螺钉头相对孔底」的层级，全部以 GAP 为步长，禁止组件里另写绝对深度。
 * FR 的大绿铜螺钉仍用原来的凸头节奏，不受这里的常量影响。
 */
export const KM_SCREW_RECESS = {
  /** 银色十字头前缘相对孔底的深度：必须明显小于 recessDepth，才看得出沉在孔里 */
  headFront: GAP * 3,
  /** 十字槽张角（rad）：四块扇形片之间的真缝，不是贴上去的深色条 */
  slotAngle: 0.22,
} as const;

/**
 * 第四十二轮：KM 上排端子（螺钉在外、圆孔在内），下排由它按壳体水平中线镜像派生。
 * y 用本体高度的比例，1 − y 即镜像；r 与是否十字槽同源复制。
 * 不许再手写第二排的四个 y/r —— 那就是上轮上下同向、看着不对称的根因。
 */
export const KM_TERMINAL_ROW_UPPER = [
  { y: 0.91, rFactor: 1, cross: true },
  { y: 0.8, rFactor: 0.8, cross: false },
] as const;
export const KM_TERMINAL_ROWS = [
  ...KM_TERMINAL_ROW_UPPER.map((row) => ({ ...row, band: 'upper' as const })),
  ...KM_TERMINAL_ROW_UPPER.map((row) => ({ ...row, y: 1 - row.y, band: 'lower' as const })),
];

export const MOTOR_GEOM = {
  /** 整机底架改成两条设备基础梁，不再是一整块黑色大板 */
  SKID: { length: 3.55, width: 1.4, height: 0.055, beamWidth: 0.09, beamGap: 0.95 },
  /** 输送线：铝挤型侧梁 + 端封板 + 支腿地脚 + 主动/从动滚筒 + 环形皮带 */
  BELT: {
    length: 2.3, width: 0.52, topY: 0.72,
    beltThickness: 0.014, returnY: 0.56,
    railH: 0.11, railT: 0.05, railOut: 0.02,
    slotW: 0.014, slotH: 0.006,
    guideH: 0.038, guideT: 0.008,
    endPlateT: 0.012, endPlateH: 0.12,
    legT: 0.055, legInset: 0.3, footR: 0.046, footH: 0.018, crossH: 0.035,
    driveRollerR: 0.075, idlerRollerR: 0.036, rollerCount: 7,
    rollerShaftR: 0.014, rollerCapR: 0.026, rollerCapT: 0.01,
    bearingW: 0.075, bearingH: 0.075, bearingD: 0.028,
    /** 皮带接头：两条低调细线，替代旧的 16 条亮横纹 */
    jointCount: 2, jointWidth: 0.006,
    driveInset: 0.1,
  },
  BOX: { width: 0.17, height: 0.14, depth: 0.17, count: 3, tapeWidth: 0.022 },
  /**
   * 侧装三相异步电机：轴线沿 Z，与主动滚筒同轴；法兰贴侧梁外表面。
   * 按真实小型电机比例收短加粗：机身长/直径约 1.05、整机总长/直径约 1.64，
   * 旧版 0.24 细长筒 + 0.075 减速段读成减速电机，总长/直径达 2.7。
   * 尾端按 MD520 范式做外露风扇：openEnded 风罩筒 + Torus 护圈 + 随轴自转的叶片。
   */
  MOTOR: {
    plateW: 0.17, plateH: 0.17, plateT: 0.01,
    flangeR: 0.088, gearboxR: 0.09, gearboxLen: 0.045,
    bodyR: 0.086, bodyLen: 0.18,
    finR: 0.091, finT: 0.006, finCount: 7,
    fanCoverR: 0.092, fanCoverLen: 0.04, fanBlades: 7,
    fanHubR: 0.022, fanRingT: 0.007,
    /** 叶片外缘 0.08 < 护圈内缘 0.085，不穿插 */
    fanBladeL: 0.068, fanBladeW: 0.034, fanBladeH: 0.006,
    terminalW: 0.085, terminalH: 0.05, terminalD: 0.07,
    shaftR: 0.016, shaftLen: 0.05,
    bracketW: 0.21, bracketH: 0.012, bracketD: 0.22,
    bracketLegH: 0.12,
  },
  /** 落地控制柜：实体门打开，柜内 DIN 导轨 / 走线槽 / 端子排完整可见 */
  CABINET: {
    width: 0.92, height: 1.45, depth: 0.34, wall: 0.018,
    plinthHeight: 0.1,
    /** 门板折回柜体左侧约 169°，柜口完全敞开，门板不遮挡内部元件 */
    doorThickness: 0.022, doorOpenAngle: -2.95,
    hingeZ: 0.17,
  },
  /**
   * 三层 DIN 导轨（实物柜标准）：上层 QF / FU，中层 KM1 / KM2 / FR，下层 XT 端子排。
   * 层与层之间是横向梳齿走线槽，柜内左右各一条竖向线槽。
   */
  DIN: {
    upperY: 1.16, middleY: 0.76, lowerY: 0.4,
    /** 长度派生自竖槽内缘（DUCT_INNER_SPAN），禁止再写死 0.86 插进竖槽 */
    z: -0.02, length: DUCT_INNER_SPAN, height: 0.035, depth: 0.018,
  },
  DUCT: {
    /** 横向线槽净长由 verticalX / height / GAP 在 WireDuct 内派生，避免与竖槽交叠 */
    height: DUCT_HEIGHT, depth: 0.045, tooth: 0.012,
    /**
     * 四条横向线槽：柜顶下、上中层之间、中下层之间、下层下方。
     * 每条线槽下沿必须高于其下方最高元件顶部至少 GAP，否则元件顶面与线槽实体
     * 精确共面/穿插会 z-fighting（旧版 1.34 / 1.0 就穿进了 QF 与 KM 顶部）。
     * upper: 1.1775+QF.h 0.165=1.3425 → rows[0] 下沿 1.355；
     * middle: KM 0.205+背板 0.014 最高 = 1.0025 → rows[1] 下沿 1.025
     * （FR 第三十三 / 三十四轮矮身后不再参与决定该层）。
     */
    rows: [1.38, 1.05, 0.6, 0.22] as const,
    /** 左右竖向线槽的 x 偏移 */
    verticalX: DUCT_VERTICAL_X,
  },
  /**
   * 柜内元件细节尺寸：按四个 STEP 的真实宽高比收窄（QF/KM/FR ≈0.65、FU≈1.38），
   * 高度保持不变以免破坏三层线槽层距；深度按柜深适度压缩。
   */
  QF: {
    w: 0.111, h: 0.165, d: 0.153, handleW: 0.038, handleH: 0.062,
    terminalR: 0.009, poles: 3, handleR: 0.011, lipH: 0.026,
  },
  FU: {
    /** NRT28 3P 底座：x=112 为高、y=81 为 3P 总宽、z=77 为深，生成时已绕 Z 转正 */
    baseW: 0.058, baseH: 0.145, baseD: 0.1, count: 3, spacing: 0.071,
    fuseR: 0.014, fuseH: 0.088, poleR: 0.014, cavityW: 0.024, cavityH: 0.03,
  },
  KM: {
    /** NC5 的 STEP 里 z 为高、x 为宽、y 为深；生成时已绕 X 转 90° 竖立 */
    w: 0.122, h: 0.205, d: 0.187, arcH: 0.048, coilH: 0.078,
    terminalR: 0.01, auxW: 0.038, windowCount: 3, windowW: 0.026,
    /**
     * 照 NC5-0911 实物照片补的结构尺寸：顶部深灰 DIN 安装背板超出白色壳体，
     * 上/下端子块前凸。背板高度必须计入层距断言，否则会插进层间横向线槽
     * （rows[1] 下沿 1.025）。第十三轮按用户要求去掉前盖，前盖凸出量常量随之删除。
     */
    backPlateH: 0.014, backPlateGap: 0.006,
    /**
     * 第四十三轮：端子孔真凹深度。本体前脸从 K.d/2 退到 K.d/2−recessDepth，
     * 六个方孔由前脸框架围出，白色框仍与 K.d/2 齐平；孔底深色、螺钉与圆孔全沉在孔内。
     */
    recessDepth: 0.012,
    /**
     * 前脸框架尺寸（比例）：第四十四轮起 frameEdgeH 表示端子槽朝外开口的延伸量——
     * 上排槽顶到壳体顶、下排槽底到壳体底，这一段白色横边删除，成为导线入口。
     * 中间横带与相邻螺钉间的竖条保留；竖条即灭弧格栅，左右外侧细边也保留。
     */
    frameEdgeH: 0.02, bandH: 0.24,
    /** 两条端子带的中心高度比例，方孔位置唯一来源 */
    bandCenters: [0.86, 0.14] as const,
    /**
     * 第四十五轮：中部动作指示件。灰色方块与黑色圆柱同步沿 z 进出：
     * 释放时凸出（base），吸合时沿 −Z 缩进行程 travel（与螺钉凹陷同向）。
     * 全部以 GAP 为步长派生，禁止在组件里写绝对深度。
     */
    actionTravel: GAP * 3,
    actionBlockBase: GAP * 3,
    actionPinBase: GAP * 2,
    /** 方块厚度也用 GAP 派生：吸合后缘恰好落在 front + GAP/2，读数干净 */
    actionBlockD: GAP * 3, actionPinD: GAP * 2,
    sidePlateW: 0.016, terminalPortR: 0.013,
  },
  /**
   * JR36-63 独立式热继：实物 90×87.5×57.5mm（本地 STEP：pic/motor-models/
   * JR36-63热过载继电器三维模型202204.stp）。第十三 / 十四轮按用户要求把 d
   * 压到 0.072，第三十一轮再压到 0.044；**第三十三轮照用户指正改朝向与比例**：
   * 螺钉 / 旋钮操作面朝屏幕，站立高度压矮 0.18 → 0.12 → 0.095（第三十四轮再扁），
   * 进深按实物深高比 57.5/87.5 ≈ 0.657 取 0.079 后保持不变；宽 0.185 行宽约束不变。
   */
  FR: {
    /** 第四十六轮：进深压到 0.05 ≈ 两颗螺钉直径 0.0426 再多一点（俯视才显扁） */
    w: 0.185, h: 0.095, d: 0.05,
    dialR: 0.02, resetR: 0.012, stopW: 0.018,
    auxR: 0.011, terminalR: 0.009, capH: 0.02, capScrewH: 0.016,
    blueBarH: 0.012, headH: 0.042,
    /**
     * 第三十轮照用户实物正面照重修：每极一块深色端子块（上下各一颗大绿铜组合槽
     * 螺钉），极间凹缝代替旧四道凸筋；顶部黄铜色横带；右侧操作面板 + 白色整定
     * 旋钮 + 右上角红色 STOP 方钮（照片无蓝色 TEST，已删）；脱扣指示窗保留。
     *  第三十一轮：poleRegionW 收紧到 0.072（步距 0.024），螺钉头（terminalPortR
     *  *0.82*2 ≈ 0.021）间隙只剩约一个 GAP、可以靠在一起；padW 随步距收窄。
     *  poleRegionW / poleRegionX 是三块端子块中心的外包区间：TerminalRow 以
     *  width/count 取步距；x 三段分区互不重叠。
     *  第三十三轮：第三十二轮的顶面布局整体立起来变成前脸——三块端子块竖向
     *  贯通前脸（padW 步距同第三十一轮）、竖直两排绿铜螺钉头对头相切（行距 =
     *  2 * screwR）、白旋钮轴沿 z 朝屏幕、红 STOP 靠脸顶（让开铜带）/
     *  脱扣窗靠脸底；stopY 回归正面定位，顶面定位的 stopY 废弃语义不复存在。
     */
    /**
     * 第四十八轮：照用户俯视实物照放大螺钉并拉开极距 —— 螺钉半径直接取
     * terminalPortR（不再 ×0.82），极距 0.024 → 0.043（壳体宽能容纳的最大值），
     * 间距/直径 1.13 → 1.65，两颗不再贴在一起；极区中心左移到 -0.032 给右侧
     * STOP 钮 / 旋钮让位，横向留 GAP 不越壳。
     */
    padW: 0.020, poleRegionW: 0.129, poleRegionX: -0.032,
    capBandH: 0.016, stopH: 0.014,
    dialX: 0.070, dialFaceR: 0.021, tickCount: 8,
    terminalPortR: 0.013,
    /**
     * 第四十六轮：两排螺钉不再头对头相切，行距按直径 + 2*GAP 留出空隙。
     * 上排前凸 GAP*6、下排后凹 GAP（再多就整颗埋进端子块看不见），
     * 两层相差 GAP*7，比原来齐平明显分出高低。
     */
    /**
     * 第五十一轮：去掉顶部棕色铜带后 padTop 顶到壳顶，两排分别贴上下边，
     * 行距拉到 GAP*11，中间空档从 0.013 → 0.0265（翻倍）。
     */
    screwRowGap: GAP * 11,
    screwUpperOut: GAP * 6,
    screwLowerIn: GAP,
    /**
     * 第四十七轮：照用户俯视实物照修——每极上下各一块独立的银色金属螺钉框，
     * 中间由黑色横带隔断（不再是一整块贯通的深色端子块）；极间黑色高立筋
     * 贯通上下且比螺钉框更凸；右侧补两组辅助触点小螺钉，旋钮带 14/18/22 数字。
     * 框高按螺钉直径派生（每框刚好托住一颗螺钉并留 GAP）。
     */
    frameW: 0.030, frameH: 0.028,
    frameD: GAP * 2, frameRim: GAP,
    /**
     * 第四十九轮：极间隔板改成填满框间净空的黑色立板（宽度由净空派生，
     * 不再写死 0.005）；前脸与上排银框齐平，仍低于螺钉不挡十字槽。
     */
    ribOut: GAP * 2,
    ribWidthRatio: 0.8,   // 占框间净空比例，两侧各留 10% 缝
    /**
     * 第五十轮：横向灭弧格栅——贯通三极，填在上下两排框之间的空档，
     * 与竖格栅同高（前脸齐银框），让六颗螺钉各占一格。厚度按空档派生。
     */
    crossRibGap: GAP * 0.5,   // 上下各留半档 GAP，不与银框共面
    /** 横格栅前脸取上下两排银框前脸的中点，不压上排也不压下排 */
    crossRibFrontRatio: 0.5,
    auxScrewR: 0.005, auxSpacing: 0.014,
    dialNumbers: ['14', '18', '22'] as const,
  },
  /**
   * 第十五 / 十六轮：柜内 24V 控制侧四件（纯视觉元件，不进地址表 / 快照 / PLC 链路）。
   * 尺寸按小型导轨式实物等比微调：PLC / 开关电源装上层（净高 0.1775），
   * 两台 24V 中间继电器并列装在中层 KM2 与 FR 之间；继电器顶面朝 +Z 安装，
   * 旋转后 y 方向只占原深度 d = 0.06，不穿层间线槽（中层净高 0.2475）。
   */
  /** 导轨式 24V 开关电源：窄高银灰金属网孔壳、上下两组栅栏端子、DC OK 绿灯 */
  PSU: {
    w: 0.055, h: 0.16, d: 0.11,
    ventCount: 4, terminalCount: 3, terminalR: 0.006, ledR: 0.005,
  },
  /** 小型一体式 PLC：第三十六轮照用户给的汇川 H5U 参考图做减法，只留四类可读元素——
   *  左上角 POW / RUN 两个方块 LED、中部两个方块网口、右侧两条异色 IO 细长条。
   *  旧的型号丝印条、I/O 状态点、RUN/STOP 盖板、两排 Barrier 端子全部删除。 */
  PLC: {
    w: 0.13, h: 0.135, d: 0.09,
    ledCount: 2, ledSize: 0.013,
    /** 网口方块（外框浅灰 + 前凸深色方孔）与右侧 IO 细长条 */
    portW: 0.03, portH: 0.024, stripW: 0.009,
  },
  /**
   * 24V 中间继电器（第二十轮，按用户指认的安装结构重画的单个样板）。
   * 柜内沿 +Z 的层次：底板（离屏幕最远）→ DIN 导轨装在底板上 → 器件底部卡在导轨上
   * → 器件顶朝屏幕。扁方底座、壳内方块、透明壳按这个方向分层，不再竖立在导轨上。
   * w/h/d 保持旧值供装配表 x 占宽与层距断言使用；baseT/coverT/blockT 是新的 z 向层次。
   */
  RELAY: {
    w: 0.035, h: 0.082, d: 0.06,
    /** ① 扁方底座厚 / ② 透明壳深 / ③ 壳内变色方块厚；方块宽度取 coilW */
    baseT: 0.012, coverT: 0.032, blockT: 0.012, coilW: 0.018,
  },
  TERMINAL: { w: 0.7, h: 0.045, d: 0.06, blocks: 16 },
  INTERLOCK: { barW: 0.014, barH: 0.014, moduleW: 0.03 },
  /** 独立琴式斜面操作台：实物按钮盒操作面与竖直面约 15° */
  CONSOLE: {
    width: 0.78, depth: 0.3, panelT: 0.022, height: 0.86,
    tilt: 0.26, skirtH: 0.1, legT: 0.055,
    buttonR: 0.023, buttonRingR: 0.031, buttonGap: 0.135, buttonRowZ: 0.055,
    lampR: 0.019, lampRingR: 0.027, lampGap: 0.145, lampRowZ: -0.075,
    nameplateY: 0.012,
  },
} as const;

/** 装配表：柜内元件沿 DIN 导轨的 x 偏移、标注与标注高度，单一来源 */
/**
 * 柜内装配表：按实物柜的三层导轨分区（第三十五轮按用户指定重排，下层 XT 端子排不变）。
 * 第一排（upper）：QF 塑壳断路器 → FU 三只熔断器 → PSU 24V 开关电源 → KA1 / KA2 两台
 * 24V 中间继电器；第二排（middle）：KM1 / KM2 两只互锁接触器 → FR 热继电器 → PLC；
 * 下层（lower）由 XT 端子排单独占据。
 * 排布策略：同一排内按「元件占宽 + 等间隙」居中铺开（upper 间隙 0.06、middle 间隙
 * 0.05），两侧留白接近对称，全部落在左右竖向线槽内缘（±0.39）之内。
 * labelHeight 是元件本体下方的偏移：每层元件下方一排短名标签，避开层间走线槽。
 * KM1/KM2 的取值判断按 label 而不是数组下标，插行 / 换排不会串状态。
 */
export const MOTOR_CABINET_LAYOUT = [
  { kind: 'breaker', level: 'upper', x: -0.288, label: 'QF', color: 'blue', labelHeight: -0.05 },
  { kind: 'fuse', level: 'upper', x: -0.073, label: 'FU', color: 'yellow', labelHeight: -0.05 },
  { kind: 'psu', level: 'upper', x: 0.115, label: 'PSU', color: 'gray', labelHeight: -0.05 },
  /** 两台 24V 中间继电器分别驱动 KM1 / KM2，正反两路各自同步；顶面朝柜门安装。
   *  第三十五轮起与 QF / FU / PSU 同在第一排右段，位于开关电源右侧。 */
  { kind: 'relay', level: 'upper', x: 0.223, label: 'KA1', color: 'green', labelHeight: -0.05 },
  { kind: 'relay', level: 'upper', x: 0.323, label: 'KA2', color: 'green', labelHeight: -0.05 },
  { kind: 'contactor', level: 'middle', x: -0.294, label: 'KM1', color: 'green', labelHeight: -0.05 },
  { kind: 'contactor', level: 'middle', x: -0.122, label: 'KM2', color: 'orange', labelHeight: -0.05 },
  /** JR36-63 独立式热继：与 KM1/KM2 同排装在中层导轨，靠导线连接，不做插接 */
  { kind: 'thermal', level: 'middle', x: 0.082, label: 'FR', color: 'red', labelHeight: -0.05 },
  /** PLC 第三十五轮从第一排最右移到第二排最右（KM1/KM2 与 FR 之后），与 24V 继电器
   *  分排：电源器件在上排，控制 / 执行器件在下排。 */
  { kind: 'plc', level: 'middle', x: 0.29, label: 'PLC', color: 'blue', labelHeight: -0.05 },
] as const;

/** 工位在整机里的位置：柜体在左、操作台在柜前、皮带向右、电机侧装于主动滚筒 */
export const MOTOR_ASSEMBLY = {
  CABINET_POSITION: [-1.02, 0, 0.3] as Vec3,
  /** 操作台放在柜体右前方且拉开距离，不在柜门正前，投影上与柜内元件彻底分离 */
  CONSOLE_POSITION: [0.2, 0, 1.12] as Vec3,
  /**
   * 输送线（第三十九轮）：长度 2.3，半长 + 端板后左端约 x-1.156。
   * 旧值 0.42 时左端落在 -0.736，比柜体右侧外沿 -0.56 还要深 0.17——
   * 主动滚筒轴承座（z 方向前伸）因此探进柜内，从柜内机位看就是 PLC 下方多出一块灰盒子。
   * 右移到 0.66 后左端 -0.496，与柜壁留 0.064 间隙，输送线完全在柜体右侧。
   */
  BELT_POSITION: [0.66, 0, -0.12] as Vec3,
} as const;

/** 教学整数值：转速 r/min、位移 mm、电流 A、时间 s，全部集中在本表 */
export const MOTOR_PROCESS = {
  RATED_RPM: 1400,
  ACCEL_RPM_PER_S: 3200,
  DECEL_RPM_PER_S: 4200,
  /** 换向灭弧间隙：先释放当前接触器，隔一段时间再吸合反向 */
  ARC_GAP_SEC: 0.18,
  /** 额定转速下的皮带线速度 mm/s */
  BELT_SPEED_MM_PER_S: 230,
  NO_LOAD_CURRENT_A: 1.6,
  RATED_CURRENT_A: 4.0,
  /** 负载 0~100 对电流的附加量 A */
  LOAD_CURRENT_GAIN: 0.075,
  /** 超过该电流开始热累积 */
  TRIP_CURRENT_A: 7.0,
  THERMAL_GAIN: 0.32,
  THERMAL_COOL_PER_S: 0.14,
  THERMAL_TRIP: 1.0,
  /** 单帧积分上限 */
  MAX_DT: 0.05,
  /** 位移真值范围守卫：DINT32 有符号，留足余量 */
  MAX_DISPLACEMENT_MM: 2_000_000_000,
  /** 演示每一步时长 s */
  DEMO_STEP_SEC: 2.2,
  DEMO_JOG_SEC: 1.2,
  /** 演示过载时把负载拉到该值 */
  DEMO_OVERLOAD_LOAD: 100,
} as const;

export const MOTOR_PHASE = {
  POWER_OFF: 0,
  IDLE: 1,
  FWD_JOG: 2,
  FWD_RUN: 3,
  REV_JOG: 4,
  REV_RUN: 5,
  OVERLOAD: 6,
  RESET_PENDING: 7,
} as const;
export type MotorPhase = (typeof MOTOR_PHASE)[keyof typeof MOTOR_PHASE];
export const MOTOR_PHASE_LABEL: Record<number, string> = {
  [MOTOR_PHASE.POWER_OFF]: '断电',
  [MOTOR_PHASE.IDLE]: '待机',
  [MOTOR_PHASE.FWD_JOG]: '正转点动',
  [MOTOR_PHASE.FWD_RUN]: '正转运行',
  [MOTOR_PHASE.REV_JOG]: '反转点动',
  [MOTOR_PHASE.REV_RUN]: '反转运行',
  [MOTOR_PHASE.OVERLOAD]: '过载停机',
  [MOTOR_PHASE.RESET_PENDING]: '待复位',
};

/** 五个柜门按钮：设备→PLC 的输入点，仿真模式只回写、不直接驱动线圈 */
export interface MotorButtons {
  fwdJog: boolean;
  revJog: boolean;
  fwdStart: boolean;
  revStart: boolean;
  stop: boolean;
}
export const MOTOR_EMPTY_BUTTONS: MotorButtons = {
  fwdJog: false, revJog: false, fwdStart: false, revStart: false, stop: false,
};
export const MOTOR_BUTTON_LABELS: Record<keyof MotorButtons, string> = {
  fwdJog: '正点动', revJog: '反点动', fwdStart: '正启动', revStart: '反启动', stop: '停止',
};

export interface MotorCoils { km1: boolean; km2: boolean; }
export const MOTOR_EMPTY_COILS: MotorCoils = { km1: false, km2: false };

export function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min;
}
export function clampLoad(v: number): number {
  return clamp(v, 0, 100);
}
export function clampThermal(v: number): number {
  return clamp(v, 0, 1.4);
}
export function clampDisplacement(v: number): number {
  return clamp(v, -MOTOR_PROCESS.MAX_DISPLACEMENT_MM, MOTOR_PROCESS.MAX_DISPLACEMENT_MM);
}

/**
 * 硬件互锁解析（纯函数，唯一来源）。
 *
 * - 两线圈命令同时有效：禁止态，保持上次吸合状态；上次都未吸合则都不吸合。
 * - 反向命令撞上仍吸合的接触器：被对方常闭辅助触点挡住，保持现状。
 * - 其余：命令直接决定吸合；任意时刻最多一只吸合。
 *
 * 无自锁：本函数不接受也不产生「KM 辅助常开保持」输入，保持逻辑属于学生 PLC 程序。
 */
export interface InterlockResult {
  km1On: boolean;
  km2On: boolean;
  forbidden: boolean;
  interlocked: boolean;
}
export function resolveContactors(
  km1Cmd: boolean, km2Cmd: boolean, prevKm1On: boolean, prevKm2On: boolean,
): InterlockResult {
  if (km1Cmd && km2Cmd) {
    return { km1On: prevKm1On, km2On: prevKm2On, forbidden: true, interlocked: false };
  }
  if (km1Cmd && prevKm2On) {
    return { km1On: false, km2On: true, forbidden: false, interlocked: true };
  }
  if (km2Cmd && prevKm1On) {
    return { km1On: true, km2On: false, forbidden: false, interlocked: true };
  }
  return { km1On: km1Cmd, km2On: km2Cmd, forbidden: false, interlocked: false };
}

/** 电机方向：正转 +1、反转 -1、停止 0，只由互锁后的吸合状态派生 */
export function motorDirection(km1On: boolean, km2On: boolean): -1 | 0 | 1 {
  if (km1On && !km2On) return 1;
  if (km2On && !km1On) return -1;
  return 0;
}

/** 电流由转速与负载同源派生：负载升高才会越过热继电器动作电流 */
export function motorCurrentA(speedRpm: number, loadPercent: number): number {
  const ratio = clamp(Math.abs(speedRpm) / MOTOR_PROCESS.RATED_RPM, 0, 1);
  return MOTOR_PROCESS.NO_LOAD_CURRENT_A
    + (MOTOR_PROCESS.RATED_CURRENT_A - MOTOR_PROCESS.NO_LOAD_CURRENT_A) * ratio
    + clampLoad(loadPercent) * MOTOR_PROCESS.LOAD_CURRENT_GAIN;
}

/** 皮带线速度 mm/s，方向取电机方向，转速未达额定按比例缩放 */
export function beltVelocityMm(direction: -1 | 0 | 1, speedRpm: number): number {
  const ratio = clamp(Math.abs(speedRpm) / MOTOR_PROCESS.RATED_RPM, 0, 1);
  return direction * MOTOR_PROCESS.BELT_SPEED_MM_PER_S * ratio;
}

/** 物料箱沿带的局部 x 偏移：位移为唯一真值，端点循环回绕 */
export function motorBoxOffset(index: number, displacement: number, beltLength: number): number {
  const span = beltLength * 0.82;
  const raw = displacement + index * (span / MOTOR_GEOM.BOX.count);
  const wrapped = ((raw % span) + span) % span;
  return wrapped - span / 2;
}

/** 状态色二选一成组单例：灯与 3D 材质共用同一份颜色常量 */
export const MOTOR_LAMP_COLORS = {
  /** 操作台电源指示灯：亮银白，与正转绿 / 反转黄 / 过载红区分 */
  power: MOTOR_VISUAL.LAMP_POWER,
  /** 柜内器件指示灯（开关电源 DC OK、PLC 的 POW / RUN）：工业惯例绿灯 */
  device: MOTOR_VISUAL.LAMP_DEVICE,
  forward: MOTOR_VISUAL.LAMP_GREEN,
  reverse: MOTOR_VISUAL.LAMP_YELLOW,
  overload: MOTOR_VISUAL.LAMP_RED,
  off: MOTOR_VISUAL.LAMP_DARK,
} as const;
