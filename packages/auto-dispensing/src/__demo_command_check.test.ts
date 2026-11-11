// @vitest-environment jsdom
/**
 * P1-3 演示面板主令按钮锁存导致流程永久卡死 + P1-4 平台入口评分状态机挂载自检。
 *
 * 行为测试沿用 __process_chain_check.test.tsx 的真实 rAF 队列：渲染真实
 * useDispenseLoop()，逐帧推进真实 store，不读源码字符串冒充执行。
 *
 * 硬约束：
 *  1. 五个主令（start/stop/estop/reset/confirm）都是一次性脉冲，状态机消费后立即
 *     置回 false，与 3D 按钮箱 onDown/onUp 自复位语义一致；
 *  2. 停止要真的暂停自动循环（显式暂停态），再次启动能恢复；
 *  3. 复位判断在急停 / 停止守卫之前，急停后必须复位才能重新启动；
 *  4. 非 auto 模式提前返回且继续跟踪 r.prevStart，表现层插值三模式共用；
 *  5. 平台注册的每个有评分模式的设备，评分状态机都必须在平台入口挂载。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import { useDispensingStore } from './stores/useDispensingStore';
import { useAppStore } from './stores/useAppStore';
import { SLIDER_MIN_X, MAG_CAPACITY, type MagazineId } from './scenes/auto-dispensing/constants';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

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
const s = () => useDispensingStore.getState();
const singleRecipe = () => {
  act(() => { useDispensingStore.setState({ recipe: { A: 1, B: 0, C: 0, D: 0 } }); });
};

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
  act(() => {
    s().resetAll();
    // resetAll 不清轮次计数（既有语义），每个用例显式从全新一轮开始
    useDispensingStore.setState({ autoCycle: 0 });
    MAGS.forEach((m) => s().setMagStock(m, MAG_CAPACITY));
  });
  useAppStore.getState().setMode('auto');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(createElement(Harness)); });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  vi.unstubAllGlobals();
  nowSpy?.mockRestore();
  useAppStore.getState().setMode('manual');
});

describe('P1-3 主令一次性脉冲与显式暂停（真实 hook 时序）', () => {
  it('停止 → 显式暂停 → 再次启动从原阶段恢复，消费按钮后不会自动继续', () => {
    singleRecipe();
    act(() => { s().setButton('start', true); });
    advance(0.3);
    expect(s().autoPhase).toBe('travel');
    expect(s().motorFwd).toBe(true);
    expect(s().buttons.start).toBe(false); // 启动脉冲已被消费
    expect(s().demoPaused).toBe('none');

    act(() => { s().setButton('stop', true); });
    advance(0.1);
    expect(s().demoPaused).toBe('stop');
    expect(s().buttons.stop).toBe(false); // 停止脉冲已被消费
    expect(s().motorFwd).toBe(false);
    expect(s().motorRev).toBe(false);
    const phaseAtStop = s().autoPhase;
    const xAtStop = s().sliderX;

    // 暂停期间持续推进 rAF：阶段与位置都不变，等于「真的停了」而不是靠按钮锁存卡住
    advance(10);
    expect(s().autoPhase).toBe(phaseAtStop);
    expect(s().sliderX).toBeCloseTo(xAtStop, 6);
    expect(s().autoCycle).toBe(0);
    expect(s().demoPaused).toBe('stop');

    // 暂停期间重复按停止也必须消费掉，恢复后不会再次误停
    act(() => { s().setButton('stop', true); });
    advance(0.1);
    expect(s().buttons.stop).toBe(false);
    expect(s().demoPaused).toBe('stop');

    act(() => { s().setButton('start', true); });
    advance(0.1);
    expect(s().buttons.start).toBe(false);
    expect(s().demoPaused).toBe('none');
    advance(30);
    expect(s().autoPhase).toBe('wait_confirm');
    expect(s().autoCycle).toBe(0);
  });

  it('急停 → 复位 → 启动重新跑通完整循环，第二轮 wait_confirm 仍能确认', () => {
    singleRecipe();
    act(() => { s().setButton('start', true); });
    advance(1);
    expect(s().autoPhase).not.toBe('idle');
    expect(s().sliderX).toBeGreaterThan(SLIDER_MIN_X);

    act(() => { s().setButton('estop', true); });
    advance(0.1);
    expect(s().buttons.estop).toBe(false); // 急停脉冲已被消费
    expect(s().autoPhase).toBe('idle');
    expect(s().demoPaused).toBe('estop');
    expect(s().pendingPills).toHaveLength(0);
    expect(s().dumpingPills).toHaveLength(0);
    expect(s().motorFwd).toBe(false);
    expect(s().motorRev).toBe(false);

    // 急停锁存：不复位直接按启动也不能跑，必须复位
    act(() => { s().setButton('start', true); });
    advance(1);
    expect(s().buttons.start).toBe(false);
    expect(s().autoPhase).toBe('idle');
    expect(s().demoPaused).toBe('estop');

    act(() => { s().setButton('reset', true); });
    advance(0.1);
    expect(s().demoPaused).toBe('none');
    expect(s().buttons).toEqual({
      start: false, stop: false, reset: false, estop: false, confirm: false,
    });
    expect(s().autoPhase).toBe('idle');
    expect(s().sliderX).toBeCloseTo(SLIDER_MIN_X, 6);
    expect(s().encoderPulses).toBe(0);

    act(() => { s().setButton('start', true); });
    advance(30);
    expect(s().autoPhase).toBe('wait_confirm');
    expect(s().autoCycle).toBe(0);
    expect(s().buttons.start).toBe(false);

    act(() => { s().setButton('confirm', true); });
    advance(0.1);
    expect(s().buttons.confirm).toBe(false);
    expect(s().autoCycle).toBe(1);
    expect(s().autoPhase).not.toBe('wait_confirm');

    advance(30);
    expect(s().autoPhase).toBe('wait_confirm');
    expect(s().buttons.confirm).toBe(false); // 进入等待时清残留，不自动连跑
    act(() => { s().setButton('confirm', true); });
    advance(0.1);
    expect(s().autoCycle).toBe(2);
    expect(s().autoPhase).not.toBe('wait_confirm');
  });

  it('resetAll 清掉 5 个主令电平与显式暂停态', () => {
    act(() => {
      s().setButton('start', true);
      s().setButton('stop', true);
      s().setButton('estop', true);
      s().setButton('reset', true);
      s().setButton('confirm', true);
      s().setDemoPaused('estop');
    });
    expect(Object.values(s().buttons).some(Boolean)).toBe(true);
    act(() => { s().resetAll(); });
    expect(s().buttons).toEqual({
      start: false, stop: false, reset: false, estop: false, confirm: false,
    });
    expect(s().demoPaused).toBe('none');
    expect(s().autoPhase).toBe('idle');
  });

  it('非 auto 模式不跑演示状态机，且持续跟踪 prevStart 不产生假上升沿', () => {
    useAppStore.getState().setMode('sim');
    act(() => { s().setButton('start', true); });
    advance(5);
    expect(s().autoPhase).toBe('idle');
    expect(s().autoCycle).toBe(0);
    // 非演示模式不消费主令（仿真输入由 PLC / 面板管理），流程也不推进
    expect(s().buttons.start).toBe(true);

    // 切回演示：prevStart 已在提前返回分支持续跟踪为 true，不产生假上升沿
    useAppStore.getState().setMode('auto');
    advance(1);
    expect(s().autoPhase).toBe('idle');
    expect(s().autoCycle).toBe(0);
    expect(s().buttons.start).toBe(false); // 残留电平被消费，但没有误启动

    // 松开后再次按下才产生真正上升沿，重新跑完整一轮
    singleRecipe();
    act(() => { s().setButton('start', true); });
    advance(30);
    expect(s().autoPhase).toBe('wait_confirm');
  });
});

describe('源码级防回退：主令脉冲、暂停态、优先级', () => {
  const loop = read('./scenes/auto-dispensing/hooks/useDispenseLoop.ts');
  const panel = read('./scenes/auto-dispensing/panels/DispenseDemoPanel.tsx');
  const store = read('./stores/useDispensingStore.ts');

  it('5 个主令面板只置位，状态机消费后立即置回 false', () => {
    (['start', 'stop', 'estop', 'reset', 'confirm'] as const).forEach((btn) => {
      expect(panel).toContain(`setButton('${btn}', true)`);
      expect(loop).toContain(`setButton('${btn}', false)`);
    });
  });

  it('复位判断在急停 / 停止守卫之前，非 auto 提前返回在状态机之前', () => {
    const guard = loop.indexOf('if (!autoMode)');
    const reset = loop.indexOf('if (s.buttons.reset)');
    const estop = loop.indexOf('if (s.buttons.estop)');
    const stop = loop.indexOf('if (s.buttons.stop &&');
    const startEdge = loop.indexOf('const startPressed = s.buttons.start && !r.prevStart');
    expect(guard).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(guard);
    expect(reset).toBeLessThan(estop);
    expect(estop).toBeLessThan(stop);
    expect(startEdge).toBeGreaterThan(guard);
    expect(loop.slice(guard, startEdge)).toContain('r.prevStart = s.buttons.start');
  });

  it('显式暂停态落在 store，resetAuto / resetAll 都会清掉', () => {
    expect(store).toContain("demoPaused: 'none' | 'stop' | 'estop'");
    const resetAutoBlock = store.slice(
      store.lastIndexOf('resetAuto: () =>'), store.lastIndexOf('resetAll: () =>'),
    );
    const resetBlock = store.slice(store.lastIndexOf('resetAll: () =>'));
    expect(resetAutoBlock).toContain("demoPaused: 'none'");
    expect(resetBlock).toContain("demoPaused: 'none'");
    expect(loop).toContain("setDemoPaused('stop')");
    expect(loop).toContain("setDemoPaused('estop')");
    expect(loop).toContain("demoPaused !== 'none'");
  });

  it('演示状态机仍只在 auto 运行，表现层插值三模式共用', () => {
    expect(loop).toContain("const autoMode = mode === 'auto'");
    expect(loop).toContain('r.dumpStarted && autoMode');
    expect(loop).toContain('plcMode || (!s.buttons.estop && !s.jogActive)');
  });
});

describe('P1-4 平台入口：有评分模式的设备必须挂载评分状态机', () => {
  const registry = read('../../platform/src/registry.ts');
  const deviceVars = [...registry.matchAll(/^\s*(\w+Device),?\s*$/gm)].map((m) => m[1]);
  const pkgOf: Record<string, string> = {
    conveyorDevice: 'conveyor-sorting',
    pneumaticDevice: 'pneumatic-robot',
    trafficLightDevice: 'traffic-light',
    dispensingDevice: 'auto-dispensing',
    md520VfdDevice: 'md520-vfd',
    inovanceGantryDevice: 'inovance-gantry',
  };
  const deviceIndex = (v: string) => read(`../../${pkgOf[v]}/src/index.ts`);

  it('注册表里的设备都能定位到自己的 index.ts，至少覆盖 traffic-light 与 conveyor-sorting', () => {
    expect(deviceVars).toContain('trafficLightDevice');
    expect(deviceVars).toContain('conveyorDevice');
    deviceVars.forEach((v) => expect(pkgOf[v]).toBeTruthy());
  });

  it('凡有评分模式的设备，评分 hook 都在平台入口挂载；traffic-light / conveyor-sorting 走 effects', () => {
    deviceVars.forEach((v) => {
      const index = deviceIndex(v);
      if (!/id:\s*'scoring'/.test(index)) return;
      const hasEffects = /\beffects:\s*\w+/.test(index);
      if (v === 'trafficLightDevice' || v === 'conveyorDevice') {
        expect(hasEffects).toBe(true);
        const effectsMatch = index.match(/effects:\s*(\w+)/);
        expect(effectsMatch).not.toBeNull();
      } else {
        // 评分 hook 挂在平台评分面板里（面板仅 scoring 模式渲染）也算已挂载
        const scoringPanel = read(`../../${pkgOf[v]}/src/platform/ScoringModePanel.tsx`);
        expect(/use\w*Scoring\(\)/.test(scoringPanel)).toBe(true);
      }
    });
  });

  it('trafficLightDevice 的 effects 指向评分 Gate，Gate 做了角色 / 模式 / 运行态门控', () => {
    expect(deviceIndex('trafficLightDevice')).toContain('effects: TrafficScoringGate');
    const gate = read('../../traffic-light/src/platform/TrafficScoringGate.tsx');
    expect(gate).toContain('useTrafficScoring()');
    expect(gate).toContain('useAppStore((s) => s.mode)');
    expect(gate).toContain('useTrafficStore((s) => s.isScoringRunning)');
    expect(gate).toContain('isViewerRuntime()');
    // hook 内部已有 mode / isScoringRunning 守卫，Gate 是外层门控而非重复实现
    const hook = read('../../traffic-light/src/scenes/traffic-light/hooks/useTrafficScoring.ts');
    expect(hook).toContain("if (mode !== 'scoring')");
    expect(hook).toContain('if (!isScoringRunning)');
    // 独立入口既有行为不动，也不新增 UI 文案
    const app = read('../../traffic-light/src/App.tsx');
    expect(app).toContain('function TrafficScoringGate()');
    expect(app).toContain('<TrafficScoringGate />');
  });
});
