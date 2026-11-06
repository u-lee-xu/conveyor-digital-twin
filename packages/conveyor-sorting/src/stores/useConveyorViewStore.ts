import { create } from 'zustand';
import type { ConveyorViewKey } from '../scenes/conveyor-sorting/constants';

/**
 * 视图层状态（机位 / 面板折叠）单独成 store，不污染设备状态：
 * useDeviceStore 描述 PLC/设备真值，被评分与广播链路读取；
 * 机位只是观察方式，改机位不应触发任何设备状态变更。
 */
interface ConveyorViewState {
  activeView: ConveyorViewKey;
  panelCollapsed: boolean;
  setView: (view: ConveyorViewKey) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
}

export const useConveyorViewStore = create<ConveyorViewState>((set) => ({
  activeView: 'overview',
  panelCollapsed: false,
  setView: (activeView) => set({ activeView }),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
}));
