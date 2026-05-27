/**
 * ================================================
 * 文件名: device.ts
 * 功能: 数字孪生传送带分拣系统 - 设备相关类型定义
 * ================================================
 * 
 * 【文件关联关系】
 * - 被依赖: useDeviceStore.ts, App.tsx, 多个组件文件
 * - 提供类型: 所有设备状态、模式、实体名称等基础类型
 * 
 * 【功能说明】
 * 本文件定义了整个数字孪生系统中所有设备相关的TypeScript类型，
 * 包括运行模式、气缸、传感器、物料等核心实体的类型声明。
 */

// ============================================
// 运行模式类型定义
// ============================================

/**
 * 系统运行模式
 * - manual: 手动模式 - 用户直接控制设备
 * - auto: 演示模式 - 自动运行分拣流程
 * - scoring: 评分模式 - 用于测试和评分PLC程序
 * - sim: 仿真模式 - 与真实PLC进行闭环控制
 */
export type Mode = 'manual' | 'auto' | 'scoring' | 'sim';

// ============================================
// 气缸相关类型定义
// ============================================

/**
 * 单个气缸的状态
 */
export interface CylinderState {
  extended: boolean;  // 气缸是否伸出
}

/**
 * 气缸名称枚举
 * - feed: 上料气缸 - 将物料从物料台推到传送带上
 * - sorting1: 分拣气缸1 - 用于分拣第一种物料
 * - sorting2: 分拣气缸2 - 用于分拣第二种物料
 */
export type CylinderName = 'feed' | 'sorting1' | 'sorting2';

/**
 * 所有气缸的状态集合
 */
export interface CylindersState {
  feed: CylinderState;
  sorting1: CylinderState;
  sorting2: CylinderState;
}

// ============================================
// 传感器相关类型定义
// ============================================

/**
 * 传感器名称枚举
 * - feed: 上料传感器 - 检测物料台上是否有物料
 * - color: 色标传感器 - 检测物料颜色（仅对黑色物料触发）
 * - material: 物料传感器 - 检测传送带上的物料
 */
export type SensorName = 'feed' | 'color' | 'material';

/**
 * 所有传感器的状态集合
 */
export interface SensorsState {
  feed: boolean;      // 上料传感器是否检测到物料
  color: boolean;     // 色标传感器是否检测到黑色物料
  material: boolean;  // 物料传感器是否检测到物料
}

// ============================================
// 物料相关类型定义
// ============================================

/**
 * 物料颜色类型
 * - blue: 蓝色物料
 * - black: 黑色物料（色标传感器可检测）
 */
export type MaterialColor = 'blue' | 'black';

/**
 * 物料状态
 */
export interface MaterialState {
  visible: boolean;                    // 物料是否可见（存在）
  color: MaterialColor;                // 物料颜色
  position: [number, number, number];  // 物料在3D场景中的位置 [x, y, z]
  onConveyor: boolean;                 // 物料是否在传送带上
  conveyorDelay: number;               // 传送带延迟（用于时序控制）
}

// ============================================
// 综合状态类型定义
// ============================================

/**
 * 完整设备状态接口
 * 包含所有设备的当前状态信息
 */
export interface DeviceState {
  mode: Mode;                   // 当前运行模式
  conveyorRunning: boolean;     // 传送带是否在运行
  cylinders: CylindersState;    // 所有气缸状态
  sensors: SensorsState;        // 所有传感器状态
  material: MaterialState;      // 物料状态
}

/**
 * 设备操作接口
 * 定义了所有可以对设备进行的操作
 */
export interface DeviceActions {
  setMode: (mode: Mode) => void;                                       // 设置运行模式
  toggleConveyor: () => void;                                          // 切换传送带运行状态
  startConveyor: () => void;                                           // 启动传送带
  stopConveyor: () => void;                                            // 停止传送带
  extendCylinder: (name: CylinderName) => void;                        // 伸出指定气缸
  retractCylinder: (name: CylinderName) => void;                       // 缩回指定气缸
  updateCylinderExtension: (name: CylinderName, extension: number) => void;  // 更新气缸伸出位置
  setSensor: (name: SensorName, active: boolean) => void;              // 设置传感器状态
  updateMaterialPosition: (position: [number, number, number]) => void;  // 更新物料位置
  setMaterialOnConveyor: (onConveyor: boolean) => void;                // 设置物料是否在传送带上
  setMaterialConveyorDelay: (delay: number) => void;                   // 设置传送带延迟
  spawnMaterial: () => void;                                           // 生成新物料
  clearMaterial: () => void;                                           // 清除物料
  reset: () => void;                                                   // 重置所有状态
  showLabels: boolean;                                                 // 是否显示标签
  toggleLabels: () => void;                                            // 切换标签显示状态
}
