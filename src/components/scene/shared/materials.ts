import * as THREE from 'three';

// 共享材质 - 所有组件复用，提升性能
export const materials = {
  // 端盖材质 - 银色金属
  endCap: new THREE.MeshStandardMaterial({
    color: 0xC0C0C0,
    metalness: 0.7,
    roughness: 0.3,
  }),
  
  // 气缸主体材质 - 灰色金属
  cylinderBody: new THREE.MeshStandardMaterial({
    color: 0xA0A0A0,
    metalness: 0.6,
    roughness: 0.4,
  }),
  
  // 活塞杆材质 - 亮银色
  cylinderRod: new THREE.MeshStandardMaterial({
    color: 0xE8E8E8,
    metalness: 0.85,
    roughness: 0.15,
  }),
  
  // 气口材质 - 深灰
  cylinderPort: new THREE.MeshStandardMaterial({
    color: 0x606060,
    metalness: 0.5,
    roughness: 0.5,
  }),
  
  // 磁性开关材质
  magneticSwitch: new THREE.MeshStandardMaterial({
    color: 0x505050,
    metalness: 0.3,
    roughness: 0.7,
  }),
  
  // LED激活 - 绿色发光
  ledActive: new THREE.MeshStandardMaterial({
    color: 0x00FF00,
    emissive: 0x00FF00,
    emissiveIntensity: 0.8,
  }),
  
  // LED未激活 - 暗灰
  ledInactive: new THREE.MeshStandardMaterial({
    color: 0x333333,
    emissive: 0x000000,
    emissiveIntensity: 0,
  }),
  
  // 滚筒材质
  roller: new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    metalness: 0.3,
    roughness: 0.7,
  }),
  
  // 滚筒运行时材质
  rollerRunning: new THREE.MeshStandardMaterial({
    color: 0x808080,
    metalness: 0.5,
    roughness: 0.4,
  }),
  
  // 深色金属 - 传送带框架
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x303030,
    metalness: 0.6,
    roughness: 0.4,
  }),
  
  // 传感器材质 - 深灰盒子
  sensor: new THREE.MeshStandardMaterial({
    color: 0x555555,
    metalness: 0.4,
    roughness: 0.6,
  }),
  
  // 传感器激活 - 发光橙色
  sensorActive: new THREE.MeshStandardMaterial({
    color: 0xFF8800,
    emissive: 0xFF8800,
    emissiveIntensity: 0.6,
  }),
  
  // 传感器检测到物料 - 发光绿色
  sensorDetected: new THREE.MeshStandardMaterial({
    color: 0x00FF00,
    emissive: 0x00FF00,
    emissiveIntensity: 0.6,
  }),
  
  // 物料颜色
  materialBlue: new THREE.MeshStandardMaterial({
    color: 0x2196F3,
    metalness: 0.2,
    roughness: 0.6,
  }),
  
  materialBlack: new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.1,
    roughness: 0.8,
  }),
  
  // 传感器支架 - 黑色金属
  sensorBracket: new THREE.MeshStandardMaterial({
    color: 0x222222,
    metalness: 0.5,
    roughness: 0.5,
  }),
  
  // 木头材质 - 物料台
  wood: new THREE.MeshStandardMaterial({
    color: 0x8B4513,
    metalness: 0.1,
    roughness: 0.9,
  }),
  
  // 地面材质
  ground: new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    metalness: 0.0,
    roughness: 0.9,
  }),
  
  // 传感器类型标签材质
  sensorLabelFeed: new THREE.MeshStandardMaterial({
    color: 0x4CAF50,
    emissive: 0x4CAF50,
    emissiveIntensity: 0.3,
  }),
  
  sensorLabelColor: new THREE.MeshStandardMaterial({
    color: 0x2196F3,
    emissive: 0x2196F3,
    emissiveIntensity: 0.3,
  }),
  
  sensorLabelMaterial: new THREE.MeshStandardMaterial({
    color: 0xFF9800,
    emissive: 0xFF9800,
    emissiveIntensity: 0.3,
  }),
};