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
import {
  COMPONENT, CYLINDER_DETAIL, SENSOR_DETAIL, SURFACE_GAP,
} from '../../../scenes/conveyor-sorting/constants';

const C = COMPONENT;
const D = CYLINDER_DETAIL;
const S = SENSOR_DETAIL;

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
  cylinderRod: new THREE.CylinderGeometry(D.ROD_R, D.ROD_R, 0.7, 16),
  
  /**
   * 气缸推杆（加长版）
   */
  cylinderRodLong: new THREE.CylinderGeometry(D.ROD_R, D.ROD_R, 1.1, 16),
  
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
   * 磁性开关：嵌在缸体侧面 T 槽里的细长条，沿缸体轴向（局部 Y）铺开
   */
  magneticSwitch: new THREE.BoxGeometry(D.MAGSWITCH_T, D.MAGSWITCH_LEN, D.MAGSWITCH_W),

  /** 磁性开关出线 */
  magneticSwitchCable: new THREE.CylinderGeometry(
    D.MAGSWITCH_CABLE_R, D.MAGSWITCH_CABLE_R, 0.06, 6,
  ),

  /**
   * LED指示灯（球形）：缩到实物尺度，不再像贴在缸体上的大按钮
   */
  led: new THREE.SphereGeometry(D.MAGSWITCH_LED_R, 8, 8),

  /** 端盖上的双导杆导向套凸台：一眼看出「带导杆」而非普通气缸 */
  guideBushing: new THREE.CylinderGeometry(
    D.GUIDE_BUSHING_R, D.GUIDE_BUSHING_R, D.GUIDE_BUSHING_LEN, 12,
  ),

  /** 推板前端的沉头螺栓 */
  plateBolt: new THREE.CylinderGeometry(D.PLATE_BOLT_R, D.PLATE_BOLT_R, 0.004, 8),

  /** 推板前端的橡胶缓冲垫 */
  plateBumper: new THREE.BoxGeometry(0.020, SURFACE_GAP, 0.020),

  /** 部件展台专用展示底座（整机不渲染） */
  standPlate: new THREE.BoxGeometry(D.STAND_W, D.STAND_T, D.STAND_D),
  standPillar: new THREE.BoxGeometry(0.05, D.STAND_PILLAR_H, 0.05),
  
  // ============================================
  // 传感器相关几何体
  // ============================================
  
  /**
   * 漫反射光电开关壳体（上料 / 物料同型号）
   */
  sensor: new THREE.BoxGeometry(S.BODY_W, S.BODY_H, S.BODY_D),

  /**
   * 色标 / 颜色传感器壳体：更厚、正面是宽矩形投受光窗
   */
  sensorColorBody: new THREE.BoxGeometry(S.COLOR_BODY_W, S.COLOR_BODY_H, S.COLOR_BODY_D),

  /** 投光 / 受光双圆透镜（CircleGeometry 默认朝 +Z） */
  sensorLens: new THREE.CircleGeometry(S.LENS_R, 16),

  /** 色标传感器宽光窗 + 可见 RGB 光斑 */
  sensorWindow: new THREE.PlaneGeometry(S.WINDOW_W, S.WINDOW_H),
  sensorSpot: new THREE.CircleGeometry(S.SPOT_R, 16),

  /** 示教键 / 双色指示条 / 顶部数值显示 */
  sensorTeach: new THREE.BoxGeometry(S.TEACH_W, S.TEACH_H, SURFACE_GAP * 2),
  sensorBar: new THREE.BoxGeometry(S.BAR_W, S.BAR_H, SURFACE_GAP * 2),
  sensorDisplay: new THREE.BoxGeometry(S.DISPLAY_W, S.DISPLAY_H, SURFACE_GAP * 2),

  /** 灵敏度旋钮 / 状态灯 / 出线接头 / 正面贴片 */
  sensorTrimmer: new THREE.CylinderGeometry(S.TRIMMER_R, S.TRIMMER_R, 0.006, 12),
  sensorStatus: new THREE.SphereGeometry(S.STATUS_R, 10, 10),
  sensorCable: new THREE.CylinderGeometry(S.CABLE_R, S.CABLE_R, S.CABLE_LEN, 8),
  sensorPanel: new THREE.BoxGeometry(S.PANEL_W, S.PANEL_H, SURFACE_GAP),
  sensorBulb: new THREE.SphereGeometry(C.SENSOR_BULB_RADIUS, 12, 12),

  /** 共用安装件：立杆、底板、类型色标 */
  sensorBracket: new THREE.BoxGeometry(S.BRACKET_W, S.BRACKET_H, S.BRACKET_W),
  sensorBase: new THREE.BoxGeometry(S.BASE_W, S.BASE_T, S.BASE_D),
  sensorLabel: new THREE.BoxGeometry(S.LABEL_W, S.LABEL_H, S.LABEL_D),
  
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