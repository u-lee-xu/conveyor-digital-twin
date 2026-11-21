/**
 * MD520 端子命令解析（纯函数，可单测）。
 *
 * 依据官方功能手册 1.1.1.3「通过端子设定运行指令」：
 *  - F0-02=1 时启用端子命令，F4-11 选择四种命令方式；
 *  - DI1~DI5 的功能由 F4-00~F4-04 决定，端子没有固定身份；
 *  - 多段指令端子 1~4（功能 12~15）组成 4 位段号，配合 F0-03=6 选段；
 *  - 两线式1 的双断 / 双合均属停机，是禁止态，不产生运行命令；
 *  - 三线式的启动端子取上升沿，停止端子（功能 3）断开立即停。
 *
 * 本文件只做「DI 状态 + 参数 → 运行方向 / 段号」的映射，不写 store、不碰 PLC。
 * 三线式需要跨帧记忆，由调用方传入/保存 TerminalLatch。
 */
import {
  MD520_DI, MD520_DI_FUNCTION as FN, MD520_COMMAND,
  MD520_DI_FUNCTION_OPTIONS,
} from './md520Spec';

/** 跨帧锁存：run 为上一帧启动端子电平，command 为上一帧有效命令 */
export interface TerminalLatch {
  run: boolean;
  command: number;
}

export const INITIAL_TERMINAL_LATCH: TerminalLatch = {
  run: false,
  command: MD520_COMMAND.STOP,
};

export interface TerminalResult {
  command: number;
  latch: TerminalLatch;
}

/** 从 F4-00~F4-04 读出每个 DI 的当前功能码 */
export function diFunctions(params: Readonly<Record<string, number>>): number[] {
  return MD520_DI.map((d) => Math.trunc(params[d.param] ?? d.defaultFunction));
}

/** 任一 DI 承担该功能且闭合 */
function anyOn(di: Readonly<Record<string, boolean>>, fns: readonly number[], fn: number): boolean {
  return MD520_DI.some((d, i) => fns[i] === fn && !!di[d.key]);
}

/**
 * 四种端子命令方式。
 *  - 0 两线式1：FWD / REV 各占一端子，双断或双合停机（禁止态）。
 *  - 1 两线式2：FWD 端子给运行命令，REV 端子给方向；电平有效。
 *  - 2 三线式1：FWD / REV 给方向与启动，功能 3 端子常闭允许；启动取上升沿。
 *  - 3 三线式2：FWD 给启动、REV 给方向，功能 3 端子常闭允许；启动取上升沿。
 * 点动（功能 4/5）优先级最高，四种方式下都有效。
 */
export function resolveTerminalCommand(
  di: Readonly<Record<string, boolean>>,
  params: Readonly<Record<string, number>>,
  latch: TerminalLatch = INITIAL_TERMINAL_LATCH,
): TerminalResult {
  const fns = diFunctions(params);
  const mode = Math.trunc(params['F4-11'] ?? 0);
  const fwd = anyOn(di, fns, FN.FWD);
  const rev = anyOn(di, fns, FN.REV);
  const fjog = anyOn(di, fns, FN.FJOG);
  const rjog = anyOn(di, fns, FN.RJOG);
  const stop = (command: number, run: boolean): TerminalResult => ({ command, latch: { run, command } });

  if (fjog && !rjog) return stop(MD520_COMMAND.FJOG, true);
  if (rjog && !fjog) return stop(MD520_COMMAND.RJOG, true);

  if (mode === 0) {
    if (fwd && !rev) return stop(MD520_COMMAND.FWD, true);
    if (rev && !fwd) return stop(MD520_COMMAND.REV, true);
    return stop(MD520_COMMAND.STOP, false);
  }

  if (mode === 2) {
    const enable = anyOn(di, fns, FN.THREE_WIRE);
    const run = fwd || rev;
    if (!enable) return stop(MD520_COMMAND.STOP, run);
    if (run && !latch.run) {
      if (fwd && !rev) return stop(MD520_COMMAND.FWD, run);
      if (rev && !fwd) return stop(MD520_COMMAND.REV, run);
      return stop(MD520_COMMAND.STOP, run);
    }
    // 无新沿：维持上一帧锁存命令，避免每帧重发
    return stop(latch.run ? latch.command : MD520_COMMAND.STOP, run);
  }

  if (mode === 1 || mode === 3) {
    const run = fwd;
    if (mode === 3) {
      const enable = anyOn(di, fns, FN.THREE_WIRE);
      if (!enable) return stop(MD520_COMMAND.STOP, run);
      if (!(run && !latch.run)) return stop(latch.run ? latch.command : MD520_COMMAND.STOP, run);
    }
    if (!run) return stop(MD520_COMMAND.STOP, false);
    return stop(rev ? MD520_COMMAND.REV : MD520_COMMAND.FWD, true);
  }

  return stop(MD520_COMMAND.STOP, false);
}

/**
 * 多段速段号：功能 12~15 的 DI 分别对应位 0~3。
 * 未配置任何多段端子时返回 0（段 0），保证默认档不误动作。
 */
export function resolveMultiSpeedIndex(
  di: Readonly<Record<string, boolean>>,
  params: Readonly<Record<string, number>>,
): number {
  const fns = diFunctions(params);
  let index = 0;
  MD520_DI.forEach((d, i) => {
    const bit = fns[i] - FN.MULTI1;
    if (bit >= 0 && bit <= 3 && di[d.key]) index |= 1 << bit;
  });
  return Math.min(7, index);
}

/** 面板 DI 按钮显示名：由当前功能码派生，查不到档位时回落到默认 label */
export function diFunctionLabel(value: number, fallback: string): string {
  return MD520_DI_FUNCTION_OPTIONS[Math.trunc(value)] ?? fallback;
}

/** 是否处于「多段指令」频率源 */
export const isMultiSpeedSource = (params: Readonly<Record<string, number>>) =>
  Math.trunc(params['F0-03'] ?? 0) === 6;
