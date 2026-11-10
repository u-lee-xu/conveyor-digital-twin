import { create } from 'zustand';
import { VIEW_PRESETS, PART_STAGES, type MitsubishiProfile } from '../scenes/auto-dispensing/constants';

export type AppMode = 'manual' | 'auto' | 'sim' | 'scoring';

/**
 * 视图状态的初始值仍来自 URL（?view= / ?stage= / ?part=），方便分享链接；
 * 之后的运行时切换一律走本 store，Canvas 内的 CameraRig 订阅它做平滑过渡。
 */
function initialViewState() {
  if (typeof window === 'undefined') {
    return { view: 'overview', stage: null as string | null, part: null as string | null, mirrored: false };
  }
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  const s = q.get('stage');
  return {
    view: v && VIEW_PRESETS[v] ? v : 'overview',
    stage: s && PART_STAGES[s] ? s : null,
    part: q.get('part'),
    mirrored: q.get('mirror') === '1',
  };
}

/** 把当前机位/布局写回地址栏：刷新/分享能复现，且不会堆叠 history */
function syncUrl(view: string, stage: string | null, mirrored: boolean) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.delete('part');
  if (view === 'overview') u.searchParams.delete('view');
  else u.searchParams.set('view', view);
  if (stage) u.searchParams.set('stage', stage);
  else u.searchParams.delete('stage');
  if (mirrored) u.searchParams.set('mirror', '1');
  else u.searchParams.delete('mirror');
  // 保留平台壳写在 history.state 里的角色/设备（返回按钮依赖它），不能传 null
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}

const initial = initialViewState();

interface AppStoreState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  /** 三菱连接目标：仿真档沿用 X/Y，实体 FX3U/FX5U 档改用 M 区；不持久化，刷新回默认仿真档 */
  mitsubishiProfile: MitsubishiProfile;
  setMitsubishiProfile: (profile: MitsubishiProfile) => void;
  /** 仿真模式 - 运行状态 */
  simRunning: boolean;
  simEStop: boolean;
  setSimRunning: (running: boolean) => void;
  setSimEStop: (estop: boolean) => void;
  /** 三维场景部件标签显隐 */
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  /** 当前整机机位（VIEW_PRESETS 的 key） */
  activeView: string;
  /** 当前部件展台（PART_STAGES 的 key），null = 整机 */
  activeStage: string | null;
  /** 旧的 ?part= 调试预览，运行时切换机位后自动清除 */
  activePart: string | null;
  /** 独立 App 左侧操作面板收起状态 */
  panelCollapsed: boolean;
  /** 整机沿 YZ 中轴面左右镜像：起点落到右手侧 */
  mirrored: boolean;
  setView: (name: string) => void;
  setStage: (name: string | null) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  setMirrored: (mirrored: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  mode: 'manual',
  setMode: (mode) => set({ mode }),
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
  mitsubishiProfile: 'simulator',
  setMitsubishiProfile: (mitsubishiProfile) => set({ mitsubishiProfile }),
  simRunning: false,
  simEStop: false,
  setSimRunning: (simRunning) => set({ simRunning }),
  setSimEStop: (simEStop) => set({ simEStop }),
  showLabels: true,
  setShowLabels: (showLabels) => set({ showLabels }),

  activeView: initial.view,
  activeStage: initial.stage,
  activePart: initial.part,
  panelCollapsed: false,
  mirrored: initial.mirrored,

  setView: (name) => {
    const view = VIEW_PRESETS[name] ? name : 'overview';
    set({ activeView: view, activeStage: null, activePart: null });
    syncUrl(view, null, get().mirrored);
  },
  setStage: (name) => {
    const stage = name && PART_STAGES[name] ? name : null;
    set({ activeStage: stage, activePart: null });
    syncUrl(get().activeView, stage, get().mirrored);
  },
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
  setMirrored: (mirrored) => {
    set({ mirrored, activeStage: null });
    syncUrl(get().activeView, null, mirrored);
  },
}));

/**
 * 三菱档位的唯一 store-read 入口。
 * 地址浮框 / 帮助页是被多处消费的无参纯函数（且自检会扫描调用点字符串），
 * 由它们在函数体内读档，避免给所有调用点加参数、也避免层层透传。
 */
export const currentMitsubishiProfile = (): MitsubishiProfile =>
  useAppStore.getState().mitsubishiProfile ?? 'simulator';
