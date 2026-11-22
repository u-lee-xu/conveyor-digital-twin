/**
 * 视图层状态（机位 / 部件展台）单独成 store，不污染设备真值。
 * URL 只在初始化时解析一次（?view= / ?stage=），之后运行时切换走本 store。
 */
import { create } from 'zustand';
import {
  isMotorViewKey, isMotorPartStage,
  type MotorViewKey, type MotorPartKind,
} from '../constants/motorConstants';

function initialState() {
  if (typeof window === 'undefined') {
    return { view: 'overview' as MotorViewKey, stage: null as MotorPartKind | null };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    view: isMotorViewKey(q.get('view')) ? q.get('view') as MotorViewKey : 'overview' as MotorViewKey,
    stage: isMotorPartStage(q.get('stage')) ? q.get('stage') as MotorPartKind : null as MotorPartKind | null,
  };
}

function syncUrl(view: MotorViewKey, stage: MotorPartKind | null) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (view === 'overview') u.searchParams.delete('view');
  else u.searchParams.set('view', view);
  if (stage) u.searchParams.set('stage', stage);
  else u.searchParams.delete('stage');
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

const initial = initialState();

interface MotorViewState {
  activeView: MotorViewKey;
  activeStage: MotorPartKind | null;
  setView: (view: string) => void;
  setStage: (stage: string | null) => void;
}

export const useMotorViewStore = create<MotorViewState>((set, get) => ({
  activeView: initial.view,
  activeStage: initial.stage,
  setView: (view) => {
    const next = isMotorViewKey(view) ? view : 'overview';
    set({ activeView: next, activeStage: null });
    syncUrl(next, null);
  },
  setStage: (stage) => {
    const next = isMotorPartStage(stage) ? stage : null;
    set({ activeStage: next });
    syncUrl(get().activeView, next);
  },
}));
