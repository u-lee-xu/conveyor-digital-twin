import * as THREE from 'three';

/** 配药场景共享材质 —— 风格与传送分拣场景（conveyor-sorting）保持一致：
 *  金属灰系（darkMetal/亮银）+ 特征色（滑台金/料斗黄/药仓彩/柜蓝）+ 发光灯 */
export const materials = {
  /** 底架/支撑柱（传送分拣 darkMetal 同系） */
  base: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.65,
    roughness: 0.35,
  }),

  /** 深色结构件（同步轮/垫脚/面板） */
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.55,
    roughness: 0.45,
  }),

  /** 亮银金属（导轨/推杆） */
  brightSilver: new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.9,
    roughness: 0.15,
  }),

  /** 亮银高光（螺旋牙/铰链） */
  endCap: new THREE.MeshStandardMaterial({
    color: 0xd4d4d4,
    metalness: 0.85,
    roughness: 0.2,
  }),

  /** 轴/滚珠（主轴） */
  axle: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.35,
  }),

  /** 气缸缸体 */
  cylinderBody: new THREE.MeshStandardMaterial({
    color: 0x64748B,
    metalness: 0.7,
    roughness: 0.35,
  }),

  /** 气缸推杆 */
  cylinderRod: new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    metalness: 0.95,
    roughness: 0.05,
  }),

  /** 黄铜件（气管接头/节流阀） */
  brass: new THREE.MeshStandardMaterial({
    color: 0xb45309,
    metalness: 0.85,
    roughness: 0.3,
  }),

  /** 磁性开关（纯黑） */
  magSwitch: new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.5,
    roughness: 0.5,
  }),

  /** 旋转气缸输出法兰（琥珀色，旋转输出位） */
  flange: new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.35,
    roughness: 0.35,
  }),

  /** 导套/螺母 */
  sleeve: new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.6,
    roughness: 0.35,
  }),

  /** 滑台（特征金） */
  slider: new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.25,
    roughness: 0.45,
  }),

  /** 料斗（特征黄） */
  hopper: new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.25,
    roughness: 0.45,
  }),

  /** 取药仓（特征橙） */
  bin: new THREE.MeshStandardMaterial({
    color: 0xf97316,
    metalness: 0.25,
    roughness: 0.45,
  }),

  /** 控制柜柜体 */
  cabinet: new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    metalness: 0.4,
    roughness: 0.5,
  }),

  /** 灯塔/指示灯 灭态 */
  lampDark: new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.7,
    metalness: 0.3,
  }),

  /** 指示灯 亮态（发射光，与 conveyor ledActive 同参数） */
  lampActive: (color: number) => new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.1,
  }),
} as const;