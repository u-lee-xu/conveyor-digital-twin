import type { ComponentType } from 'react';
import type { Mode, ProtocolType, HelpContent } from '@digital-twin/shared';

/**
 * 统一模式框架中的单个模式定义。
 * 设备声明自己实现哪些模式，未声明的模式在 UI 中不显示。
 */
export interface PlatformModeDef {
  id: Mode;
  label: string;
  icon: string;
  color: string;
  /** 该模式下的操作面板（设备包内自包含，自行调用设备 hooks/store） */
  panel: ComponentType<{ isMobile?: boolean }>;
  /** 该模式是否需要连接 PLC（如评分/仿真） */
  needsConnection?: boolean;
}

export interface PlatformModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

/**
 * 设备插件注册表条目。
 * 设备包通过注册表向平台声明自己的差异点，平台壳不感知任何设备内部实现。
 */
export interface DeviceDefinition {
  id: string;
  name: string;
  icon: string;
  /** 设备主题渐变（Tailwind gradient classes，用于标题卡与启动页卡片） */
  gradient: string;
  version: string;
  description: string;
  /** 该设备支持的 PLC 协议 */
  protocols: ProtocolType[];
  /** 帮助面板内容（设备注入，平台壳提供统一 ❓ 入口） */
  helpContent?: HelpContent;
  /** 统一模式框架：设备声明自己实现的模式 */
  modes: PlatformModeDef[];
  /** 3D 场景内容（设备包内的 SceneContent） */
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
  /**
   * 自定义场景容器（如设备场景自带 Physics/Canvas，无法放进平台默认 PhysicsScene）。
   * 缺省使用平台 PhysicsScene。
   */
  SceneWrapper?: ComponentType<{ SceneContent: ComponentType; cameraPosition?: [number, number, number] }>;
  /** 侧边栏常驻扩展（如视角控制） */
  sidebarExtras?: ComponentType;
  /** 常驻副作用（如评分监听 gate、调试钩子），工作区内始终挂载 */
  effects?: ComponentType;
  /** 设备模式读写入口（设备自己的 store 适配层） */
  useModeState: () => PlatformModeState;
  /** 模式切换时设备侧清理（停止评分、断开连接等） */
  onModeChange?: (mode: Mode) => void;
  /** 工作区退出时的设备侧清理（断开连接等） */
  onCleanup?: () => void;
  /**
   * 观众只读镜像：把广播快照（PLC 变量名→布尔）应用到设备自己的 store，驱动 3D 场景。
   * 观众端/边缘广播服务不感知设备内部实现，由设备包自包含。
   */
  applyBroadcast?: (vars: Record<string, boolean>) => void;
}
