import type { MagazineId } from './constants';
import type { getPhysicsStats, getPillTrace } from './physicsGeometry';
import { useDispensingStore } from '../../stores/useDispensingStore';
import { useAppStore } from '../../stores/useAppStore';

/**
 * 开发期只读诊断入口（CDP 自检用；不参与任何业务逻辑）。
 * 独立成模块是为了让「主控 PhysicsWorld」与「不挂 Rapier 的观众场景」
 * 共用同一份字段，同时不违反 react-refresh/only-export-components。
 */
export type DiagnosticsWindow = Window & {
  __dtPhysics?: () => ReturnType<typeof getPhysicsStats>;
  __dtPillTrace?: () => ReturnType<typeof getPillTrace>;
  __dtDispensing?: () => {
    pendingPills: number; hopperPills: number; sliderX: number; autoPhase: string;
    /** 运行模式与电机电平：CDP 验证「仿真模式不跑本地状态机、只认 PLC 输出」用 */
    mode: string; motorFwd: boolean; motorRev: boolean; selectorAuto: boolean;
    magStock: Record<MagazineId, number>;
    sendCyl: Record<MagazineId, { extended: boolean; position: number }>;
    /** 翻转缸姿态与电磁阀接线选型：单 / 双电控 CDP 验收的模型侧真值 */
    tiltCyl: { tilted: boolean; angle: number };
    solenoidType: string;
    dispensed: Record<MagazineId, boolean>;
  };
};

/** 安装 store 只读快照；两个运行角色读到完全相同的形状。 */
export function installDispensingDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const w = window as DiagnosticsWindow;
  w.__dtDispensing = () => {
    const s = useDispensingStore.getState();
    return {
      pendingPills: s.pendingPills.length,
      hopperPills: s.hopperPills,
      sliderX: s.sliderX,
      autoPhase: s.autoPhase,
      mode: useAppStore.getState().mode,
      motorFwd: s.motorFwd,
      motorRev: s.motorRev,
      selectorAuto: s.selectorAuto,
      magStock: { ...s.magStock },
      sendCyl: { ...s.sendCyl },
      tiltCyl: { ...s.tiltCyl },
      solenoidType: s.solenoidType,
      dispensed: { ...s.dispensed },
    };
  };
}
