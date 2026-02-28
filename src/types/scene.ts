import * as THREE from 'three';

// 场景上下文类型
export interface SceneContextType {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
}

// 3D 组件 Props 基础类型
export interface SceneComponentProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

// 传送带 Props
export interface ConveyorBeltProps extends SceneComponentProps {
  running: boolean;
}

// 气缸 Props
export interface CylinderProps extends SceneComponentProps {
  name: string;
  extended: boolean;
  onExtended?: () => void;
  onRetracted?: () => void;
}

// 传感器 Props
export interface SensorProps extends SceneComponentProps {
  name: string;
  active: boolean;
}

// 物料 Props
export interface MaterialProps extends SceneComponentProps {
  color: string;
}

// 材质颜色常量
export const MATERIAL_COLORS = {
  BLUE: '#4A90E2',
  BLACK: '#2C3E50',
} as const;
