/**
 * 仿真模式控制口径防回退自检（用户 2026-11-09 定稿）：
 * 「只有演示模式才是自己跑，仿真模式就只受 PLC 控制了」。
 *
 * 硬约束：
 *  1. useDispenseLoop 的演示状态机只在 mode==='auto' 运行；
 *     仿真 sim / 手动 manual 只保留表现层插值，不自动推进整轮流程。
 *  2. 仿真模式下电机正反转只认 PLC 输出回读，本地 estop 输入与手动点动
 *     标志不得干预；演示收尾不得主动回位翻转缸。
 *  3. 3D 姿态由仿真面板 readVars 回读的 PLC 输出线圈驱动。
 *  4. 手动 / 自动自锁按钮与 3D 旋钮同源：档位真值恒为本地 selectorAuto，
 *     点击当帧立即翻转；PLC 回读只做互锁校验，不反向覆盖本地档位。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const loop = read('./scenes/auto-dispensing/hooks/useDispenseLoop.ts');
const simPanel = read('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const cabinet = read('./scenes/auto-dispensing/components/ControlCabinet.tsx');
const simPlc = read('./services/simulationPlc.ts');
const app = read('./App.tsx');
const deviceIndex = read('./index.ts');
const physics = read('./scenes/auto-dispensing/diagnostics.ts');

describe('只有演示模式跑本地状态机', () => {
  it('循环从 useAppStore 读模式并分成 autoMode / plcMode', () => {
    expect(loop).toContain("import { useAppStore } from '../../../stores/useAppStore'");
    expect(loop).toContain("const autoMode = mode === 'auto'");
    expect(loop).toContain("const plcMode = mode === 'sim'");
  });

  it('状态机段之前有非演示模式提前返回，急停清场与启动沿都在守卫之后', () => {
    const guard = loop.indexOf('if (!autoMode)');
    const estopClear = loop.indexOf('if (s.buttons.estop)');
    const startEdge = loop.indexOf('const startPressed = s.buttons.start && !r.prevStart');
    expect(guard).toBeGreaterThan(-1);
    expect(estopClear).toBeGreaterThan(guard);
    expect(startEdge).toBeGreaterThan(guard);
  });

  it('提前返回分支持续跟踪启动电平，切回演示不产生假上升沿', () => {
    const guard = loop.indexOf('if (!autoMode)');
    const startEdge = loop.indexOf('const startPressed = s.buttons.start && !r.prevStart');
    expect(loop.slice(guard, startEdge)).toContain('r.prevStart = s.buttons.start');
  });

  it('仿真模式电机只认 PLC 输出，不被本地 estop / jogActive 干预', () => {
    expect(loop).toContain('plcMode || (!s.buttons.estop && !s.jogActive)');
  });

  it('倒药收尾不主动回位仿真模式的翻转缸', () => {
    expect(loop).toContain('r.dumpStarted && autoMode');
  });

  it('PLC 输出 → 模型仍由仿真面板回读驱动', () => {
    expect(simPanel).toContain("store.setMotor(!!v['MOTOR_FWD'], !!v['MOTOR_REV'])");
    expect(simPanel).toContain('resolveCylinderLevels(');
    expect(simPanel).toContain("store.setLamps({");
  });

  it('独立 App 与平台壳 effects 都挂同一个循环，改动不遗漏入口', () => {
    expect(app).toContain('useDispenseLoop()');
    expect(deviceIndex).toContain('useDispenseLoop()');
  });

  it('只读诊断接口暴露模式与电机电平，供 CDP 判定驱动源', () => {
    expect(physics).toContain('mode: useAppStore.getState().mode');
    expect(physics).toContain('motorFwd: s.motorFwd');
    expect(physics).toContain('motorRev: s.motorRev');
    expect(physics).toContain('selectorAuto: s.selectorAuto');
  });
});

describe('选择开关：本地即时、同源、互锁', () => {
  it('自锁按钮显示读本地 selectorAuto，不再等 300ms 回读', () => {
    expect(simPanel).toContain('const autoOn = selectorAuto');
    expect(simPanel).not.toContain('connected ? !!ioSignals[SELECTOR_IO.auto]');
  });

  it('点击读实时 store 档位，避免连点用渲染闭包旧值', () => {
    expect(simPanel).toContain('const next = !useDispensingStore.getState().selectorAuto');
  });

  it('UI / 3D / 上电同步共用 writeSimSelector 单一入口', () => {
    expect(simPlc).toContain('export function writeSimSelector');
    expect(simPlc).toContain('selectorIo(auto)');
    expect(simPanel).toContain('writeSimSelector(');
    expect(cabinet).toContain('writeSimSelector(next)');
    expect(simPanel).not.toContain('selectorIo(');
    expect(cabinet).not.toContain('selectorIo(');
  });

  it('PLC 回读只校验两档互锁，不反向覆盖本地档位', () => {
    expect(simPanel).toContain('!!v[SELECTOR_IO.manual] === !!v[SELECTOR_IO.auto]');
    expect(simPanel).toContain('selectorHealAtRef');
    expect(simPanel).not.toContain('setSelectorAuto(!!v[');
  });

  it('未连接 PLC 时只切本地旋钮，不写任何地址', () => {
    expect(simPlc).toContain('if (!plcService.connected) return Promise.resolve(NOT_CONNECTED)');
    expect(simPanel).toContain('if (!connected) return;');
  });
});
