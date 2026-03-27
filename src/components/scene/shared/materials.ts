import * as THREE from 'three';

// 共享材质 - 所有组件复用，提升性能
// 使用MeshPhysicalMaterial提升真实感，添加clearcoat和sheen效果

// 端盖材质 - 银色金属（增强反射）
export const materials = {
  // 端盖材质 - 亮银色，带清漆效果
  endCap: new THREE.MeshPhysicalMaterial({
    color: 0xD4D4D4,
    metalness: 0.85,
    roughness: 0.2,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  }),
  
  // 气缸主体材质 - 工业灰蓝（提升对比度）
  cylinderBody: new THREE.MeshPhysicalMaterial({
    color: 0x64748B,
    metalness: 0.7,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  }),
  
  // 活塞杆材质 - 镀铬效果
  cylinderRod: new THREE.MeshPhysicalMaterial({
    color: 0xF0F0F0,
    metalness: 0.95,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  }),
  
  // 气口材质 - 深灰蓝
  cylinderPort: new THREE.MeshPhysicalMaterial({
    color: 0x475569,
    metalness: 0.6,
    roughness: 0.4,
  }),
  
  // 磁性开关材质 - 深色金属
  magneticSwitch: new THREE.MeshPhysicalMaterial({
    color: 0x374151,
    metalness: 0.5,
    roughness: 0.5,
  }),
  
  // LED激活 - 高亮绿色发光（增强可见度）
  ledActive: new THREE.MeshPhysicalMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.1,
  }),
  
  // LED未激活 - 暗灰
  ledInactive: new THREE.MeshPhysicalMaterial({
    color: 0x1F2937,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.7,
    metalness: 0.3,
  }),
  
  // 滚筒材质 - 金属灰
  roller: new THREE.MeshPhysicalMaterial({
    color: 0x6B7280,
    metalness: 0.6,
    roughness: 0.4,
    clearcoat: 0.3,
  }),
  
  // 滚筒运行时材质 - 更亮的金属色
  rollerRunning: new THREE.MeshPhysicalMaterial({
    color: 0x9CA3AF,
    metalness: 0.75,
    roughness: 0.25,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  }),
  
  // 深色金属 - 传送带框架（使用更亮的灰蓝）
  darkMetal: new THREE.MeshPhysicalMaterial({
    color: 0x475569,
    metalness: 0.65,
    roughness: 0.35,
    clearcoat: 0.4,
  }),
  
  // 传感器材质 - 传感器灰（提高对比度）
  sensor: new THREE.MeshPhysicalMaterial({
    color: 0x94A3B8,
    metalness: 0.5,
    roughness: 0.5,
  }),
  
  // 传感器激活 - 发光橙色（增强可见度）
  sensorActive: new THREE.MeshPhysicalMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),
  
  // 传感器检测到物料 - 发光绿色（增强可见度）
  sensorDetected: new THREE.MeshPhysicalMaterial({
    color: 0x22C55E,
    emissive: 0x22C55E,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),
  
  // 物料颜色 - 蓝色（使用更鲜艳的颜色）
  materialBlue: new THREE.MeshPhysicalMaterial({
    color: 0x3B82F6,
    metalness: 0.15,
    roughness: 0.5,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
  }),
  
  // 物料颜色 - 黑色（提高对比度，使用深灰黑）
  materialBlack: new THREE.MeshPhysicalMaterial({
    color: 0x374151,
    metalness: 0.15,
    roughness: 0.7,
    sheen: 0.5,
    sheenColor: 0x6B7280,
    sheenRoughness: 0.5,
  }),
  
  // 传感器支架 - 黑色金属（提高对比度）
  sensorBracket: new THREE.MeshPhysicalMaterial({
    color: 0x1F2937,
    metalness: 0.55,
    roughness: 0.45,
  }),
  
  // 木头材质 - 物料台（增强纹理感）
  wood: new THREE.MeshPhysicalMaterial({
    color: 0xA0522D,
    metalness: 0.05,
    roughness: 0.85,
    sheen: 0.3,
    sheenColor: 0xD2691E,
  }),
  
  // 地面材质 - 使用更亮的灰白（提高对比度）
  ground: new THREE.MeshPhysicalMaterial({
    color: 0xE5E7EB,
    metalness: 0.0,
    roughness: 0.85,
  }),
  
  // 传感器类型标签材质 - 使用鲜艳的颜色提升可见度
  sensorLabelFeed: new THREE.MeshPhysicalMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),
  
  sensorLabelColor: new THREE.MeshPhysicalMaterial({
    color: 0x3B82F6,
    emissive: 0x3B82F6,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),
  
  sensorLabelMaterial: new THREE.MeshPhysicalMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),
};