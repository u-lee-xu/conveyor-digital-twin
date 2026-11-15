/**
 * 「设不同参数有不同效果」行为验收（补 1/2/3）：
 *  1. F6-10 停机方式 / F6-14 直流制动时间改变停机曲线；
 *  2. F0-25 加减速基准频率改变斜坡速率；
 *  3. F1-01 / F1-03 铭牌参数改变只读监视量（输出功率 / 电流）。
 * 所有断言都跑真实 store 的 tick()，不读源码字符串冒充执行。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useVfdStore } from './stores/useVfdStore';
import { MD520_PARAMS } from './vfd/md520Spec';
import { INITIAL_KEYPAD, visibleParams } from './vfd/md520Keypad';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');
const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    externalSetpointHz: 50,
    outputHz: 0,
    outputCurrent: 0,
    outputPower: 0,
    di: { DI1: false, DI2: false, DI3: false, DI4: false, DI5: false },
    doFlags: { DO1: false, FM: false, RELAY: false },
    ai1: 0,
    ai2: 0,
    ai2Mode: 'voltage',
    command: 0,
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
/** 面板档 RUN 并爬到接近 50Hz（默认 F0-17=20s） */
const runToFull = () => {
  useVfdStore.getState().dispatchKey('RUN');
  advance(21);
};

describe('补 1：F6-10 停机方式 / F6-14 制动时间', () => {
  it('F6-10=0 减速停机：STOP 后仍按 F0-18 斜坡回落', () => {
    runToFull();
    const before = useVfdStore.getState().outputHz;
    expect(before).toBeGreaterThan(49);
    useVfdStore.getState().dispatchKey('STOP');
    advance(0.5);
    const after = useVfdStore.getState().outputHz;
    expect(after).toBeGreaterThan(40);
    expect(after).toBeLessThan(before);
  });

  it('F6-10=1 自由停机：STOP 后输出频率立即归零', () => {
    useVfdStore.getState().setParam('F6-10', 1);
    runToFull();
    useVfdStore.getState().dispatchKey('STOP');
    useVfdStore.getState().tick(step);
    expect(useVfdStore.getState().outputHz).toBe(0);
  });

  it('F6-10=2 最大能力停机：比减速停机降得更快', () => {
    useVfdStore.getState().setParam('F6-10', 2);
    runToFull();
    useVfdStore.getState().dispatchKey('STOP');
    advance(0.5);
    const fast = useVfdStore.getState().outputHz;
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThan(45);
  });

  it('F6-14 直流制动时间给自由停机一个制动减速段', () => {
    useVfdStore.getState().setParam('F6-10', 1);
    useVfdStore.getState().setParam('F6-14', 2);
    runToFull();
    useVfdStore.getState().dispatchKey('STOP');
    advance(0.5);
    const braking = useVfdStore.getState().outputHz;
    expect(braking).toBeGreaterThan(0);
    expect(braking).toBeLessThan(45);
  });
});

describe('补 2：F0-25 加减速基准频率', () => {
  const riseIn1s = () => {
    useVfdStore.getState().dispatchKey('RUN');
    advance(1);
    return useVfdStore.getState().outputHz;
  };

  it('默认 0（最大频率）与旧行为一致：1 秒约升 2.5Hz', () => {
    expect(riseIn1s()).toBeCloseTo(2.5, 1);
  });

  it('F0-25=2 固定 100Hz：加速快一倍', () => {
    useVfdStore.getState().setParam('F0-25', 2);
    expect(riseIn1s()).toBeCloseTo(5, 1);
  });

  it('F0-25=1 设定频率：目标 30Hz 时比默认慢', () => {
    useVfdStore.getState().setParam('F0-08', 30);
    useVfdStore.getState().setParam('F0-25', 1);
    expect(riseIn1s()).toBeCloseTo(1.5, 1);
  });

  it('F0-25=3 额定频率：F1-04=25Hz 时按铭牌基准减速', () => {
    useVfdStore.getState().setParam('F1-04', 25);
    useVfdStore.getState().setParam('F0-25', 3);
    expect(riseIn1s()).toBeCloseTo(1.25, 1);
  });
});

describe('补 3：F1 铭牌参数驱动只读监视量', () => {
  it('输出电流 / 功率随 F1-03 / F1-01 成比例变化', () => {
    runToFull();
    const a = useVfdStore.getState();
    expect(a.outputCurrent).toBeCloseTo(9, 1);
    expect(a.outputPower).toBeCloseTo(3.7, 1);
    useVfdStore.getState().setParam('F1-03', 18);
    useVfdStore.getState().setParam('F1-01', 7.4);
    useVfdStore.getState().tick(step);
    const b = useVfdStore.getState();
    expect(b.outputCurrent).toBeCloseTo(18, 1);
    expect(b.outputPower).toBeCloseTo(7.4, 1);
  });

  it('停机后监视量归零', () => {
    runToFull();
    useVfdStore.getState().setParam('F6-10', 1);
    useVfdStore.getState().dispatchKey('STOP');
    useVfdStore.getState().tick(step);
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

describe('继续补：其余只存值参数的教学近似效果（默认档零回归）', () => {
  const riseIn1s = () => {
    useVfdStore.getState().dispatchKey('RUN');
    advance(1);
    return useVfdStore.getState().outputHz;
  };

  it('F0-01 默认 2(V/f) 仍是 2.5Hz/秒；SVC=0 更快、FVC=1 居中', () => {
    expect(riseIn1s()).toBeCloseTo(2.5, 1);
  });
  it('F0-01=0 (SVC) 低速段爬升 ×1.6', () => {
    useVfdStore.getState().setParam('F0-01', 0);
    expect(riseIn1s()).toBeCloseTo(4, 1);
  });
  it('F0-01=1 (FVC) 低速段爬升 ×1.25，且频率到达容差更宽', () => {
    useVfdStore.getState().setParam('F0-01', 1);
    expect(riseIn1s()).toBeCloseTo(3.13, 1);
    expect(src('stores/useVfdStore.ts')).toContain('ctrlMode === 1 ? 0.2 : 0.05');
  });

  it('F7-02=1 (OFF1) 覆盖 F6-10=0，STOP 后立即归零', () => {
    useVfdStore.getState().setParam('F6-10', 0);
    useVfdStore.getState().setParam('F7-02', 1);
    runToFull();
    useVfdStore.getState().dispatchKey('STOP');
    useVfdStore.getState().tick(step);
    expect(useVfdStore.getState().outputHz).toBe(0);
  });

  it('F6-13 制动电流加大，制动段降得更快', () => {
    const brakingWith = (current: number) => {
      useVfdStore.setState({ outputHz: 0 });
      useVfdStore.getState().setParam('F6-10', 1);
      useVfdStore.getState().setParam('F6-14', 2);
      useVfdStore.getState().setParam('F6-13', current);
      runToFull();
      useVfdStore.getState().dispatchKey('STOP');
      advance(0.3);
      return useVfdStore.getState().outputHz;
    };
    expect(brakingWith(100)).toBeLessThan(brakingWith(50));
  });

  it('F6-11 制动起始频率：高于起始频率时不加制动增益', () => {
    useVfdStore.getState().setParam('F6-10', 1);
    useVfdStore.getState().setParam('F6-14', 2);
    useVfdStore.getState().setParam('F6-13', 100);
    useVfdStore.getState().setParam('F6-11', 1);
    runToFull();
    useVfdStore.getState().dispatchKey('STOP');
    advance(0.3);
    expect(useVfdStore.getState().outputHz).toBeGreaterThan(0);
  });

  it('F1-00 电机类型给输出电流效率系数', () => {
    runToFull();
    const base = useVfdStore.getState().outputCurrent;
    useVfdStore.getState().setParam('F1-00', 2);
    useVfdStore.getState().tick(step);
    expect(useVfdStore.getState().outputCurrent).toBeCloseTo(base * 0.88, 1);
  });

  it('FP-02 掩码控制用户自定义参数菜单；默认 63 仍显示 4 项', () => {
    expect(visibleParams('user', defaults)).toHaveLength(4);
    expect(visibleParams('user', { ...defaults, 'FP-02': 0 })).toHaveLength(0);
    expect(visibleParams('basic', { ...defaults, 'FP-02': 0 }).length).toBeGreaterThan(30);
  });

  it('FD-01 Modbus 数据格式在 485 状态行可见', () => {
    expect(src('platform/VfdKeypadPanel.tsx')).toContain("FD-01 {params['FD-01']}");
  });
});

describe('rAF 写入守卫', () => {
  it('静止期复用参数表且不写 store，运行时频率斜坡照常推进', () => {
    useVfdStore.getState().tick(0.05); // 预热：首次写入 U0-00
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
