/**
 * ================================================
 * 文件名: geometries.ts
 * 功能: 数字孪生传送带分拣系统 - 3D几何体定义
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: three.js 库
 * - 被依赖: ConveyorBelt.tsx, Cylinder.tsx, Sensor.tsx, Material.tsx, MaterialTable.tsx
 * - 提供: 所有3D组件的共享几何体对象
 * 
 * 【功能说明】
 * 本文件定义了场景中所有3D对象的几何体（Geometry），
 * 所有几何体都设计为单例共享使用，避免重复创建，提升性能。
 * 所有尺寸单位均为Three.js坐标系单位。
 */

import * as THREE from 'three';
import { COMPONENT } from '../../../scenes/conveyor-sorting/constants';

const C = COMPONENT;

/**
 * 共享几何体集合
 * 所有组件复用这些几何体对象，提升渲染性能
 * 注意：所有几何体都是单例，请勿直接修改，如需修改请克隆后使用
 */
export const geometries = {
  // ============================================
  // 传送带相关几何体
  // ============================================
  
  /**
   * 传送带滚筒
   * 参数：半径上, 半径下, 高度, 分段数
   */
  roller: new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16),
  
  /**
   * 传送带框架 - 长轨
   */
  rail: new THREE.BoxGeometry(3.58, 0.08, 0.08),
  
  /**
   * 传送带框架 - 侧轨（短边）
   */
  sideRail: new THREE.BoxGeometry(0.08, 0.08, 0.78),
  
  /**
   * 传送带支撑腿
   */
  leg: new THREE.BoxGeometry(0.08, 1.0, 0.08),
  
  // ============================================
  // 气缸相关几何体
  // ============================================
  
  /**
   * 气缸端盖：比缸体每侧宽 0.01，符合紧凑型带导杆气缸的端盖比例
   */
  cylinderEndCap: new THREE.BoxGeometry(
    C.CYLINDER_BODY_HALF_XZ * 2 + 0.02, 0.07, C.CYLINDER_BODY_HALF_XZ * 2 + 0.02,
  ),

  /**
   * 气缸主体：截面与长度全部从 COMPONENT 推导，和端盖/拉杆/支架同源
   */
  cylinderBody: new THREE.BoxGeometry(
    C.CYLINDER_BODY_HALF_XZ * 2, C.CYLINDER_BODY_HALF_LEN * 2, C.CYLINDER_BODY_HALF_XZ * 2,
  ),
  
  /**
   * 气缸主体（加长版）
   */
  cylinderBodyLong: new THREE.BoxGeometry(0.18, 1.3, 0.18),
  
  /**
   * 气缸推杆（标准长度）
   */
  cylinderRod: new THREE.CylinderGeometry(0.035, 0.035, 0.7, 16),
  
  /**
   * 气缸推杆（加长版）
   */
  cylinderRodLong: new THREE.CylinderGeometry(0.035, 0.035, 1.1, 16),
  
  /**
   * 气缸推板：局部 Y 是厚度（旋转后为世界 Z），局部 Z 是高度（旋转后为世界 Y）。
   * 与 CuboidCollider 的 [X, Y, Z] 半尺寸一一对应，杜绝「看见的比碰到的宽」。
   */
  cylinderPushPlate: new THREE.BoxGeometry(
    C.CYLINDER_PUSH_PLATE_HALF[0] * 2,
    C.CYLINDER_PUSH_PLATE_HALF[2] * 2,
    C.CYLINDER_PUSH_PLATE_HALF[1] * 2,
  ),
  
  /**
   * 节流阀/接头主体
   */
  valveBody: new THREE.BoxGeometry(0.04, 0.04, 0.04),
  
  /**
   * 节流阀调节头
   */
  valveCap: new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8),
  
  /**
   * 气管接头
   */
  tubeConnector: new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8),
  
  /**
   * 气缸气口
   */
  cylinderPort: new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8),
  
  /**
   * 磁性开关外壳
   */
  magneticSwitch: new THREE.BoxGeometry(0.08, 0.05, 0.05),
  
  /**
   * LED指示灯（球形）
   */
  led: new THREE.SphereGeometry(0.012, 8, 8),
  
  // ============================================
  // 传感器相关几何体
  // ============================================
  
  /**
   * 传感器主体（光电传感器盒子）
   */
  sensor: new THREE.BoxGeometry(0.04, 0.06, 0.08),
  
  /**
   * 传感器支架
   */
  sensorBracket: new THREE.BoxGeometry(0.02, 0.15, 0.02),
  
  /**
   * 传感器类型标签（小方块）
   */
  sensorLabel: new THREE.BoxGeometry(0.015, 0.015, 0.02),
  
  // ============================================
  // 物料相关几何体
  // ============================================
  
  /**
   * 物料方块：可见尺寸严格等于 CuboidCollider 的 2×MATERIAL_HALF_SIZE。
   * 旧版 0.15×0.12×0.15 与碰撞体 0.14³ 不一致，是推板贴面穿模的诱因之一。
   */
  material: new THREE.BoxGeometry(
    C.MATERIAL_HALF_SIZE * 2, C.MATERIAL_HALF_SIZE * 2, C.MATERIAL_HALF_SIZE * 2,
  ),
  
  // ============================================
  // 物料台相关几何体
  // ============================================
  
  /**
   * 物料台桌面
   */
  tableTop: new THREE.BoxGeometry(0.3, 0.05, 0.3),
  
  /**
   * 物料台桌腿
   */
  tableLeg: new THREE.BoxGeometry(0.02, 1.0, 0.02),
};