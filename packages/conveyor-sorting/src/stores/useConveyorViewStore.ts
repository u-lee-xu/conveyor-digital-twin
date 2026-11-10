import { create } from 'zustand';
import {
  VIEW_PRESETS, isPartStage,
  type ConveyorViewKey, type PartKind,
} from '../scenes/conveyor-sorting/constants';

/**
 * 视图层状态（机位 / 部件展台 / 面板折叠）单独成 store，不污染设备状态：
 * useDeviceStore 描述 PLC/设备真值，被评分与广播链路读取；
 * 机位与展台只是观察方式，切换不应触发任何设备状态变更。
 *
 * 与自动配药 useAppStore 同款：URL 只在初始化时解析一次（?view= / ?stage=），
 * 之后的运行时切换走本 store，CameraRig 订阅它做平滑过渡，不刷新页面。
 */
function initialViewState() {
  if (typeof window === 'undefined') {
    return { view: 'overview' as ConveyorViewKey, stage: null as PartKind | null };
  }
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  const s = q.get('stage');
  return {
    view: (v && Object.prototype.hasOwnProperty.call(VIEW_PRESETS, v)
      ? v : 'overview') as ConveyorViewKey,
    stage: isPartStage(s) ? s : null,
  };
}

/** 把当前机位 / 展台写回地址栏：刷新或分享能复现，且不堆叠 history */
function syncUrl(view: ConveyorViewKey, stage: PartKind | null) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (view === 'overview') u.searchParams.delete('view');
  else u.searchParams.set('view', view);
  if (stage) u.searchParams.set('stage', stage);
  else u.searchParams.delete('stage');
  // 保留平台壳写在 history.state 里的角色 / 设备（返回按钮依赖它），不能传 null
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

const initial = initialViewState();

interface ConveyorViewState {
  activeView: ConveyorViewKey;
  /** 当前部件展台（PART_STAGES 的 key），null = 整机 */
  activeStage: PartKind | null;
  panelCollapsed: boolean;
  setView: (view: ConveyorViewKey) => void;
  setStage: (stage: string | null) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
}

export const useConveyorViewStore = create<ConveyorViewState>((set, get) => ({
  activeView: initial.view,
  activeStage: initial.stage,
  panelCollapsed: false,

  // 点任意整机机位即退出展台，与自动配药 ViewSwitcher 的交互口径一致
  setView: (activeView) => {
    set({ activeView, activeStage: null });
    syncUrl(activeView, null);
  },
  setStage: (name) => {
    const stage = isPartStage(name) ? name : null;
    set({ activeStage: stage });
    syncUrl(get().activeView, stage);
  },
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
}));
