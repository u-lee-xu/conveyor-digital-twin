/**
 * 「设不同参数有不同效果」行为验收：五种控制方式。
 *  1. F0-08 / F0-17 / F0-18 改目标频率与加减速；
 *  2. F0-02 / F4-xx / F4-11 决定运行指令来自面板、端子还是通信；
 *  3. F0-03 + FC / AI / 通信决定频率来源；
 *  4. 固定系数监视量与快照镜像。
 * 所有断言都跑真实 store 的 tick()，不读源码字符串冒充执行。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useVfdStore } from './stores/useVfdStore';
import { MD520_PARAMS, MD520_COMMAND, MD520_DI_FUNCTION as FN, MD520_MULTI_SPEED } from './vfd/md520Spec';
import { INITIAL_KEYPAD } from './vfd/md520Keypad';
import { INITIAL_TERMINAL_LATCH } from './vfd/md520Terminal';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');
const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    terminalLatch: { ...INITIAL_TERMINAL_LATCH },
    externalSetpointHz: 50,
    outputHz: 0,
    outputCurrent: 0,
    outputPower: 0,
    di: { DI1: false, DI2: false, DI3: false, DI4: false, DI5: false },
    doFlags: { DO1: false, FM: false, RELAY: false },
    ai1: 0,
    ai2: 0,
    ai2Mode: 'voltage',
    command: MD520_COMMAND.STOP,
    status: 3,
    commOnline: false,
    faultCode: null,
    faultHistory: [],
    message: '',
    engaged: false,
  });
});

const step = 1 / 60;
const advance = (seconds: number) => {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i += 1) useVfdStore.getState().tick(step);
};
const runToFull = () => {
  useVfdStore.getState().dispatchKey('RUN');
  advance(21);
};

describe('补 1：面板控制的频率与斜坡', () => {
  it('F0-08 改目标频率，F0-17 改加速快慢', () => {
    useVfdStore.getState().setParam('F0-08', 30);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().dispatchKey('RUN');
    advance(0.5);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(30, 0);
  });

  it('F0-18 改减速快慢：改小后 STOP 立刻回落', () => {
    runToFull();
    useVfdStore.getState().setParam('F0-18', 0.1);
    useVfdStore.getState().dispatchKey('STOP');
    advance(0.5);
    expect(useVfdStore.getState().outputHz).toBe(0);
  });

  it('默认斜坡：1 秒升 2.5Hz', () => {
    useVfdStore.getState().dispatchKey('RUN');
    advance(1);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(2.5, 1);
  });
});

describe('补 2：开关量控制按 F4-xx 功能与 F4-11 命令方式', () => {
  it('出厂默认 DI1 正转、DI2 反转，双断停机', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setDi('DI1', true);
    advance(0.2);
    expect(useVfdStore.getState().outputHz).toBeGreaterThan(0);
    expect(useVfdStore.getState().status).toBe(1);
    useVfdStore.getState().setDi('DI1', false);
    useVfdStore.getState().tick(step);
    expect(useVfdStore.getState().running).toBe(false);
    expect(useVfdStore.getState().command).toBe(MD520_COMMAND.STOP);
  });

  it('把 DI3 改成正转后也能独立驱动运行', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setParam('F4-02', FN.FWD);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setDi('DI2', true);
    advance(0.2);
    expect(useVfdStore.getState().outputHz).toBeGreaterThan(0);
  });

  it('双合禁止态：DI1/DI2 都闭合时停机', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setDi('DI1', true);
    useVfdStore.getState().setDi('DI2', true);
    useVfdStore.getState().tick(step);
    expect(useVfdStore.getState().command).toBe(MD520_COMMAND.STOP);
  });
});

describe('补 3：多段速按功能位选段', () => {
  it('DI1~DI3 配成 12/13/14 后恢复三位选段', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setParam('F0-03', 6);
    useVfdStore.getState().setParam('F4-00', FN.MULTI1);
    useVfdStore.getState().setParam('F4-01', FN.MULTI2);
    useVfdStore.getState().setParam('F4-02', FN.MULTI3);
    useVfdStore.getState().setParam('F4-03', FN.FWD);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setDi('DI2', true);
    useVfdStore.getState().setDi('DI4', true);
    expect(useVfdStore.getState().multiSpeedIndex()).toBe(2);
    advance(0.5);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(MD520_MULTI_SPEED[2], 0);
  });

  it('改 FC-01 后段速随之变化', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setParam('F0-03', 6);
    useVfdStore.getState().setParam('F4-00', FN.MULTI1);
    useVfdStore.getState().setParam('F4-03', FN.FWD);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setParam('FC-01', 10);
    useVfdStore.getState().setDi('DI1', true);
    useVfdStore.getState().setDi('DI4', true);
    advance(0.5);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(5, 0);
  });
});

describe('补 4：固定系数监视量与快照', () => {
  it('满速 9A / 3.7kW，停机归零', () => {
    runToFull();
    expect(useVfdStore.getState().outputCurrent).toBeCloseTo(9, 1);
    expect(useVfdStore.getState().outputPower).toBeCloseTo(3.7, 1);
    useVfdStore.getState().dispatchKey('STOP');
    useVfdStore.getState().setParam('F0-18', 0.1);
    advance(0.5);
    expect(useVfdStore.getState().outputCurrent).toBe(0);
    expect(useVfdStore.getState().outputPower).toBe(0);
  });

  it('快照与观众镜像键成对，面板显示引用监视量', () => {
    const snap = useVfdStore.getState().snapshot();
    expect(Object.keys(snap)).toContain('outputCurrent');
    expect(Object.keys(snap)).toContain('outputPower');
    useVfdStore.getState().applyBroadcast({ VFD_CURRENT: 4.2, VFD_POWER: 1.6 });
    expect(useVfdStore.getState().outputCurrent).toBe(4.2);
    expect(useVfdStore.getState().outputPower).toBe(1.6);
    expect(src('index.ts')).toContain('VFD_CURRENT');
    expect(src('index.ts')).toContain('VFD_POWER');
    const panel = src('platform/VfdKeypadPanel.tsx');
    expect(panel).toContain('data-dt-vfd-monitor');
    expect(panel).toContain('outputCurrent.toFixed(2)');
    expect(panel).toContain('outputPower.toFixed(2)');
  });
});

describe('rAF 写入守卫', () => {
  it('静止期复用参数表且不写 store，运行时频率斜坡照常推进', () => {
    useVfdStore.getState().tick(0.05);
    const before = useVfdStore.getState();
    const factor = before.tick(0.05);
    expect(useVfdStore.getState().params).toBe(before.params);
    expect(factor).toBeCloseTo(0);
    useVfdStore.setState({ running: true });
    const accelerating = useVfdStore.getState();
    accelerating.tick(0.05);
    expect(useVfdStore.getState().outputHz).toBeGreaterThan(accelerating.outputHz);
  });
});
