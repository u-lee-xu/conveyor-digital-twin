/**
 * 交通灯场景金属结构件共享材质 —— 为 Saltline 程序化表面纹理提供单例载体。
 *
 * 只把原本内联在 SceneContent 的底座 / 灯杆 / 横臂 / 吊架收拢成单例，
 * 色值、roughness、metalness 与原 JSX 逐字一致；灯壳、灯镜、遮阳罩、
 * 道路标线、车辆与全部状态色仍留在组件内，不受影响。
 */
import * as THREE from 'three';
import { applySurfaceTextures } from '@digital-twin/shared/three/surfaceTextures';

export const TRAFFIC_MATERIALS = {
  poleBase: new THREE.MeshStandardMaterial({ color: '#3a4756', roughness: 0.6 }),
  pole: new THREE.MeshStandardMaterial({ color: '#4a5868', roughness: 0.5, metalness: 0.4 }),
  arm: new THREE.MeshStandardMaterial({ color: '#4a5868', roughness: 0.5, metalness: 0.4 }),
  hanger: new THREE.MeshStandardMaterial({ color: '#3a4756', roughness: 0.5, metalness: 0.3 }),
} as const;

/** 只挂金属结构件；灯壳为喷塑壳体、灯镜为动态自发光，均不挂 */
const TRAFFIC_METAL_KEYS = ['poleBase', 'pole', 'arm', 'hanger'] as const;

/** 幂等惰性：由场景入口在首次渲染时调用一次 */
export function applyProceduralTextures(): void {
  applySurfaceTextures(TRAFFIC_MATERIALS, TRAFFIC_METAL_KEYS);
}
