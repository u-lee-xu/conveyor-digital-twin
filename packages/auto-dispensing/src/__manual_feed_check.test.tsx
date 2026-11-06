// @vitest-environment jsdom
/**
 * 手动模式送药气缸时序回归：
 * 旧实现只在 autoPhase==='dosing' 里生成 pendingPills，手动伸缸时药片只被推板
 * 推到出药口就停住（没有刚体、不掉落、库存也不减），点缩回时 push 瞬间归零
 * 还会让视觉药片倒退回料筒。这里用真实 useDispenseLoop + 手动 rAF 复现并锁死。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import { useDispensingStore } from './stores/useDispensingStore';
import {
  MAG_CAPACITY, FEED_CYL_TIME, type MagazineId,
} from './scenes/auto-dispensing/constants';

let clock = 0;
let frames: FrameRequestCallback[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let nowSpy: ReturnType<typeof vi.spyOn> | null = null;

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
  }
}

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

beforeEach(() => {
  // @ts-expect-error React act 环境标记
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  clock = 0;
  frames = [];
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);

  const s = () => useDispensingStore.getState();
  s().resetAll();
  // resetAll 不重置库存，测试间显式补满，避免互相污染
  MAGS.forEach((m) => s().setMagStock(m, MAG_CAPACITY));

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<Harness />); });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  vi.unstubAllGlobals();
  nowSpy?.mockRestore();
});

describe('本行程出药真值 store.dispensed（视觉药片堆与刚体共用）', () => {
  it('初始全 false，可单独置位/清除，resetAll 清空全部', () => {
    const s = () => useDispensingStore.getState();
    MAGS.forEach((m) => expect(s().dispensed[m]).toBe(false));
    act(() => { s().setDispensed('A', true); });
    expect(s().dispensed.A).toBe(true);
    expect(s().dispensed.B).toBe(false);
    act(() => { s().setDispensed('A', false); });
    expect(s().dispensed.A).toBe(false);
    act(() => { s().setDispensed('C', true); s().resetAll(); });
    MAGS.forEach((m) => expect(s().dispensed[m]).toBe(false));
  });
});

describe('手动模式：伸缸 → 出药 → 缩回 → 再伸缸', () => {
  it('伸到位扣库存并生成刚体，保持伸出不重复出药，缩回不倒退，下轮可再出一片', () => {
    const s = () => useDispensingStore.getState();
    expect(s().autoPhase).toBe('idle');

    act(() => { s().setSendCyl('A', true, 0); });
    advance(FEED_CYL_TIME + 0.1);

    expect(s().sendCyl.A.position).toBe(1);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 1);
    expect(s().pendingPills).toHaveLength(1);
    expect(s().pendingPills[0].mag).toBe('A');

    // 保持伸出（未到兜底超时）期间不得重复出药
    advance(0.25);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 1);
    expect(s().pendingPills).toHaveLength(1);

    act(() => { s().setSendCyl('A', false, s().sendCyl.A.position); });
    advance(0.15);
    // 缩缸途中仍标记「已出药」：PillStack 不会把药片画回料筒里
    expect(s().sendCyl.A.position).toBeGreaterThan(0);
    expect(s().dispensed.A).toBe(true);

    advance(FEED_CYL_TIME);
    expect(s().sendCyl.A.position).toBe(0);
    expect(s().dispensed.A).toBe(false);

    // 手动模式药片没落进斗：超时只清理刚体，不凭空计入料斗
    advance(1.0);
    expect(s().pendingPills).toHaveLength(0);
    expect(s().hopperPills).toBe(0);

    // 完全缩回解锁后，下一轮伸缸应能再出一片
    act(() => { s().setSendCyl('A', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 2);
    expect(s().pendingPills).toHaveLength(1);
  });

  it('伸缸未到位就点缩回：不出药、不扣库存，dispensed 保持 false 让药片正常退回', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setSendCyl('A', true, 0); });
    advance(0.15);
    expect(s().sendCyl.A.position).toBeGreaterThan(0);
    expect(s().sendCyl.A.position).toBeLessThan(0.999);

    act(() => { s().setSendCyl('A', false, s().sendCyl.A.position); });
    advance(0.15);
    // 旧实现用 position 反推「已出药」，这里会误判，底层视觉药片凭空消失却没有刚体
    expect(s().dispensed.A).toBe(false);
    expect(s().magStock.A).toBe(MAG_CAPACITY);
    expect(s().pendingPills).toHaveLength(0);

    advance(FEED_CYL_TIME);
    expect(s().sendCyl.A.position).toBe(0);
    expect(s().dispensed.A).toBe(false);

    // 完全缩回后重新伸到位，仍能正常出一片
    act(() => { s().setSendCyl('A', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 1);
    expect(s().pendingPills).toHaveLength(1);
    expect(s().dispensed.A).toBe(true);
  });

  it('PLC/仿真直接写 position=1 也走统一上升沿出药，写回 0 即解锁', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setSendCyl('C', true, 1); });
    advance(0.05);
    expect(s().magStock.C).toBe(MAG_CAPACITY - 1);
    expect(s().pendingPills.map((p) => p.mag)).toEqual(['C']);
    expect(s().dispensed.C).toBe(true);

    // 保持伸出不重复出药
    advance(0.2);
    expect(s().magStock.C).toBe(MAG_CAPACITY - 1);

    act(() => { s().setSendCyl('C', false, 0); });
    advance(0.05);
    expect(s().dispensed.C).toBe(false);
  });

  it('手动药片若真的越过料斗口，物理结算照常计入料斗', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setSendCyl('B', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    const id = s().pendingPills[0].id;
    act(() => { s().landPill(id); });
    expect(s().pendingPills).toHaveLength(0);
    expect(s().hopperPills).toBe(1);
    expect(s().hopperStock.B).toBe(1);
  });

  it('多个料仓同时伸缸各自出一片，pendingPills 不互相覆盖', () => {
    const s = () => useDispensingStore.getState();
    act(() => {
      s().setSendCyl('A', true, 0);
      s().setSendCyl('C', true, 0);
    });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 1);
    expect(s().magStock.C).toBe(MAG_CAPACITY - 1);
    expect(s().magStock.B).toBe(MAG_CAPACITY);
    expect(s().pendingPills.map((p) => p.mag).sort()).toEqual(['A', 'C']);
  });

  it('空仓伸缸不出药、不生成刚体，空仓信号保持', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setMagStock('D', 0); });
    act(() => { s().setSendCyl('D', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().pendingPills).toHaveLength(0);
    expect(s().magStock.D).toBe(0);
    expect(s().sensors.magEmpty.D).toBe(true);
  });
});

describe('人工补药 refillAll：推空药仓后能恢复出药', () => {
  it('四仓补满到 MAG_CAPACITY，且清空所有空仓传感器', () => {
    const s = () => useDispensingStore.getState();
    act(() => {
      s().setMagStock('A', 0);
      s().setMagStock('C', 2);
      s().setMagStock('D', 0);
    });
    expect(s().sensors.magEmpty.A).toBe(true);
    expect(s().sensors.magEmpty.D).toBe(true);
    act(() => { s().refillAll(); });
    expect(s().magStock).toEqual({
      A: MAG_CAPACITY, B: MAG_CAPACITY, C: MAG_CAPACITY, D: MAG_CAPACITY,
    });
    expect(s().sensors.magEmpty).toEqual({ A: false, B: false, C: false, D: false });
  });

  it('补药只补料筒，不改写已出药锁 / 料斗 / 在途药片', () => {
    const s = () => useDispensingStore.getState();
    act(() => {
      s().setMagStock('A', 0);
      s().setDispensed('A', true);
      s().setPendingPills([{ id: 'keep_me', mag: 'A', progress: 0 }]);
      s().addPillToHopper('B');
    });
    act(() => { s().refillAll(); });
    expect(s().dispensed.A).toBe(true);
    expect(s().pendingPills.map((p) => p.id)).toEqual(['keep_me']);
    expect(s().hopperPills).toBe(1);
  });

  it('推空后伸缸不出药，补满后再次伸缸能正常出药', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setMagStock('A', 0); });
    act(() => { s().setSendCyl('A', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().pendingPills).toHaveLength(0);
    expect(s().magStock.A).toBe(0);

    act(() => { s().refillAll(); });
    expect(s().magStock.A).toBe(MAG_CAPACITY);

    // 先完全缩回，解锁下一轮出药
    act(() => { s().setSendCyl('A', false, 1); });
    advance(FEED_CYL_TIME + 0.1);
    act(() => { s().setSendCyl('A', true, 0); });
    advance(FEED_CYL_TIME + 0.1);
    expect(s().magStock.A).toBe(MAG_CAPACITY - 1);
    expect(s().pendingPills.map((p) => p.mag)).toContain('A');
  });

  it('resetAll 保持「不重置库存」语义，补药是独立操作', () => {
    const s = () => useDispensingStore.getState();
    act(() => { s().setMagStock('B', 3); });
    act(() => { s().resetAll(); });
    expect(s().magStock.B).toBe(3);
    act(() => { s().refillAll(); });
    expect(s().magStock.B).toBe(MAG_CAPACITY);
  });
});
