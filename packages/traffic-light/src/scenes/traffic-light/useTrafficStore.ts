import { create } from 'zustand';
import { TIMING_DEFAULTS, type DirectionTiming, type TimingParams } from './constants';

/** 灯标识：方向_颜色 */
export type LampKey = 'ew_green' | 'ew_yellow' | 'ew_red' | 'ns_green' | 'ns_yellow' | 'ns_red';

export const LAMP_KEYS: LampKey[] = ['ew_green', 'ew_yellow', 'ew_red', 'ns_green', 'ns_yellow', 'ns_red'];

/** 按钮标识 */
export type ButtonKey = 'start' | 'stop' | 'estop';

/** 评分项状态 */
export type ScoringItemStatus = 'pending' | 'passed' | 'failed' | 'skipped';

/** 评分日志条目 */
export interface ScoringLogEntry {
  id: string;
  itemId: string;
  label: string;
  status: ScoringItemStatus;
  points: number;
  time: number;
}

const TIMING_STORAGE_KEY = 'traffic-light-timing-params';

function loadDir(v: Partial<DirectionTiming> | undefined, d: DirectionTiming): DirectionTiming {
  const num = (x: number | undefined, dv: number) =>
    typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 60 ? x : dv;
  const src: Partial<DirectionTiming> = v ?? {};
  return {
    greenSteady: num(src.greenSteady, d.greenSteady),
    greenFlash: num(src.greenFlash, d.greenFlash),
    yellow: num(src.yellow, d.yellow),
  };
}

function loadTimingParams(): TimingParams {
  try {
    const raw = localStorage.getItem(TIMING_STORAGE_KEY);
    if (!raw) return { ew: { ...TIMING_DEFAULTS.ew }, ns: { ...TIMING_DEFAULTS.ns } };
    const parsed = JSON.parse(raw) as Partial<TimingParams>;
    if ('ew' in parsed && 'ns' in parsed) {
      return {
        ew: loadDir(parsed.ew, TIMING_DEFAULTS.ew),
        ns: loadDir(parsed.ns, TIMING_DEFAULTS.ns),
      };
    }
    // 旧格式兼容：单套 {gs,gf,y,red} → 两方向相同（red 不再使用，由对方派生）
    const old = parsed as unknown as { greenSteady?: number; greenFlash?: number; yellow?: number };
    const d = loadDir(
      { greenSteady: old.greenSteady, greenFlash: old.greenFlash, yellow: old.yellow },
      TIMING_DEFAULTS.ew,
    );
    return { ew: { ...d }, ns: { ...d } };
  } catch {
    return { ew: { ...TIMING_DEFAULTS.ew }, ns: { ...TIMING_DEFAULTS.ns } };
  }
}

function emptyLamps(): Record<LampKey, boolean> {
  return { ew_green: false, ew_yellow: false, ew_red: false, ns_green: false, ns_yellow: false, ns_red: false };
}

interface TrafficStoreState {
  /** 6 路灯状态 */
  lamps: Record<LampKey, boolean>;
  /** 按钮按下状态（UI 显示） */
  buttons: Record<ButtonKey, boolean>;
  /** 教师可调时序参数 */
  timing: TimingParams;

  setLamp: (key: LampKey, on: boolean) => void;
  setLamps: (partial: Partial<Record<LampKey, boolean>>) => void;
  setButton: (key: ButtonKey, pressed: boolean) => void;
  setTiming: (partial: { ew?: Partial<DirectionTiming>; ns?: Partial<DirectionTiming> }) => void;
  resetTiming: () => void;
  /** 全部熄灭（停止/急停后状态） */
  allLampsOff: () => void;
  resetAll: () => void;

  /** 评分状态 */
  score: number;
  scoringStatus: Record<string, ScoringItemStatus>;
  scoringLog: ScoringLogEntry[];
  passedItems: { id: string; message: string; points: number; time: number }[];
  isScoringRunning: boolean;
  scoringComplete: boolean;
  scoringPrompt: string;
  markScoringItem: (itemId: string, status: ScoringItemStatus, label: string, points: number) => void;
  markItemsSkipped: (items: { itemId: string; label: string; points: number }[]) => void;
  resetScore: () => void;
  setScoringRunning: (running: boolean) => void;
  setScoringComplete: (complete: boolean) => void;
  setScoringPrompt: (prompt: string) => void;
}

export const useTrafficStore = create<TrafficStoreState>((set) => ({
  lamps: emptyLamps(),
  buttons: { start: false, stop: false, estop: false },
  timing: loadTimingParams(),

  setLamp: (key, on) => set((s) => ({ lamps: { ...s.lamps, [key]: on } })),
  setLamps: (partial) => set((s) => ({ lamps: { ...s.lamps, ...partial } })),
  setButton: (key, pressed) => set((s) => ({ buttons: { ...s.buttons, [key]: pressed } })),
  setTiming: (partial) => set((s) => {
    const timing: TimingParams = {
      ew: partial.ew ? { ...s.timing.ew, ...partial.ew } : s.timing.ew,
      ns: partial.ns ? { ...s.timing.ns, ...partial.ns } : s.timing.ns,
    };
    try { localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(timing)); } catch { /* 忽略存储失败 */ }
    return { timing };
  }),
  resetTiming: () => set(() => {
    try { localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(TIMING_DEFAULTS)); } catch { /* 忽略 */ }
    return { timing: { ew: { ...TIMING_DEFAULTS.ew }, ns: { ...TIMING_DEFAULTS.ns } } };
  }),
  allLampsOff: () => set({ lamps: emptyLamps() }),
  resetAll: () => set({ lamps: emptyLamps(), buttons: { start: false, stop: false, estop: false } }),

  score: 0,
  scoringStatus: {} as Record<string, ScoringItemStatus>,
  scoringLog: [],
  passedItems: [],
  isScoringRunning: false,
  scoringComplete: false,
  scoringPrompt: '',

  markScoringItem: (itemId, status, label, points) => set((s) => {
    const currentStatus = s.scoringStatus[itemId];
    if (currentStatus && currentStatus !== 'pending') return s;

    const logId = Math.random().toString(36).substr(2, 9);
    const now = Date.now();

    const newLogEntry: ScoringLogEntry = {
      id: logId,
      itemId,
      label,
      status,
      points: status === 'passed' ? points : 0,
      time: now,
    };

    const newPassedItem = status === 'passed'
      ? [{ id: logId, message: label, points, time: now }]
      : [];

    return {
      scoringStatus: { ...s.scoringStatus, [itemId]: status },
      scoringLog: [...s.scoringLog, newLogEntry],
      passedItems: [...s.passedItems, ...newPassedItem],
      score: status === 'passed' ? Math.min(100, s.score + points) : s.score,
    };
  }),

  markItemsSkipped: (items) => set((s) => {
    const newStatus = { ...s.scoringStatus };
    const newLog: ScoringLogEntry[] = [];
    const now = Date.now();

    for (const item of items) {
      const currentStatus = newStatus[item.itemId];
      if (currentStatus && currentStatus !== 'pending') continue;

      newStatus[item.itemId] = 'skipped';
      newLog.push({
        id: Math.random().toString(36).substr(2, 9),
        itemId: item.itemId,
        label: item.label,
        status: 'skipped',
        points: 0,
        time: now,
      });
    }

    return {
      scoringStatus: newStatus,
      scoringLog: [...s.scoringLog, ...newLog],
    };
  }),

  resetScore: () => set({
    score: 0,
    scoringStatus: {},
    scoringLog: [],
    passedItems: [],
    scoringComplete: false,
    scoringPrompt: '',
  }),

  setScoringRunning: (running) => set({ isScoringRunning: running, scoringComplete: false }),
  setScoringComplete: (complete) => set({ scoringComplete: complete }),
  setScoringPrompt: (prompt) => set({ scoringPrompt: prompt }),
}));
