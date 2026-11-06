// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import { useDispensingStore } from './stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAGAZINE_X, MAG_CAPACITY, HOPPER_OFFSET_X,
  CHUTE_EXIT_Z, FEED_PUSH_Z1, PILL_R, PILL_LAND_Y, CHUTE_RAMP_END_Y,
  DUMP_LAND_Y, BIN_TOP_Y,
  type MagazineId,
} from './scenes/auto-dispensing/constants';

/** 用手动 rAF 队列驱动真实 useDispenseLoop，按 store 变更记录工艺事件流 */
let clock = 0;
let frames: FrameRequestCallback[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let nowSpy: ReturnType<typeof vi.spyOn> | null = null;
let unsub: (() => void) | null = null;
let events: string[] = [];
let sawReverse = false;
let sawEndSensor = false;

function Harness() {
  useDispenseLoop();
  return null;
}

function advance(seconds: number) {
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i += 1) {
    clock += 50;
    const pending = frames;
    frames = [];
    act(() => { pending.forEach((cb) => cb(clock)); });
    const s = useDispensingStore.getState();
    if (s.autoPhase === 'returning' && s.motorRev && !s.motorFwd) sawReverse = true;
  }
}

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

beforeEach(() => {
  // @ts-expect-error React act 环境标记
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  clock = 0;
  frames = [];
  events = [];
  sawReverse = false;
  sawEndSensor = false;
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  useDispensingStore.getState().resetAll();

  // 订阅状态流：伸缸/缩缸/推出/落斗/阶段切换各记一条事件
  let prev = useDispensingStore.getState();
  unsub = useDispensingStore.subscribe((s) => {
    MAGS.forEach((m) => {
      if (!prev.sendCyl[m].extended && s.sendCyl[m].extended) events.push(`extend:${m}`);
      if (prev.sendCyl[m].extended && !s.sendCyl[m].extended) events.push(`retract:${m}`);
    });
    if (prev.pendingPills.length === 0 && s.pendingPills.length > 0) events.push(`push:${s.pendingPills[0].mag}`);
    if (!prev.sensors.limitEnd && s.sensors.limitEnd) sawEndSensor = true;
    if (s.hopperPills > prev.hopperPills) events.push('landed');
    if (prev.autoPhase !== s.autoPhase) events.push(`phase:${s.autoPhase}`);
    if (prev.dumpingPills.length === 0 && s.dumpingPills.length > 0) events.push('dump-start');
    if (s.binPills !== prev.binPills && Object.values(s.binPills).some((v) => v > 0)) events.push('bin-filled');
    prev = s;
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<Harness />); });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  unsub?.();
  container?.remove();
  vi.unstubAllGlobals();
  nowSpy?.mockRestore();
});

describe('自动配药工艺链（真实 hook 时序）', () => {
  it('几何常量严格闭合', () => {
    // 推板伸到位 → 药片中心 = 托板出口 = 斜槽起点
    expect(FEED_PUSH_Z1 + PILL_R).toBeCloseTo(CHUTE_EXIT_Z, 6);
    // 药片最终落点在斗口以下、斜槽末端槽面以上（不是凭空飘过去）
    expect(PILL_LAND_Y).toBeLessThan(CHUTE_RAMP_END_Y);
    // 倒药落点在取药仓开口以下
    expect(DUMP_LAND_Y).toBeLessThan(BIN_TOP_Y);
    // 四个接药位都在行程内
    MAGS.forEach((m) => {
      expect(MAGAZINE_X[m] - HOPPER_OFFSET_X).toBeGreaterThanOrEqual(SLIDER_MIN_X);
      expect(MAGAZINE_X[m] - HOPPER_OFFSET_X).toBeLessThanOrEqual(SLIDER_MAX_X);
    });
    expect(MAG_CAPACITY).toBeGreaterThan(5);
    expect(HOPPER_OFFSET_X).toBe(0);
  });

  it('推杆推出 → 落入料斗 → 到放药位翻转 → 倒入取药仓 → 反转回起点', () => {
    const s = () => useDispensingStore.getState();
    const recipe = { A: 2, B: 1, C: 1, D: 1 };
    act(() => { useDispensingStore.setState({ recipe }); });
    const stockBefore = { ...s().magStock };

    act(() => { s().setButton('start', true); });
    // 足够跑完：移动 ~10s + 5 粒 ~4.5s + 翻转倒药 ~1.5s + 回程 ~6s
    advance(30);

    // ---- 每一粒都经历「伸缸 → 推出 → 缩缸」完整循环 ----
    MAGS.forEach((m) => {
      expect(events.filter((e) => e === `extend:${m}`)).toHaveLength(recipe[m]);
      expect(events.filter((e) => e === `push:${m}`)).toHaveLength(recipe[m]);
      expect(events.filter((e) => e === `retract:${m}`)).toHaveLength(recipe[m]);
      // 伸缸必须早于该仓第一次推出
      expect(events.indexOf(`extend:${m}`)).toBeLessThan(events.indexOf(`push:${m}`));
    });
    expect(events.filter((e) => e === 'landed')).toHaveLength(5);
    expect(s().hopperPills).toBe(0); // 已全部倒出

    // ---- 停靠位置：四个接药位 + 放药位 ----
    expect(MAGAZINE_X.A - HOPPER_OFFSET_X).toBeCloseTo(0.55, 6);
    expect(events).toContain('phase:tilt');
    expect(events).toContain('phase:returning');
    expect(events).toContain('phase:wait_confirm');

    // ---- 翻转倒药：按来源药仓还原颜色并计入取药仓 ----
    expect(events).toContain('dump-start');
    expect(events).toContain('bin-filled');
    expect(s().binPills).toEqual(recipe);
    expect(s().sensors.binHasDrug).toBe(true);

    // ---- 回程电机方向不能写反，且确实回到起点 ----
    expect(sawReverse).toBe(true);
    expect(s().sliderX).toBeCloseTo(SLIDER_MIN_X, 2);
    expect(s().tiltCyl.angle).toBeLessThan(0.001);

    // 终点传感器确实被触发过；回原点后增量式寄存器按 Z 相归零
    expect(sawEndSensor).toBe(true);
    expect(s().sensors.limitStart).toBe(true);
    expect(s().encoderPulses).toBe(0);
    expect(s().encoderAccum).toBe(0);

    // ---- 库存按配方扣减 ----
    expect(s().magStock.A).toBe(stockBefore.A - 2);
    expect(s().magStock.B).toBe(stockBefore.B - 1);
    expect(s().magStock.C).toBe(stockBefore.C - 1);
    expect(s().magStock.D).toBe(stockBefore.D - 1);
  });
});
