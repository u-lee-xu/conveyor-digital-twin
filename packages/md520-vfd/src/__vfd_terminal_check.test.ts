/**
 * 端子命令解析行为验收：五种控制方式里的开关量控制与多段速。
 * 全部走真实纯函数，不读源码字符串冒充执行。
 */
import { describe, it, expect } from 'vitest';
import {
  MD520_COMMAND, MD520_DI_FUNCTION as FN, MD520_FC_DEFAULT_PERCENT,
} from './vfd/md520Spec';
import {
  diFunctions, resolveTerminalCommand, resolveMultiSpeedIndex,
  diFunctionLabel, INITIAL_TERMINAL_LATCH, type TerminalLatch,
} from './vfd/md520Terminal';
import { MD520_PARAMS } from './vfd/md520Spec';

const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));
const params = (patch: Record<string, number> = {}) => ({ ...defaults, ...patch });
const di = (on: Partial<Record<string, boolean>> = {}) => ({
  DI1: false, DI2: false, DI3: false, DI4: false, DI5: false, ...on,
});
const cmd = (
  d: ReturnType<typeof di>,
  p: ReturnType<typeof params>,
  latch: TerminalLatch = INITIAL_TERMINAL_LATCH,
) => resolveTerminalCommand(d, p, latch).command;

describe('出厂默认：两线式1 的 DI1 正转 / DI2 反转', () => {
  it('F4-00=1、F4-01=2、F4-11=0 与手册默认一致', () => {
    expect(diFunctions(params())).toEqual([1, 2, 0, 0, 0]);
  });

  it('双断停机，DI1 单独闭合正转，DI2 单独闭合反转', () => {
    const p = params();
    expect(cmd(di(), p)).toBe(MD520_COMMAND.STOP);
    expect(cmd(di({ DI1: true }), p)).toBe(MD520_COMMAND.FWD);
    expect(cmd(di({ DI2: true }), p)).toBe(MD520_COMMAND.REV);
  });

  it('双合属禁止态，优先停机不产生运行命令', () => {
    expect(cmd(di({ DI1: true, DI2: true }), params())).toBe(MD520_COMMAND.STOP);
  });

  it('改 F4-00/F4-01 可交换方向，角色不写死在 DI 编号上', () => {
    const p = params({ 'F4-00': FN.REV, 'F4-01': FN.FWD });
    expect(cmd(di({ DI1: true }), p)).toBe(MD520_COMMAND.REV);
    expect(cmd(di({ DI2: true }), p)).toBe(MD520_COMMAND.FWD);
  });
});

describe('两线式2 / 三线式1 / 三线式2', () => {
  it('两线式2：DI1 运行命令、DI2 方向，断开即停', () => {
    const p = params({ 'F4-11': 1 });
    expect(cmd(di({ DI1: true }), p)).toBe(MD520_COMMAND.FWD);
    expect(cmd(di({ DI1: true, DI2: true }), p)).toBe(MD520_COMMAND.REV);
    expect(cmd(di({ DI2: true }), p)).toBe(MD520_COMMAND.STOP);
  });

  it('三线式1：功能3 端子未闭合时一律停机', () => {
    const p = params({ 'F4-11': 2, 'F4-02': FN.THREE_WIRE });
    expect(cmd(di({ DI1: true }), p)).toBe(MD520_COMMAND.STOP);
  });

  it('三线式1：允许端子闭合后取启动上升沿，无新沿维持上一帧命令', () => {
    const p = params({ 'F4-11': 2, 'F4-02': FN.THREE_WIRE });
    const first = resolveTerminalCommand(di({ DI1: true, DI3: true }), p, INITIAL_TERMINAL_LATCH);
    expect(first.command).toBe(MD520_COMMAND.FWD);
    expect(first.latch.run).toBe(true);
    const held = resolveTerminalCommand(di({ DI1: true, DI3: true }), p, first.latch);
    expect(held.command).toBe(MD520_COMMAND.FWD);
    expect(held.latch.command).toBe(MD520_COMMAND.FWD);
  });

  it('三线式2：运行端子上升沿启动，方向端子决定正反转', () => {
    const p = params({ 'F4-11': 3, 'F4-03': FN.THREE_WIRE });
    const first = resolveTerminalCommand(di({ DI1: true, DI2: true, DI4: true }), p, INITIAL_TERMINAL_LATCH);
    expect(first.command).toBe(MD520_COMMAND.REV);
    const held = resolveTerminalCommand(di({ DI1: true, DI2: true, DI4: true }), p, first.latch);
    expect(held.command).toBe(MD520_COMMAND.REV);
  });
});

describe('参数化多段速：段位来自功能 12~15 的 DI', () => {
  it('默认档无多段端子时段号为 0，不会误动作', () => {
    expect(resolveMultiSpeedIndex(di({ DI1: true, DI2: true }), params())).toBe(0);
  });

  it('把 DI1~DI3 配成 12/13/14 后恢复 DI1~DI3 三位选段', () => {
    const p = params({ 'F4-00': FN.MULTI1, 'F4-01': FN.MULTI2, 'F4-02': FN.MULTI3 });
    expect(resolveMultiSpeedIndex(di({ DI2: true }), p)).toBe(2);
    expect(resolveMultiSpeedIndex(di({ DI1: true, DI3: true }), p)).toBe(5);
    expect(resolveMultiSpeedIndex(di({ DI1: true, DI2: true, DI3: true }), p)).toBe(7);
  });

  it('多段端子可以挂到任意 DI，段位按功能码排列而非 DI 编号', () => {
    const p = params({ 'F4-03': FN.MULTI1, 'F4-04': FN.MULTI2 });
    expect(resolveMultiSpeedIndex(di({ DI4: true }), p)).toBe(1);
    expect(resolveMultiSpeedIndex(di({ DI4: true, DI5: true }), p)).toBe(3);
  });

  it('四段位上限截断到 7，与 FC-00~FC-07 八段对应', () => {
    const p = params({
      'F4-00': FN.MULTI1, 'F4-01': FN.MULTI2, 'F4-02': FN.MULTI3, 'F4-03': FN.MULTI4,
    });
    expect(resolveMultiSpeedIndex(di({ DI1: true, DI2: true, DI3: true, DI4: true }), p)).toBe(7);
    expect(MD520_FC_DEFAULT_PERCENT).toHaveLength(8);
  });

  it('多段端子与运行端子可共存：DI1~DI3 选段、DI4 独立 FWD', () => {
    const p = params({
      'F4-00': FN.MULTI1, 'F4-01': FN.MULTI2, 'F4-02': FN.MULTI3, 'F4-03': FN.FWD,
    });
    expect(cmd(di({ DI2: true, DI4: true }), p)).toBe(MD520_COMMAND.FWD);
    expect(resolveMultiSpeedIndex(di({ DI2: true, DI4: true }), p)).toBe(2);
  });
});

describe('面板按钮显示名由参数派生', () => {
  it('功能码能查到档位时返回档位名，查不到回落默认 label', () => {
    expect(diFunctionLabel(FN.REV, '无功能')).toBe('反转运行');
    expect(diFunctionLabel(FN.MULTI1, '无功能')).toBe('多段指令端子1');
    expect(diFunctionLabel(99, '无功能')).toBe('无功能');
  });
});
