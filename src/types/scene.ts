/**
 * ================================================
 * 文件名: scene.ts
 * 功能: 数字孪生传送带分拣系统 - 3D场景相关类型定义
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: three.js 库
 * - 被依赖: Scene.tsx, ConveyorBelt.tsx, Cylinder.tsx, Sensor.tsx, Material.tsx 等场景组件
 * - 提供类型: 3D组件Props、场景上下文、材质颜色等
 * 
 * 【功能说明】
 * 本文件定义了3D场景相关的TypeScript类型，包括组件Props接口、
 * 材质颜色常量等，用于支持Three.js渲染的场景组件开发。
 */

import * as THREE from 'three';

// ============================================
// 场景上下文类型
// ============================================

/**
 * 场景上下文类型
 * 提供场景、相机、渲染器等核心Three.js对象的访问接口
 */
export interface SceneContextType {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
}

// ============================================
// 3D组件Props基础类型
// ============================================

/**
 * 3D组件Props基础接口
 * 所有场景组件都继承此接口，支持基本的3D变换属性
 */
export interface SceneComponentProps {
  position?: [number, number, number];  // 位置坐标 [x, y, z]
  rotation?: [number, number, number];  // 旋转角度 [x, y, z]（弧度）
  scale?: [number, number, number];     // 缩放比例 [x, y, z]
}

// ============================================
// 具体组件Props类型
// ============================================

/**
 * 传送带组件Props
 */
export interface ConveyorBeltProps extends SceneComponentProps {
  running: boolean;  // 传送带是否在运行
}

/**
 * 气缸组件Props
 */
export interface CylinderProps extends SceneComponentProps {
  name: string;                    // 气缸名称
  extended: boolean;               // 气缸是否伸出
  onExtended?: () => void;         // 气缸伸出完成的回调
  onRetracted?: () => void;        // 气缸缩回完成的回调
}

/**
 * 传感器组件Props
 */
export interface SensorProps extends SceneComponentProps {
  name: string;                    // 传感器名称
  active: boolean;                 // 传感器是否激活（检测到目标）
}

/**
 * 物料组件Props
 */
export interface MaterialProps extends SceneComponentProps {
  color: string;  // 物料颜色
}

// ============================================
// 材质颜色常量
// ============================================

/**
 * 常用材质颜色常量
 * 用于统一管理场景中的颜色方案
 */
export const MATERIAL_COLORS = {
  BLUE: '#4A90E2',   // 蓝色 - 用于蓝色物料、蓝色标签等
  BLACK: '#2C3E50',  // 黑色 - 用于黑色物料、深色背景等
} as const;