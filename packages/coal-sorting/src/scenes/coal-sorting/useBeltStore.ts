import { create } from 'zustand';
import { MATERIAL_SPAWN_POSITION, MAX_MATERIALS } from './constants';

export type BeltName = 'belt1' | 'belt2' | 'belt3' | 'belt4';
export type MaterialType = 'coal' | 'stone';
export type ParticleSize = 'small' | 'medium' | 'large';

export type FeedTypeOption = MaterialType | 'mixed';
export type FeedSizeOption = ParticleSize | 'mixed';

export type BeltSensorName =
  | 's1_belt1_entry' | 's2_belt1_run' | 's3_belt1_exit'
  | 's4_belt2_entry' | 's5_belt2_run' | 's6_belt2_exit'
  | 's7_belt3_entry' | 's8_belt3_run' | 's9_belt3_exit'
  | 's10_pileup';

/** 物料状态机阶段 */
export type MaterialPhase =
  | 'on_belt'        // 在皮带上，kinematic 驱动
  | 'transitioning'  // 皮带间转接，Dynamic 自由落体
  | 'sieving'        // 筛分中，Dynamic + 震动
  | 'blown'          // 气吹中，Dynamic 侧向力
  | 'in_box';        // 已入箱，待回收

export interface BeltMaterial {
  id: string;
  type: MaterialType;
  size: ParticleSize;
  visible: boolean;
  position: [number, number, number];
  onBelt: BeltName | null;
  mass: number;
  friction: number;
  /** 状态机阶段 */
  phase: MaterialPhase;
  /** 阶段进入时间（用于超时检测） */
  phaseStart: number;
}

export const PARTICLE_SIZE_MAP: Record<ParticleSize, { scale: number; mass: number; label: string }> = {
  small:  { scale: 0.6,  mass: 0.3,  label: '小颗粒' },
  medium: { scale: 1.0,  mass: 0.5,  label: '中颗粒' },
  large:  { scale: 1.5,  mass: 1.0,  label: '大颗粒' },
};

interface BeltState {
  belts: Record<BeltName, { running: boolean; speed: number; fault: boolean; load: number }>;
  sensors: Record<BeltSensorName, boolean>;
  materials: BeltMaterial[];
  feedCylinder: { extended: boolean; currentExtension: number };
  separator: { active: boolean };
  indicators: { belt1_run: boolean; belt2_run: boolean; belt3_run: boolean; belt4_run: boolean; fault: boolean };
  buzzer: boolean;
  materialCount: { coal: number; stone: number; small: number };
  autoFeed: boolean;
  autoFeedInterval: number;
  autoFeedType: FeedTypeOption;
  autoFeedSize: FeedSizeOption;
  /** 煤石比例 (0-100)，代表煤的百分比 */
  coalRatio: number;
  /** 尺寸分布权重 */
  sizeWeights: { small: number; medium: number; large: number };

  setBeltRunning: (name: BeltName, running: boolean) => void;
  setBeltSpeed: (name: BeltName, speed: number) => void;
  setBeltFault: (name: BeltName, fault: boolean) => void;
  setSensor: (name: BeltSensorName, active: boolean) => void;
  setFeedCylinder: (extended: boolean) => void;
  setSeparator: (active: boolean) => void;
  updateFeedCylinderExtension: (extension: number) => void;
  spawnMaterial: (type?: MaterialType, size?: ParticleSize) => void;
  removeMaterial: (id: string) => void;
  clearMaterials: () => void;
  updateMaterialOnBelt: (id: string, onBelt: BeltName | null) => void;
  /** 更新物料阶段 */
  setMaterialPhase: (id: string, phase: MaterialPhase) => void;
  setIndicator: (name: keyof BeltState['indicators'], active: boolean) => void;
  setBuzzer: (active: boolean) => void;
  incrementCount: (type: MaterialType | 'small') => void;
  setAutoFeed: (active: boolean) => void;
  setAutoFeedInterval: (interval: number) => void;
  setAutoFeedType: (type: FeedTypeOption) => void;
  setAutoFeedSize: (size: FeedSizeOption) => void;
  setSizeWeight: (size: ParticleSize, weight: number) => void;
  setCoalRatio: (ratio: number) => void;
  reset: () => void;
}

const initialBelts: BeltState['belts'] = {
  belt1: { running: false, speed: 0.008, fault: false, load: 0 },
  belt2: { running: false, speed: 0.008, fault: false, load: 0 },
  belt3: { running: false, speed: 0.008, fault: false, load: 0 },
  belt4: { running: false, speed: 0.008, fault: false, load: 0 },
};

const initialSensors: BeltState['sensors'] = {
  s1_belt1_entry: false, s2_belt1_run: false, s3_belt1_exit: false,
  s4_belt2_entry: false, s5_belt2_run: false, s6_belt2_exit: false,
  s7_belt3_entry: false, s8_belt3_run: false, s9_belt3_exit: false,
  s10_pileup: false,
};

const initialState = {
  belts: initialBelts,
  sensors: initialSensors,
  materials: [] as BeltMaterial[],
  feedCylinder: { extended: false, currentExtension: -0.15 },
  separator: { active: false },
  indicators: { belt1_run: false, belt2_run: false, belt3_run: false, belt4_run: false, fault: false },
  buzzer: false,
  materialCount: { coal: 0, stone: 0, small: 0 },
  autoFeed: false,
  autoFeedInterval: 2.0,
  autoFeedType: 'mixed' as FeedTypeOption,
  autoFeedSize: 'mixed' as FeedSizeOption,
  coalRatio: 70,
  sizeWeights: { small: 33, medium: 34, large: 33 },
};

let materialIdCounter = 0;

export const useBeltStore = create<BeltState>((set, get) => ({
  ...initialState,

  setBeltRunning: (name, running) =>
    set((s) => ({
      belts: { ...s.belts, [name]: { ...s.belts[name], running } },
      indicators: { ...s.indicators, [`${name}_run`]: running },
    })),

  setBeltSpeed: (name, speed) =>
    set((s) => ({
      belts: { ...s.belts, [name]: { ...s.belts[name], speed } },
    })),

  setBeltFault: (name, fault) =>
    set((s) => {
      const newBelts = { ...s.belts, [name]: { ...s.belts[name], fault, running: fault ? false : s.belts[name].running } };
      return {
        belts: newBelts,
        indicators: { ...s.indicators, fault: Object.values(newBelts).some(b => b.fault) },
        buzzer: fault ? true : Object.values(newBelts).some(b => b.fault),
      };
    }),

  setSensor: (name, active) =>
    set((s) => {
      if (s.sensors[name] === active) return s;
      return { sensors: { ...s.sensors, [name]: active } };
    }),

  setFeedCylinder: (extended) => set((s) => ({ feedCylinder: { ...s.feedCylinder, extended } })),
  setSeparator: (active) => set(() => ({ separator: { active } })),
  updateFeedCylinderExtension: (extension) => set((s) => ({ feedCylinder: { ...s.feedCylinder, currentExtension: extension } })),

  spawnMaterial: (type, size) => {
    const state = get();
    if (state.materials.length >= MAX_MATERIALS) return;

    const finalType = type || (state.autoFeedType === 'mixed'
      ? (Math.random() * 100 < state.coalRatio ? 'coal' : 'stone')
      : state.autoFeedType as MaterialType);

    let finalSize: ParticleSize;
    if (size) {
      finalSize = size;
    } else if (state.autoFeedSize !== 'mixed') {
      finalSize = state.autoFeedSize as ParticleSize;
    } else {
      const weights = state.sizeWeights;
      const total = weights.small + weights.medium + weights.large;
      const rand = Math.random() * total;
      if (rand < weights.small) finalSize = 'small';
      else if (rand < weights.small + weights.medium) finalSize = 'medium';
      else finalSize = 'large';
    }

    const id = `mat_${++materialIdCounter}`;
    const sizeProps = PARTICLE_SIZE_MAP[finalSize];
    const typeProps = finalType === 'coal' ? { friction: 0.8 } : { friction: 0.4 };

    set((s) => ({
      materials: [...s.materials, {
        id,
        type: finalType,
        size: finalSize,
        visible: true,
        position: [...MATERIAL_SPAWN_POSITION] as [number, number, number],
        onBelt: 'belt1' as BeltName,
        mass: sizeProps.mass * (finalType === 'stone' ? 2.5 : 1.0),
        ...typeProps,
        phase: 'on_belt' as MaterialPhase,
        phaseStart: Date.now(),
      }],
    }));
  },

  removeMaterial: (id) => set((s) => ({ materials: s.materials.filter(m => m.id !== id) })),
  clearMaterials: () => set({ materials: [] }),

  updateMaterialOnBelt: (id, onBelt) =>
    set((s) => {
      const m = s.materials.find(m => m.id === id);
      if (!m || m.onBelt === onBelt) return s;
      return { materials: s.materials.map(item => item.id === id ? { ...item, onBelt } : item) };
    }),

  setMaterialPhase: (id, phase) =>
    set((s) => {
      const m = s.materials.find(m => m.id === id);
      if (!m || m.phase === phase) return s;
      return { materials: s.materials.map(item => item.id === id ? { ...item, phase, phaseStart: Date.now() } : item) };
    }),

  setIndicator: (name, active) => set((s) => ({ indicators: { ...s.indicators, [name]: active } })),
  setBuzzer: (active) => set({ buzzer: active }),

  incrementCount: (type) => set((s) => ({
    materialCount: { ...s.materialCount, [type]: s.materialCount[type] + 1 }
  })),

  setAutoFeed: (active) => set({ autoFeed: active }),
  setAutoFeedInterval: (interval) => set({ autoFeedInterval: interval }),
  setAutoFeedType: (type) => set({ autoFeedType: type }),
  setAutoFeedSize: (size) => set({ autoFeedSize: size }),
  setSizeWeight: (size, weight) => set((s) => ({
    sizeWeights: { ...s.sizeWeights, [size]: weight }
  })),
  setCoalRatio: (ratio) => set({ coalRatio: ratio }),

  reset: () => {
    materialIdCounter = 0;
    set({ ...initialState, materials: [] });
  },
}));
