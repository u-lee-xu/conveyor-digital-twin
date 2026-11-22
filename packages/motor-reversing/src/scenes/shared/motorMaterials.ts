/**
 * 共享材质单例：状态色一律「二选一成组单例」，禁止逐帧改共享材质颜色。
 * 颜色全部来自 motorConstants 的视觉令牌（其源头是 shared/industrialVisual.ts）。
 * 质感分工：金属件高 metalness、橡胶/塑料低 metalness、灯罩带 emissive。
 */
import { MeshStandardMaterial, Color } from 'three';
import { applySurfaceTextures } from '@digital-twin/shared/three/surfaceTextures';
import {
  MOTOR_VISUAL as V, MOTOR_LAMP_COLORS, MOTOR_MODEL_PALETTE as P,
} from '../../constants/motorConstants';

function mat(color: string, metalness = 0.45, roughness = 0.55, extra: Record<string, unknown> = {}) {
  return new MeshStandardMaterial({
    color: new Color(color), metalness, roughness, ...extra,
  });
}
/**
 * 发光件：颜色 + 自发光同源。
 * 第三十八轮加 `emissiveIntensity` 参数：柜内小面积方块 LED（开关电源 DC OK / PLC 的 POW·RUN）
 * 面积小、又贴着暗机身，0.95 的自发光在色调映射后会被推到近白，读不出「绿」；
 * 单独降到 `LAMP_LED_GLOW`，操作台大灯罩仍用默认值。
 */
export const LAMP_LED_GLOW = 0.42;
function glow(color: string, emissiveIntensity = 0.95) {
  return mat(color, 0.1, 0.28, { emissive: new Color(color), emissiveIntensity });
}
/** 令牌派生：牛皮纸棕（黄铜棕向石墨灰靠）与封箱胶带米黄，避免亮橙塑料感 */
const CARTON_COLOR = new Color(V.BRASS_COLOR)
  .lerp(new Color(V.STRUCT_COLOR), 0.36).multiplyScalar(0.8).getStyle();
const TAPE_COLOR = new Color(V.ENDCAP_COLOR).lerp(new Color(V.BRASS_COLOR), 0.52).getStyle();

export const MOTOR_MATERIALS = {
  /** 结构件 */
  skid: mat(V.BASE_COLOR, 0.6, 0.45),
  struct: mat(V.STRUCT_COLOR, 0.5, 0.55),
  profileSlot: mat(V.PROFILE_SLOT_COLOR, 0.35, 0.75),
  silver: mat(V.SILVER_COLOR, 0.78, 0.26),
  axis: mat(V.AXIS_COLOR, 0.82, 0.22),
  endCap: mat(V.ENDCAP_COLOR, 0.65, 0.35),
  brass: mat(V.BRASS_COLOR, 0.82, 0.3),
  darkMetal: mat(V.MAGSWITCH_COLOR, 0.35, 0.68),
  cabinet: mat(V.CABINET_COLOR, 0.4, 0.6),
  /** 柜内安装板用中灰镀锌板，避免纯白背板把柜内照成一块白板 */
  cabinetInner: mat(V.BASE_COLOR, 0.25, 0.8),
  panel: mat(V.PANEL_COLOR, 0.22, 0.72),
  /** 柜内四元件：配色采样自用户上传的 STEP，按型号还原 */
  poleWhite: mat(P.POLE_WHITE, 0.1, 0.72),
  poleLip: mat(P.POLE_LIP, 0.15, 0.7),
  /** 第十七轮：PLC 照汇川 H3U 实物改成深灰黑工程塑料机身（复用端子孔深色调） */
  plcBody: mat(P.CAVITY_DARK, 0.12, 0.78),
  handleBlue: mat(P.HANDLE_BLUE, 0.12, 0.55),
  contactorUpper: mat(P.CONTACTOR_UPPER, 0.12, 0.7),
  contactorLower: mat(P.CONTACTOR_LOWER, 0.15, 0.78),
  contactorCoil: mat(P.CONTACTOR_COIL, 0.55, 0.42),
  thermalYellow: mat(P.THERMAL_YELLOW, 0.1, 0.72),
  thermalFace: mat(P.THERMAL_FACE, 0.15, 0.72),
  stopRed: mat(P.STOP_RED, 0.15, 0.55),
  testTeal: mat(P.TEST_TEAL, 0.15, 0.55),
  fuseBase: mat(P.FUSE_BASE, 0.12, 0.72),
  cavityDark: mat(P.CAVITY_DARK, 0.15, 0.85),
  terminalSilver: mat(P.TERMINAL_SILVER, 0.7, 0.3),
  /** 第三十轮：FR 六颗端子大螺钉的绿铜色（用户实物照镀层色），与银螺钉成组单例 */
  frScrewGreen: mat(P.TERMINAL_SCREW_GREEN, 0.7, 0.34),
  /** 皮带与滚筒：真实输送带是哑光深色橡胶，只有低调的接头线 */
  rubber: mat(V.PROFILE_SLOT_COLOR, 0.05, 0.95),
  beltJoint: mat(V.STRUCT_COLOR, 0.05, 0.92),
  roller: mat(V.AXIS_COLOR, 0.7, 0.34),
  /** 瓦楞纸箱：哑光牛皮纸棕 + 半透明封箱胶带 + 折痕 */
  carton: mat(CARTON_COLOR, 0.02, 0.98),
  cartonTape: mat(TAPE_COLOR, 0.02, 0.9, { transparent: true, opacity: 0.42 }),
  cartonSeam: mat(V.STRUCT_COLOR, 0.05, 0.95),
  /** 车间地坪：承接阴影的哑光深灰平面 */
  floor: mat(V.STRUCT_COLOR, 0.02, 0.98),
  /** 柜内元件外壳：实物以白色/浅灰工程塑料为主，端子腔与灭弧罩深灰 */
  breakerBody: mat(V.PANEL_COLOR, 0.16, 0.72),
  breakerFace: mat(V.SILVER_COLOR, 0.18, 0.62),
  contactorBody: mat(V.PANEL_COLOR, 0.16, 0.72),
  contactorArc: mat(V.STRUCT_COLOR, 0.3, 0.68),
  coilBody: mat(V.CABINET_COLOR, 0.25, 0.7),
  fuseBody: mat(V.PANEL_COLOR, 0.14, 0.75),
  fuseGlass: mat(V.SILVER_COLOR, 0.1, 0.35, { transparent: true, opacity: 0.45 }),
  terminalBlock: mat(V.MAGSWITCH_COLOR, 0.2, 0.75),
  duct: mat(V.BASE_COLOR, 0.18, 0.78),
  nameplate: mat(V.SILVER_COLOR, 0.3, 0.5),
  /** 接触器正面的蓝底型号铭牌，贴近实物 KM 标签 */
  nameplateBlue: mat(V.CABINET_COLOR, 0.2, 0.6),
  /** 线槽上的黄色标识条：低金属度哑光，避免高亮成一条金带 */
  ductLabel: mat(V.BRASS_COLOR, 0.12, 0.88),
  /** 状态件：按状态切换引用，不改颜色 */
  contactorIdle: mat(V.STRUCT_COLOR, 0.3, 0.7),
  contactorOn: mat(V.LAMP_GREEN, 0.2, 0.5),
  coilIdle: mat(V.MAGSWITCH_COLOR, 0.2, 0.75),
  coilOn: mat(V.BRASS_COLOR, 0.55, 0.4),
  contactOpen: mat(V.SILVER_COLOR, 0.8, 0.25),
  contactClosed: mat(V.LAMP_RED, 0.4, 0.4),
  /** FR 与 KM 同系列壳体（共用 contactorBody）；跳闸只让脱扣指示窗转红，不整壳变色 */
  frTripped: mat(V.LAMP_RED, 0.2, 0.5),
  /** 实物小型断路器是红色拨柄，合/分用拨柄角度与机械色标区分，不装发光指示灯 */
  handleRed: mat(V.LAMP_RED, 0.15, 0.55),
  dial: mat(V.LAMP_YELLOW, 0.15, 0.55),
  /** 柜内配线：低饱和暗色，避免鲜艳线束在浅色背板上抢眼 */
  wireL1: mat(V.BRASS_COLOR, 0.55, 0.55),
  wireL2: mat(V.STRUCT_COLOR, 0.2, 0.8),
  wireL3: mat(V.AXIS_COLOR, 0.35, 0.7),
  wireCtrl: mat(V.BASE_COLOR, 0.2, 0.75),
  /** 操作台按钮：工业标准色，全部取自视觉令牌 */
  buttonBlack: mat(V.LAMP_DARK, 0.15, 0.55),
  buttonGreen: mat(V.LAMP_GREEN, 0.15, 0.5),
  buttonYellow: mat(V.LAMP_YELLOW, 0.15, 0.5),
  buttonRed: mat(V.LAMP_RED, 0.15, 0.5),
  buttonDark: mat(V.LAMP_DARK, 0.15, 0.6),
  buttonRing: mat(V.SILVER_COLOR, 0.85, 0.22),
  buttonPressed: mat(V.SILVER_COLOR, 0.55, 0.4),
  lampRing: mat(V.SILVER_COLOR, 0.82, 0.25),
  lamp: {
    /** 操作台电源指示灯：亮银白，沿用默认自发光 */
    power: glow(MOTOR_LAMP_COLORS.power),
    /** 柜内器件指示灯（开关电源 DC OK / PLC 的 POW·RUN）：绿灯 + 低一档自发光，避免被推成近白 */
    device: glow(MOTOR_LAMP_COLORS.device, LAMP_LED_GLOW),
    forward: glow(MOTOR_LAMP_COLORS.forward),
    reverse: glow(MOTOR_LAMP_COLORS.reverse),
    overload: glow(MOTOR_LAMP_COLORS.overload),
    off: mat(MOTOR_LAMP_COLORS.off, 0.15, 0.55, { emissive: new Color(MOTOR_LAMP_COLORS.off), emissiveIntensity: 0 }),
  },
} as const;

export type MotorLampKind = keyof typeof MOTOR_MATERIALS.lamp;

export function motorLampMaterial(kind: MotorLampKind, on: boolean) {
  return on ? MOTOR_MATERIALS.lamp[kind] : MOTOR_MATERIALS.lamp.off;
}

/** 按钮颜色：点动黑、正启动绿、反启动黄、停止红 */
export const MOTOR_BUTTON_COLORS = {
  fwdJog: MOTOR_MATERIALS.buttonBlack,
  revJog: MOTOR_MATERIALS.buttonBlack,
  fwdStart: MOTOR_MATERIALS.buttonGreen,
  revStart: MOTOR_MATERIALS.buttonYellow,
  stop: MOTOR_MATERIALS.buttonRed,
} as const;

/**
 * 与汇川龙门场景一致的 Saltline 程序化表面细节：只挂金属结构件与金属环。
 * 贴面（profileSlot/nameplate/nameplateBlue/ductLabel/cartonTape）、柜体钣金、
 * 白色工程塑料壳体、瓦楞纸箱、地坪、配线、按钮色帽与全部状态色 / 指示灯不挂；
 * 纸箱是牛皮纸而非木纹件，因此不设 wood 键。
 */
const MOTOR_METAL_KEYS = [
  'skid', 'struct', 'silver', 'axis', 'endCap', 'brass', 'darkMetal',
  'roller', 'contactOpen', 'buttonRing', 'buttonPressed', 'lampRing',
  'frScrewGreen',
] as const;

/** 幂等惰性：由场景入口在首次渲染时调用一次 */
export function applyProceduralTextures(): void {
  applySurfaceTextures(MOTOR_MATERIALS, MOTOR_METAL_KEYS);
}
