import { create } from 'zustand';

/** 气缸名称 */
export type CylinderName = 'lift' | 'forward' | 'clamp';

/** 单个气缸状态 */
export interface CylinderState {
  /** 伸出/缩回 */
  extended: boolean;
  /** 当前位置（0=缩回, 1=伸出，平滑过渡） */
  position: number;
  /** 前端磁性开关 */
  magFront: boolean;
  /** 后端磁性开关 */
  magRear: boolean;
}

/** 指示灯名称 */
export type IndicatorName = 'running' | 'home' | 'processing' | 'alarm';

/** 工件状态 */
export interface WorkpieceState {
  exists: boolean;                  // 是否存在于场景中
  held: boolean;
  pos: [number, number, number];    // 世界坐标（未持有时）
  offsetY: number;                  // 持有时的Y偏移(相对于夹爪中心)
  velY: number;                     // 下落速度
}

interface RobotStoreState {
  /** 三气缸状态 */
  cylinders: Record<CylinderName, CylinderState>;
  /** 指示灯 */
  indicators: Record<IndicatorName, boolean>;
  /** 物料工件 */
  workpiece: WorkpieceState;

  /** 气缸动作 */
  setCylinder: (name: CylinderName, extended: boolean) => void;
  /** 更新气缸位置（动画用） */
  setCylinderPosition: (name: CylinderName, position: number) => void;
  /** 更新磁性开关 */
  setMagSensor: (name: CylinderName, front: boolean, rear: boolean) => void;
  /** 设置指示灯 */
  setIndicator: (name: IndicatorName, active: boolean) => void;
  /** 拾取工件（记录夹爪中心偏移） */
  pickUpWorkpiece: (offsetY: number) => void;
  /** 释放工件（记录当前完整世界坐标[X,Y,Z]） */
  releaseWorkpiece: (worldPos: [number, number, number]) => void;
  /** 重力更新工件位置 */
  updateWorkpiece: (delta: number) => void;
  /** 在初始位置生成一个新工件 */
  spawnWorkpiece: () => void;
  /** 清除场上所有工件 */
  cleanUpWorkpiece: () => void;
  /** 复位所有气缸 */
  resetAll: () => void;
}

function defaultCylinder(): CylinderState {
  return { extended: false, position: 0, magFront: false, magRear: true };
}

const WORKPIECE_INITIAL: [number, number, number] = [0, 0.03, 1.02];

export const useRobotStore = create<RobotStoreState>((set) => ({
  cylinders: {
    lift: defaultCylinder(),
    forward: defaultCylinder(),
    clamp: defaultCylinder(),
  },
  indicators: {
    running: false,
    home: true,
    processing: false,
    alarm: false,
  },
  workpiece: {
    exists: true,
    held: false,
    pos: [...WORKPIECE_INITIAL] as [number, number, number],
    offsetY: 0,
    velY: 0,
  },

  setCylinder: (name, extended) => set((s) => ({
    cylinders: { ...s.cylinders, [name]: { ...s.cylinders[name], extended } },
  })),

  setCylinderPosition: (name, position) => set((s) => ({
    cylinders: { ...s.cylinders, [name]: { ...s.cylinders[name], position } },
  })),

  setMagSensor: (name, front, rear) => set((s) => ({
    cylinders: { ...s.cylinders, [name]: { ...s.cylinders[name], magFront: front, magRear: rear } },
  })),

  setIndicator: (name, active) => set((s) => ({
    indicators: { ...s.indicators, [name]: active },
  })),

  pickUpWorkpiece: (offsetY) => set((s) => ({
    workpiece: { ...s.workpiece, held: true, offsetY },
  })),

  releaseWorkpiece: (worldPos) => set((s) => ({
    workpiece: { ...s.workpiece, held: false, velY: 0, pos: worldPos, offsetY: 0 },
  })),

  spawnWorkpiece: () => set((s) => {
    if (s.workpiece.exists) return {};
    return { workpiece: { exists: true, held: false, pos: [...WORKPIECE_INITIAL] as [number, number, number], offsetY: 0, velY: 0 } };
  }),

  cleanUpWorkpiece: () => set((s) => {
    if (!s.workpiece.exists) return {};
    return { workpiece: { exists: false, held: false, pos: [...WORKPIECE_INITIAL] as [number, number, number], offsetY: 0, velY: 0 } };
  }),

  updateWorkpiece: (delta) => set((s) => {
    const wp = s.workpiece;
    if (wp.held) return {};
    const gravity = -9.81;
    const newVelY = wp.velY + gravity * delta;
    const newY = Math.max(WORKPIECE_INITIAL[1], wp.pos[1] + newVelY * delta);
    if (newY <= WORKPIECE_INITIAL[1]) {
      return { workpiece: { ...wp, pos: [wp.pos[0], WORKPIECE_INITIAL[1], wp.pos[2]], velY: 0, offsetY: 0 } };
    }
    return { workpiece: { ...wp, pos: [wp.pos[0], newY, wp.pos[2]], velY: newVelY, offsetY: 0 } };
  }),

  resetAll: () => set({
    cylinders: {
      lift: defaultCylinder(),
      forward: defaultCylinder(),
      clamp: defaultCylinder(),
    },
    indicators: { running: false, home: true, processing: false, alarm: false },
    workpiece: { exists: true, held: false, pos: [...WORKPIECE_INITIAL] as [number, number, number], offsetY: 0, velY: 0 },
  }),
}));