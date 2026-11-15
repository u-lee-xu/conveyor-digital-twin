/**
 * MD520 独立场景共享材质。颜色取自工业视觉令牌（与 shared 同源，此处自包含，
 * 避免独立设备包反向依赖传送带分拣场景）。贴面薄片带 polygonOffset 防 z-fighting。
 */
import * as THREE from 'three';
import { applySurfaceTextures } from '@digital-twin/shared/three/surfaceTextures';

const C = {
  BASE_COLOR: '#8b949e',
  STRUCT_COLOR: '#39434f',
  SLEEVE_COLOR: '#5d6b7c',
  SILVER_COLOR: '#dfe6ee',
  ENDCAP_COLOR: '#cbd3dc',
  CYL_BODY_COLOR: '#8794a4',
  CABINET_COLOR: '#3c4d63',
  PANEL_COLOR: '#d8dee6',
  LAMP_DARK: '#243040',
  LAMP_GREEN: '#2fb862',
  LAMP_RED: '#e04b3c',
  MATERIAL_BLUE_COLOR: '#3b82f6',
  LED_EMISSIVE_INTENSITY: 0.9,
} as const;

const decalOptions = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
} as const;

export const materials = {
  base: new THREE.MeshStandardMaterial({
    color: C.BASE_COLOR, metalness: 0.5, roughness: 0.45,
  }),
  profileSlot: new THREE.MeshStandardMaterial({
    color: C.STRUCT_COLOR, metalness: 0.45, roughness: 0.55,
  }),
  brightSilver: new THREE.MeshStandardMaterial({
    color: C.SILVER_COLOR, metalness: 0.85, roughness: 0.18,
  }),
  endCap: new THREE.MeshStandardMaterial({
    color: C.ENDCAP_COLOR, metalness: 0.8, roughness: 0.25,
  }),
  axle: new THREE.MeshStandardMaterial({
    color: C.SLEEVE_COLOR, metalness: 0.6, roughness: 0.4,
  }),

  vfdCabinet: new THREE.MeshStandardMaterial({
    color: C.CABINET_COLOR, metalness: 0.35, roughness: 0.62,
  }),
  vfdDoor: new THREE.MeshStandardMaterial({
    color: C.PANEL_COLOR, metalness: 0.25, roughness: 0.68,
  }),
  vfdMotor: new THREE.MeshStandardMaterial({
    color: C.CYL_BODY_COLOR, metalness: 0.58, roughness: 0.42,
  }),
  vfdMotorFin: new THREE.MeshStandardMaterial({
    color: C.SLEEVE_COLOR, metalness: 0.5, roughness: 0.55,
  }),
  vfdFanBlade: new THREE.MeshStandardMaterial({
    color: C.STRUCT_COLOR, metalness: 0.35, roughness: 0.6,
  }),
  vfdBelt: new THREE.MeshStandardMaterial({
    color: C.STRUCT_COLOR, metalness: 0.05, roughness: 0.9,
  }),
  vfdStripe: new THREE.MeshStandardMaterial({
    color: C.SLEEVE_COLOR, metalness: 0.3, roughness: 0.7, ...decalOptions,
  }),
  /** 高 metalness 在无 envMap 的三点布光下会读成黑圆盘，降金属度并给一点自发光 */
  vfdRoller: new THREE.MeshStandardMaterial({
    color: C.SILVER_COLOR, metalness: 0.12, roughness: 0.6,
    emissive: C.SILVER_COLOR, emissiveIntensity: 0.10,
  }),
  vfdRollerFace: new THREE.MeshStandardMaterial({
    color: C.ENDCAP_COLOR, metalness: 0.15, roughness: 0.55,
    emissive: C.ENDCAP_COLOR, emissiveIntensity: 0.16,
  }),
  vfdNameplate: new THREE.MeshStandardMaterial({
    color: C.ENDCAP_COLOR, metalness: 0.75, roughness: 0.3, ...decalOptions,
  }),
  vfdLedOff: new THREE.MeshStandardMaterial({
    color: C.LAMP_DARK, emissive: '#000000', emissiveIntensity: 0,
    roughness: 0.4, metalness: 0.2,
  }),
  vfdLedRun: new THREE.MeshStandardMaterial({
    color: C.LAMP_GREEN, emissive: C.LAMP_GREEN,
    emissiveIntensity: C.LED_EMISSIVE_INTENSITY, roughness: 0.3, metalness: 0.1,
  }),
  vfdLedFault: new THREE.MeshStandardMaterial({
    color: C.LAMP_RED, emissive: C.LAMP_RED,
    emissiveIntensity: C.LED_EMISSIVE_INTENSITY, roughness: 0.3, metalness: 0.1,
  }),
  vfdLedComm: new THREE.MeshStandardMaterial({
    color: C.MATERIAL_BLUE_COLOR, emissive: C.MATERIAL_BLUE_COLOR,
    emissiveIntensity: C.LED_EMISSIVE_INTENSITY, roughness: 0.3, metalness: 0.1,
  }),
} as const;

/**
 * 与汇川龙门场景一致的 Saltline 程序化表面细节：只挂电机 / 传动金属件。
 * 贴面（profileSlot/vfdStripe/vfdNameplate）、柜体门板、橡胶皮带与四路状态 LED 不挂；
 * LED 频率牌使用独立 CanvasTexture 动态重绘，也不在本列表内。
 */
const VFD_METAL_KEYS = [
  'base', 'brightSilver', 'endCap', 'axle',
  'vfdMotor', 'vfdMotorFin', 'vfdFanBlade', 'vfdRoller', 'vfdRollerFace',
] as const;

/** 幂等惰性：由场景入口在首次渲染时调用一次 */
export function applyProceduralTextures(): void {
  applySurfaceTextures(materials, VFD_METAL_KEYS);
}
