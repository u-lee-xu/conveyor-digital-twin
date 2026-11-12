/**
 * 龙门场景共享材质单例 —— 与自动配药 / 传送带分拣同一套写法。
 *
 * 颜色一律取自 gantryConstants.ts 的 GANTRY_VISUAL（展开自 shared 的工业视觉令牌），
 * 本文件只负责 metalness / roughness / emissive / polygonOffset 等表面质感；
 * 组件里不再内联 new MeshStandardMaterial，避免纯色塑料感与每帧重建材质。
 */
import * as THREE from 'three';
import { GANTRY_VISUAL as V } from '../../constants/gantryConstants';
import { getProcTextures } from './proceduralTextures';

/** 贴面薄片通用参数：作为 SURFACE_GAP 几何错开之外的深度测试兜底，防 z-fighting */
const decal = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
} as const;

export const M = {
  /** 铝挤型材 / 台体 / 托架 */
  base: new THREE.MeshStandardMaterial({ color: V.BASE_COLOR, metalness: 0.5, roughness: 0.45 }),
  /** 石墨灰深色结构件 / 端盖 / 支柱 */
  dark: new THREE.MeshStandardMaterial({ color: V.STRUCT_COLOR, metalness: 0.45, roughness: 0.55 }),
  /** 亮银：直线导轨 / 丝杆 / 活塞杆 */
  silver: new THREE.MeshStandardMaterial({ color: V.SILVER_COLOR, metalness: 0.85, roughness: 0.18 }),
  /** 铝挤型 T 槽暗槽 */
  slot: new THREE.MeshStandardMaterial({ color: V.PROFILE_SLOT_COLOR, metalness: 0.4, roughness: 0.6, ...decal }),
  /** 贴面亮银：刻度环 / 耐磨条 / 高光边 */
  decal: new THREE.MeshStandardMaterial({ color: V.ENDCAP_COLOR, metalness: 0.8, roughness: 0.25, ...decal }),
  /** 贴面暗色：铭牌 / 沉孔 / 刻线 */
  decalDark: new THREE.MeshStandardMaterial({ color: V.MAGSWITCH_COLOR, metalness: 0.35, roughness: 0.6, ...decal }),
  /** 铝型材端盖 / 包边 */
  endCap: new THREE.MeshStandardMaterial({ color: V.ENDCAP_COLOR, metalness: 0.8, roughness: 0.3 }),
  /** 轴承座 / 导套 */
  sleeve: new THREE.MeshStandardMaterial({ color: V.SLEEVE_COLOR, metalness: 0.55, roughness: 0.45 }),
  /** 黄铜气接头 / 气管接头 */
  brass: new THREE.MeshStandardMaterial({ color: V.BRASS_COLOR, metalness: 0.75, roughness: 0.32 }),
  /** 气缸缸体 */
  cylinder: new THREE.MeshStandardMaterial({ color: V.CYL_BODY_COLOR, metalness: 0.55, roughness: 0.38 }),
  /** 活塞杆 / 导杆 */
  rod: new THREE.MeshStandardMaterial({ color: V.CYL_ROD_COLOR, metalness: 0.9, roughness: 0.15 }),
  /** 黑色波纹橡胶吸盘 */
  cup: new THREE.MeshStandardMaterial({ color: V.MAGSWITCH_COLOR, metalness: 0.05, roughness: 0.9 }),
  /** 吸盘唇边（略亮，表现薄橡胶） */
  cupLip: new THREE.MeshStandardMaterial({ color: V.SLEEVE_COLOR, metalness: 0.05, roughness: 0.85 }),
  /** 伺服电机本体 */
  servo: new THREE.MeshStandardMaterial({ color: V.MAGSWITCH_COLOR, metalness: 0.4, roughness: 0.6 }),
  /** 伺服散热筋 */
  servoRib: new THREE.MeshStandardMaterial({ color: V.STRUCT_COLOR, metalness: 0.5, roughness: 0.55 }),
  /** 伺服接线盒 / 磁性开关 */
  terminalBox: new THREE.MeshStandardMaterial({ color: V.CABINET_COLOR, metalness: 0.35, roughness: 0.6 }),
  /** 线性模组铝型材本体 */
  module: new THREE.MeshStandardMaterial({ color: V.PANEL_COLOR, metalness: 0.55, roughness: 0.42 }),
  /** 滑座 / 滑块 */
  slider: new THREE.MeshStandardMaterial({ color: V.ENDCAP_COLOR, metalness: 0.6, roughness: 0.35 }),
  /** 安装螺栓 / 地脚 */
  bolt: new THREE.MeshStandardMaterial({ color: V.MAGSWITCH_COLOR, metalness: 0.6, roughness: 0.45 }),
  /** 棋盘深棕浅格 */
  boardLight: new THREE.MeshStandardMaterial({ color: V.BOARD_LIGHT, metalness: 0.08, roughness: 0.78 }),
  /** 棋盘深棕深格 */
  boardDark: new THREE.MeshStandardMaterial({ color: V.BOARD_DARK, metalness: 0.08, roughness: 0.8 }),
  /** 棋盘边框 / 小桌腿底座 */
  boardEdge: new THREE.MeshStandardMaterial({ color: V.BOARD_EDGE, metalness: 0.15, roughness: 0.7 }),
  /** 棋盘格线（贴面暗刻线） */
  boardGrid: new THREE.MeshStandardMaterial({ color: V.BOARD_GRID, metalness: 0.1, roughness: 0.85, ...decal }),
  /** 红方棋子 */
  pieceRed: new THREE.MeshStandardMaterial({ color: V.PIECE_RED, metalness: 0.15, roughness: 0.58 }),
  /** 黑方棋子 */
  pieceBlack: new THREE.MeshStandardMaterial({ color: V.PIECE_BLACK, metalness: 0.15, roughness: 0.6 }),
  /** 棋子顶面刻字环（亮银贴面） */
  pieceFace: new THREE.MeshStandardMaterial({ color: V.ENDCAP_COLOR, metalness: 0.45, roughness: 0.5, ...decal }),
  /** 柜体 / 控制箱 */
  cabinet: new THREE.MeshStandardMaterial({ color: V.CABINET_COLOR, metalness: 0.4, roughness: 0.55 }),
  /** 原点传感器 LED（触发亮绿） */
  ledOrigin: new THREE.MeshStandardMaterial({
    color: V.LAMP_GREEN, emissive: V.LAMP_GREEN, emissiveIntensity: 1.6, roughness: 0.35,
  }),
  /** 终端限位 LED（触发亮黄） */
  ledEnd: new THREE.MeshStandardMaterial({
    color: V.LAMP_YELLOW, emissive: V.LAMP_YELLOW, emissiveIntensity: 1.6, roughness: 0.35,
  }),
  /** 灭态 LED */
  ledOff: new THREE.MeshStandardMaterial({
    color: V.LAMP_DARK, emissive: V.MAGSWITCH_COLOR, emissiveIntensity: 0, roughness: 0.6, metalness: 0.4,
  }),
} as const;

/** 相邻可见面最小贴面错开量，与配药 / 传送带场景共用同一口径 */
export const GAP = V.SURFACE_GAP;

/**
 * 把程序化表面细节挂到金属 / 木质材质上。
 * map 近白、bumpScale 极小，只提供拉丝与木纹质感，不改变 INDUSTRIAL_VISUAL 的结构色；
 * 贴面材质（slot / decal / decalDark / boardGrid）与橡胶、塑料、棋子不挂，避免加剧 z-fighting。
 */
const METAL_KEYS = ['base', 'module', 'endCap', 'silver', 'sleeve', 'cylinder', 'rod', 'slider'] as const;
const WOOD_KEYS = ['boardLight', 'boardDark', 'boardEdge'] as const;
let texturesApplied = false;

/** 幂等：只在首次渲染龙门场景时烘焙并挂载，其它设备场景零成本 */
export function applyProceduralTextures(): void {
  if (texturesApplied) return;
  const T = getProcTextures();
  for (const key of METAL_KEYS) {
    const mat: THREE.MeshStandardMaterial = M[key];
    mat.map = T.brushed;
    mat.bumpMap = T.micro;
    mat.bumpScale = 0.0012;
    mat.needsUpdate = true;
  }
  for (const key of WOOD_KEYS) {
    const mat: THREE.MeshStandardMaterial = M[key];
    mat.map = T.wood;
    mat.bumpMap = T.micro;
    mat.bumpScale = 0.0018;
    mat.needsUpdate = true;
  }
  texturesApplied = true;
}
