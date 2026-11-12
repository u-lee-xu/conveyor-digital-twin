/**
 * 视图层状态（机位 / 部件展台）单独成 store，不污染设备真值：
 * useLiquidStore 描述四罐体积与工艺，被快照与观众镜像读取；
 * 机位只是观察方式，切换不触发任何设备状态变更。
 * URL 只在初始化时解析一次（?view= / ?stage=），之后运行时切换走本 store。
 */
import { create } from 'zustand';
import {
  isLiquidPartStage, isLiquidViewKey,
  type LiquidViewKey, type LiquidPartKind,
} from '../constants/liquidConstants';

function initialState() {
  if (typeof window === 'undefined') {
    return { view: 'overview' as LiquidViewKey, stage: null as LiquidPartKind | null };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    view: isLiquidViewKey(q.get('view')) ? q.get('view') as LiquidViewKey : 'overview' as LiquidViewKey,
    stage: isLiquidPartStage(q.get('stage')) ? q.get('stage') as LiquidPartKind : null as LiquidPartKind | null,
  };
}

/** 写回地址栏：刷新或分享能复现，且不堆叠 history */
function syncUrl(view: LiquidViewKey, stage: LiquidPartKind | null) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (view === 'overview') u.searchParams.delete('view');
  else u.searchParams.set('view', view);
  if (stage) u.searchParams.set('stage', stage);
  else u.searchParams.delete('stage');
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

const initial = initialState();

interface LiquidViewState {
  activeView: LiquidViewKey;
  activeStage: LiquidPartKind | null;
  setView: (view: string) => void;
  setStage: (stage: string | null) => void;
}

export const useLiquidViewStore = create<LiquidViewState>((set, get) => ({
  activeView: initial.view,
  activeStage: initial.stage,
  setView: (view) => {
    const next = isLiquidViewKey(view) ? view : 'overview';
    set({ activeView: next, activeStage: null });
    syncUrl(next, null);
  },
  setStage: (stage) => {
    const next = isLiquidPartStage(stage) ? stage : null;
    set({ activeStage: next });
    syncUrl(get().activeView, next);
  },
}));
