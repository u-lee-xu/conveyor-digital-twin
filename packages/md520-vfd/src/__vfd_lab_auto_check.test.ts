/**
 * 实验混合勾选自动判定：纯函数求值规则，只读真值、不写 store、不广播。
 */
import { describe, it, expect } from 'vitest';
import { evalAutoRule, autoCheckedSteps, type AutoFacts } from './platform/labAutoCheck';
import { LABS } from './constants/labGuide.generated';

const facts = (over: Partial<AutoFacts> = {}): AutoFacts => ({
  level: 0, params: { 'F0-08': 50 }, running: false, di: { DI1: false, DI2: false }, ...over,
});

describe('MD520 实验步骤自动判定', () => {
  it('四类规则按真值求值', () => {
    expect(evalAutoRule({ kind: 'level', value: 3 }, facts({ level: 3 }))).toBe(true);
    expect(evalAutoRule({ kind: 'level', value: 3 }, facts({ level: 2 }))).toBe(false);
    expect(evalAutoRule({ kind: 'param', code: 'F0-08', value: 30 }, facts({ params: { 'F0-08': 30 } }))).toBe(true);
    expect(evalAutoRule({ kind: 'param', code: 'F0-08', value: 30 }, facts())).toBe(false);
    expect(evalAutoRule({ kind: 'running', value: true }, facts({ running: true }))).toBe(true);
    expect(evalAutoRule({ kind: 'di', key: 'DI1', value: true }, facts({ di: { DI1: true } }))).toBe(true);
  });

  it('无 auto 规则的实验返回空，观察类不被自动勾选', () => {
    expect(autoCheckedSteps(undefined, facts())).toEqual([]);
    const lab2 = LABS.find((l) => l.n === 2)!;
    expect(autoCheckedSteps(lab2.auto, facts())).toEqual([]);
  });

  it('实验1：进 L3 自动勾第2步，改成 30 勾第3步；保存/退出类步骤手动', () => {
    const lab1 = LABS.find((l) => l.n === 1)!;
    expect(lab1.steps).toHaveLength(5);
    expect(lab1.auto).toHaveLength(5);
    expect(autoCheckedSteps(lab1.auto, facts())).toEqual([]);
    expect(autoCheckedSteps(lab1.auto, facts({ level: 3 }))).toEqual([1]);
    expect(autoCheckedSteps(lab1.auto, facts({ level: 3, params: { 'F0-08': 30 } }))).toEqual([1, 2]);
    // 第4步「改35退出看还是30」、第5步「改40保存」无法从真值区分，必须手动
    expect(autoCheckedSteps(lab1.auto, facts({ level: 2, params: { 'F0-08': 30 } }))).toEqual([2]);
    expect(autoCheckedSteps(lab1.auto, facts({ level: 2, params: { 'F0-08': 40 } }))).toEqual([]);
  });
});
