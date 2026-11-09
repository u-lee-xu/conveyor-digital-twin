/**
 * 电磁阀类型与「PLC 线圈 → 气缸位置」语义的单一来源。
 *
 * 控制气缸实质是控制电磁阀，阀有两种接法（口径由用户 2026-11-08 锁定）：
 *  - **单电控（弹簧复位）**：一只线圈。得电 → 气缸动作（伸出 / 翻转），
 *    失电 → 阀芯弹簧复位、气缸回原位。孪生层是「电平跟随」。
 *  - **双电控（记忆型）**：每个气缸两只线圈（动作 / 缩回）。任一只出现
 *    上升沿即切换阀芯，之后两线圈都断电也保持当前位置，直到反向线圈
 *    再来一个上升沿。孪生层是「上升沿触发 + 自保持」。
 *    两只线圈同时得电属禁止状态，孪生保持原姿态并在面板给出提示。
 *
 * 参考 `packages/pneumatic-robot` 的 solenoidType / prevSolRef 实现，
 * 但把逻辑抽成**纯函数**：面板轮询只负责取电平、写 store，时序语义全部
 * 在这里，可被单测逐帧验证，也不会把上升沿判定埋进 React 生命周期。
 *
 * 本文件是纯常量 + 纯函数，不依赖 React、状态容器或 PLC 通讯服务，
 * Node 源码自检与运行时断言都可直接引用。
 */
import type { DispensingVarName } from './constants';

export type SolenoidType = 'single' | 'double';

/**
 * 默认单电控：自动配药虚拟 PLC 参考程序（mock-dispensing-server.js）按
 * 「动作线圈 ON 伸出 / OFF 缩回」编写，既有 PLC 程序与教学材料都是这一口径。
 * 切到双电控需要 PLC 程序额外输出缩回脉冲，否则气缸不会回位。
 */
export const SOLENOID_DEFAULT: SolenoidType = 'single';

export const SOLENOID_TYPES: readonly SolenoidType[] = ['single', 'double'];

/** 面板 aria-label 也保持无括号文案；括号内解释只留在「使用说明」文档里 */
export const SOLENOID_TYPE_LABELS: Record<SolenoidType, string> = {
  single: '单电控弹簧复位',
  double: '双电控断电保持',
};

export interface SolenoidAxis {
  /** 模型里的气缸标识：A~D 送药缸、TILT 翻转缸 */
  key: 'A' | 'B' | 'C' | 'D' | 'TILT';
  label: string;
  /** 动作线圈：单电控下电平直接驱动；双电控下是「伸出 / 翻转」线圈 */
  action: DispensingVarName;
  /** 缩回 / 回位线圈：仅双电控使用，单电控下不参与 */
  retract: DispensingVarName;
}

/**
 * 五个气缸的双线圈配对。动作线圈沿用既有 C32~C36 / Y2~Y6 / M30.2~M30.6，
 * 缩回线圈是新增的 C41~C45 / Y12~Y16 / M31.2~M31.6；既有地址一个都不改。
 */
export const SOLENOID_AXES: readonly SolenoidAxis[] = [
  { key: 'A', label: 'A 送药缸', action: 'CYL_SEND_A', retract: 'CYL_SEND_A_RETRACT' },
  { key: 'B', label: 'B 送药缸', action: 'CYL_SEND_B', retract: 'CYL_SEND_B_RETRACT' },
  { key: 'C', label: 'C 送药缸', action: 'CYL_SEND_C', retract: 'CYL_SEND_C_RETRACT' },
  { key: 'D', label: 'D 送药缸', action: 'CYL_SEND_D', retract: 'CYL_SEND_D_RETRACT' },
  { key: 'TILT', label: '翻转缸', action: 'CYL_TILT', retract: 'CYL_TILT_RETRACT' },
] as const;

/** 10 只电磁阀线圈变量名：5 只动作 + 5 只缩回 */
export const SOLENOID_VAR_NAMES: readonly DispensingVarName[] =
  SOLENOID_AXES.flatMap((a) => [a.action, a.retract]);

/** 只在双电控下使用的 5 只缩回 / 回位线圈 */
export const SOLENOID_RETRACT_VARS: readonly DispensingVarName[] =
  SOLENOID_AXES.map((a) => a.retract);

export type CoilLevels = Record<string, boolean>;
/** 气缸目标姿态：true = 伸出 / 翻转位，false = 缩回 / 盛药位 */
export type CylinderLevels = Record<string, boolean>;

/** 从 store 当前姿态读出上一轮位置，切换模式 / 重连时继承真实位置不跳变 */
export function readCylinderLevels(
  sendCyl: Record<'A' | 'B' | 'C' | 'D', { extended: boolean }>,
  tiltCyl: { tilted: boolean },
): CylinderLevels {
  return {
    A: sendCyl.A.extended,
    B: sendCyl.B.extended,
    C: sendCyl.C.extended,
    D: sendCyl.D.extended,
    TILT: tiltCyl.tilted,
  };
}

/**
 * 只保留 10 只电磁阀线圈电平，作为下一轮上升沿检测的基准。
 * 每轮都存（不区分单 / 双电控），这样从单电控切到双电控时 prev 是
 * 真实线圈电平，不会把切换前就为 ON 的线圈误判成一次新的上升沿。
 */
export function snapshotSolenoidCoils(coils: CoilLevels): CoilLevels {
  const out: CoilLevels = {};
  SOLENOID_VAR_NAMES.forEach((name) => { out[name] = !!coils[name]; });
  return out;
}

/** 双电控禁止状态：同一气缸两只线圈同时得电（面板给出告警，孪生不切换阀芯） */
export function solenoidConflicts(coils: CoilLevels): string[] {
  return SOLENOID_AXES
    .filter((a) => !!coils[a.action] && !!coils[a.retract])
    .map((a) => a.key);
}

/**
 * 一次 PLC 回读 → 五个气缸的目标姿态。
 *
 * @param type       当前电磁阀类型（单 / 双电控）
 * @param prevCoils  上一轮线圈电平（上升沿检测基准）
 * @param coils      本轮 readVars 回读的线圈电平
 * @param prevLevels 当前模型姿态（双电控无新沿时原样保持）
 *
 * 单电控：每轮用动作线圈电平覆盖姿态，缩回线圈完全不参与；
 *         线圈由 ON→OFF 时下一轮立刻回原位（弹簧复位）。
 * 双电控：只在动作 / 缩回线圈出现上升沿时切换一次；
 *         两线圈都断电（脉冲结束）时 `extendEdge === retractEdge === false`，
 *         直接返回上一姿态，实现「断电保持」。
 *         两只线圈同时得电（含先后分两帧变 ON 的禁止状态）一律保持原姿态，
 *         不允许第二个上升沿把阀芯切走。
 */
export function resolveCylinderLevels(
  type: SolenoidType,
  prevCoils: CoilLevels,
  coils: CoilLevels,
  prevLevels: CylinderLevels,
): CylinderLevels {
  const next: CylinderLevels = { ...prevLevels };
  SOLENOID_AXES.forEach((axis) => {
    if (type === 'single') {
      next[axis.key] = !!coils[axis.action];
      return;
    }
    // 禁止状态优先：真实双电控阀两线圈不得同时通电。PLC 分两帧把两路线圈
    // 打开时，第二个上升沿也不能切阀芯，否则「同时得电保持原姿态」会失效。
    if (coils[axis.action] && coils[axis.retract]) return;
    const extendEdge = !!coils[axis.action] && !prevCoils[axis.action];
    const retractEdge = !!coils[axis.retract] && !prevCoils[axis.retract];
    if (extendEdge === retractEdge) return; // 无沿 / 禁止状态：断电保持
    next[axis.key] = extendEdge;
  });
  return next;
}
