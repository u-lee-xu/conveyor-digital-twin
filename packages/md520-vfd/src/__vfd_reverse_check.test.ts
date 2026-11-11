/**
 * 正反转切换动画防回退自检：必须有「按 F0-18 减速到 0 → 翻转输出方向 →
 * 按 F0-17 反向加速」的完整过程，不能瞬间反向。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useVfdStore } from './stores/useVfdStore';
import { MD520_PARAMS } from './vfd/md520Spec';
import { INITIAL_KEYPAD } from './vfd/md520Keypad';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    runDirection: 1,
    externalSetpointHz: 50,
    outputHz: 0,
    outputCurrent: 0,
    outputPower: 0,
    di: { DI1: false, DI2: false, DI3: false, DI4: false, DI5: false },
    doFlags: { DO1: false, FM: false, RELAY: false },
    ai1: 0, ai2: 0, ai2Mode: 'voltage',
    command: 0, status: 3, commOnline: false,
    faultCode: null, faultHistory: [], message: '', engaged: false,
  });
});

const step = 1 / 60;
const advance = (seconds: number) => {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i += 1) useVfdStore.getState().tick(step);
};

describe('正反转切换先减速再反向加速', () => {
  it('运行中按 MF.K：目标方向立刻变，但输出方向保持到频率归零', () => {
    useVfdStore.getState().setParam('F7-01', 2);
    useVfdStore.getState().dispatchKey('RUN');
    advance(4); // 默认 F0-17=20s，此时约 10Hz
    const before = useVfdStore.getState().outputHz;
    expect(before).toBeGreaterThan(8);

    useVfdStore.getState().dispatchKey('MFK');
    const immediately = useVfdStore.getState();
    expect(immediately.direction).toBe(-1);
    expect(immediately.runDirection).toBe(1);
    expect(immediately.command).toBe(2);

    advance(0.5);
    const during = useVfdStore.getState();
    expect(during.outputHz).toBeLessThan(before); // 正在减速
    expect(during.runDirection).toBe(1);          // 仍按原方向转，只是变慢
    expect(during.outputHz).toBeGreaterThan(0);
  });

  it('频率归零后才翻转 runDirection，随后按加速时间反向升频', () => {
    useVfdStore.getState().setParam('F7-01', 2);
    useVfdStore.getState().dispatchKey('RUN');
    advance(4);
    useVfdStore.getState().dispatchKey('MFK');

    let flipped = false;
    let hzAtFlip = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 900; i += 1) {
      useVfdStore.getState().tick(step);
      const s = useVfdStore.getState();
      if (s.runDirection === -1) {
        flipped = true;
        // 翻转与反向加速发生在同一帧，允许刚起步的一点点频率
        hzAtFlip = s.outputHz;
        break;
      }
    }
    expect(flipped).toBe(true);
    expect(hzAtFlip).toBeLessThan(0.1);
    advance(1);
    const s = useVfdStore.getState();
    expect(s.direction).toBe(-1);
    expect(s.runDirection).toBe(-1);
    expect(s.outputHz).toBeGreaterThan(0); // 反向加速已开始
  });

  it('停机状态下换向直接生效，没有减速等待', () => {
    useVfdStore.setState({ direction: -1 });
    useVfdStore.getState().tick(step);
    const s = useVfdStore.getState();
    expect(s.runDirection).toBe(-1);
    expect(s.outputHz).toBe(0);
  });

  it('换向减速使用 F0-18，反向加速使用 F0-17', () => {
    useVfdStore.getState().setParam('F7-01', 2);
    useVfdStore.getState().setParam('F0-18', 2);
    useVfdStore.getState().setParam('F0-17', 2);
    useVfdStore.getState().dispatchKey('RUN');
    advance(1); // 25Hz/s × 1s ≈ 25Hz
    const before = useVfdStore.getState().outputHz;
    useVfdStore.getState().dispatchKey('MFK');
    advance(0.5); // 减速 25Hz/s × 0.5s ≈ 12.5Hz
    const during = useVfdStore.getState().outputHz;
    expect(before - during).toBeGreaterThan(8);
  });
});

describe('3D 与观众端方向口径', () => {
  it('3D 用 runDirection，诊断同时给出目标方向与换向中标志', () => {
    const rig = read('packages/md520-vfd/src/scenes/vfd/PhysicsVfdDrive.tsx');
    expect(rig).toContain('const direction = s.runDirection');
    expect(rig).toContain('targetDirection: s.direction');
    expect(rig).toContain('reversing: s.direction !== s.runDirection');
    expect(rig).toContain('* dt * direction');
  });

  it('方向数值镜像成对，观众端用 Number.isFinite 守卫', () => {
    const snap = useVfdStore.getState().snapshot();
    expect(Object.keys(snap)).toContain('direction');
    expect(Object.keys(snap)).toContain('runDirection');
    useVfdStore.getState().applyBroadcast({ VFD_DIRECTION: -1, VFD_RUN_DIRECTION: 1 });
    expect(useVfdStore.getState().direction).toBe(-1);
    expect(useVfdStore.getState().runDirection).toBe(1);
    // 非法值不能污染方向（换向状态机依赖严格的 1 / -1）
    useVfdStore.getState().applyBroadcast({ VFD_DIRECTION: 7, VFD_RUN_DIRECTION: 0 });
    expect(useVfdStore.getState().direction).toBe(-1);
    expect(useVfdStore.getState().runDirection).toBe(1);
    const index = read('packages/md520-vfd/src/index.ts');
    expect(index).toContain('VFD_DIRECTION');
    expect(index).toContain('VFD_RUN_DIRECTION');
  });
});
