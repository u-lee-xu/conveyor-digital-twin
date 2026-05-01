import * as THREE from 'three';

// 共享几何体 - 所有组件复用，提升性能
export const geometries = {
  // 滚筒 - 传送带使用（缩短宽度）
  roller: new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16),
  
  // 气缸端盖 (改为扁平型)
  cylinderEndCap: new THREE.BoxGeometry(0.2, 0.08, 0.2),
  
  // 气缸主体
  cylinderBody: new THREE.BoxGeometry(0.18, 0.8, 0.18),
  cylinderBodyLong: new THREE.BoxGeometry(0.18, 1.2, 0.18),
  
  // 气缸推杆
  cylinderRod: new THREE.CylinderGeometry(0.035, 0.035, 0.8, 16),
  cylinderRodShort: new THREE.CylinderGeometry(0.035, 0.035, 0.75, 16),
  
  // 气缸推板 (优化比例)
  cylinderPushPlate: new THREE.BoxGeometry(0.2, 0.04, 0.18),
  
  // 节流阀/接头主体
  valveBody: new THREE.BoxGeometry(0.04, 0.04, 0.04),
  // 节流阀调节头
  valveCap: new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8),
  // 气管头
  tubeConnector: new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8),
  
  // 气口 (保持原有或调整)
  cylinderPort: new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8),
  
  // 磁性开关 - 小盒子
  magneticSwitch: new THREE.BoxGeometry(0.08, 0.05, 0.05),
  
  // LED指示灯
  led: new THREE.SphereGeometry(0.012, 8, 8),
  
  // 传感器 - 光电传感器盒子
  sensor: new THREE.BoxGeometry(0.04, 0.06, 0.08),
  
  // 传感器支架
  sensorBracket: new THREE.BoxGeometry(0.02, 0.15, 0.02),
  
  // 传感器类型标签
  sensorLabel: new THREE.BoxGeometry(0.015, 0.015, 0.02),
  
  // 物料
  material: new THREE.BoxGeometry(0.15, 0.12, 0.15),
  
  // 传送带框架
  rail: new THREE.BoxGeometry(3.58, 0.08, 0.08),
  sideRail: new THREE.BoxGeometry(0.08, 0.08, 0.78),
  
  // 支撑腿
  leg: new THREE.BoxGeometry(0.08, 1.0, 0.08),
  
  // 物料台
  tableTop: new THREE.BoxGeometry(0.3, 0.05, 0.3),
  tableLeg: new THREE.BoxGeometry(0.02, 1.0, 0.02),
};