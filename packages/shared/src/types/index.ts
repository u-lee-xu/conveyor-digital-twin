/**
 * 共享类型定义
 * 包含 conveyor-sorting 和 coal-sorting 两个应用共用的类型
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
// 场景组件通用类型
// ============================================

/**
 * 3D场景组件通用属性
 */
export interface SceneComponentProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}
