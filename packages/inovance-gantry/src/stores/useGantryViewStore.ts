/**
 * 视图层状态（机位 / 部件展台）单独成 store，不污染设备真值：
 * useGantryStore 描述 PLC / position 坐标，被快照与观众镜像读取；
 * 机位只是观察方式，切换不应触发任何设备状态变更。
 * URL 只在初始化时解析一次（?view= / ?stage=），之后运行时切换走本 store。
 */
import { create } from 'zustand';
import {
  isGantryPartStage, isGantryViewKey,
  type GantryViewKey, type GantryPartKind,
} from '../constants/gantryConstants';

function initialState() {
  if (typeof window === 'undefined') {
    return { view: 'overview' as GantryViewKey, stage: null as GantryPartKind | null };
  }
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  const s = q.get('stage');
  return {
    view: isGantryViewKey(v) ? v : 'overview' as GantryViewKey,
    stage: isGantryPartStage(s) ? s : null as GantryPartKind | null,
  };
}

/** 把机位 / 展台写回地址栏：刷新或分享能复现，且不堆叠 history */
function syncUrl(view: GantryViewKey, stage: GantryPartKind | null) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (view === 'overview') u.searchParams.delete('view');
  else u.searchParams.set('view', view);
  if (stage) u.searchParams.set('stage', stage);
  else u.searchParams.delete('stage');
  // 保留平台壳写在 history.state 里的角色 / 设备（返回按钮依赖它）
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

const initial = initialState();

interface GantryViewState {
  activeView: GantryViewKey;
  activeStage: GantryPartKind | null;
  setView: (view: string) => void;
  setStage: (stage: string | null) => void;
}

export const useGantryViewStore = create<GantryViewState>((set, get) => ({
  activeView: initial.view,
  activeStage: initial.stage,
  setView: (view) => {
    const next = isGantryViewKey(view) ? view : 'overview';
    // 展台有自己的专用相机，切机位时先退回整机
    set({ activeView: next, activeStage: null });
    syncUrl(next, null);
  },
  setStage: (stage) => {
    const next = isGantryPartStage(stage) ? stage : null;
    set({ activeStage: next });
    syncUrl(get().activeView, next);
  },
}));
