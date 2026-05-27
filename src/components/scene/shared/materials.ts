/**
 * ================================================
 * 文件名: materials.ts
 * 功能: 数字孪生传送带分拣系统 - 3D材质定义
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: three.js 库
 * - 被依赖: ConveyorBelt.tsx, Cylinder.tsx, Sensor.tsx, Material.tsx, MaterialTable.tsx
 * - 提供: 所有3D组件的共享材质对象
 * 
 * 【功能说明】
 * 本文件定义了场景中所有3D对象的材质（Material），
 * 使用 MeshPhysicalMaterial 提升真实感，添加 clearcoat（清漆）和 sheen（光泽）效果。
 * 所有材质都设计为单例共享使用，避免重复创建，提升性能。
 */

import * as THREE from 'three';

/**
 * 共享材质集合
 * 所有组件复用这些材质对象，提升渲染性能
 * 注意：所有材质都是单例，请勿直接修改，如需修改请克隆后使用
 */
export const materials = {
  // ============================================
  // 气缸相关材质
  // ============================================

  /**
   * 气缸端盖材质 - 亮银色，带清漆效果
   */
  endCap: new THREE.MeshPhysicalMaterial({
    color: 0xD4D4D4,
    metalness: 0.85,
    roughness: 0.2,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  }),

  /**
   * 气缸主体材质 - 工业灰蓝（提升对比度）
   */
  cylinderBody: new THREE.MeshPhysicalMaterial({
    color: 0x64748B,
    metalness: 0.7,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  }),

  /**
   * 活塞杆材质 - 镀铬效果（高反光）
   */
  cylinderRod: new THREE.MeshPhysicalMaterial({
    color: 0xF0F0F0,
    metalness: 0.95,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  }),

  /**
   * 气口材质 - 深灰蓝
   */
  cylinderPort: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.6,
    roughness: 0.4,
  }),

  /**
   * 磁性开关材质 - 深色金属
   */
  magneticSwitch: new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.5,
    roughness: 0.5,
  }),

  /**
   * LED激活状态 - 高亮绿色发光（增强可见度）
   */
  ledActive: new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.1,
  }),

  ledInactive: new THREE.MeshStandardMaterial({
    color: 0x1F2937,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.7,
    metalness: 0.3,
  }),

  // ============================================
  // 传送带相关材质
  // ============================================

  /**
   * 传送带滚筒材质 - 金属灰（停止状态）
   */
  roller: new THREE.MeshStandardMaterial({
    color: 0x6B7280,
    metalness: 0.6,
    roughness: 0.4,
  }),

  /**
   * 传送带滚筒运行时材质 - 更亮的金属色
   */
  rollerRunning: new THREE.MeshStandardMaterial({
    color: 0x9CA3AF,
    metalness: 0.75,
    roughness: 0.25,
  }),

  /**
   * 传送带框架材质 - 深色金属（使用更亮的灰蓝）
   */
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.65,
    roughness: 0.35,
  }),

  // ============================================
  // 传感器相关材质
  // ============================================

  /**
   * 传感器主体材质 - 传感器灰（提高对比度）
   */
  sensor: new THREE.MeshStandardMaterial({
    color: 0x94A3B8,
    metalness: 0.5,
    roughness: 0.5,
  }),

  /**
   * 传感器激活状态 - 发光橙色（增强可见度）
   */
  sensorActive: new THREE.MeshStandardMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),

  /**
   * 传感器检测到物料 - 发光绿色（增强可见度）
   */
  sensorDetected: new THREE.MeshStandardMaterial({
    color: 0x22C55E,
    emissive: 0x22C55E,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),

  /**
   * 传感器支架材质 - 黑色金属（提高对比度）
   */
  sensorBracket: new THREE.MeshStandardMaterial({
    color: 0x1F2937,
    metalness: 0.55,
    roughness: 0.45,
  }),

  /**
   * 上料传感器类型标签材质 - 绿色发光
   */
  sensorLabelFeed: new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  /**
   * 色标传感器类型标签材质 - 蓝色发光
   */
  sensorLabelColor: new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    emissive: 0x3B82F6,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  /**
   * 物料传感器类型标签材质 - 橙色发光
   */
  sensorLabelMaterial: new THREE.MeshStandardMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  // ============================================
  // 物料相关材质
  // ============================================

  /**
   * 蓝色物料材质 - 使用更鲜艳的蓝色
   */
  materialBlue: new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    metalness: 0.15,
    roughness: 0.5,
  }),

  /**
   * 黑色物料材质 - 使用深灰黑提高对比度
   */
  materialBlack: new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.15,
    roughness: 0.7,
  }),

  // ============================================
  // 物料台和环境材质
  // ============================================

  /**
   * 物料台木头材质 - 增强纹理感
   */
  wood: new THREE.MeshStandardMaterial({
    color: 0xA0522D,
    metalness: 0.05,
    roughness: 0.85,
  }),

  /**
   * 地面材质 - 使用更亮的灰白提高对比度
   */
  ground: new THREE.MeshStandardMaterial({
    color: 0xE5E7EB,
    metalness: 0.0,
    roughness: 0.85,
  }),
};