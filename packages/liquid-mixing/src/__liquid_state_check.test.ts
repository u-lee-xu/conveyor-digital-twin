/**
 * 液体混装真值 / 状态机 / 快照自检。
 * 覆盖：去皮零位移、模拟量与开关量同源、演示一直循环、停止完成当前轮、
 * 正反转交替、禁止态保持、报警短路、急停、仿真不跑本地状态机、动作字边沿。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useLiquidStore, exportLiquidSnapshot, liquidRatioA } from './stores/useLiquidStore';
import {
  LIQUID_PHASE, LIQUID_ALARM, LIQUID_CAPACITY, LIQUID_PROCESS, LIQUID_TANKS, LIQUID_GEOM,
  liquidSensorStates, liquidLevelHeight, liquidLevelRatio, resolveStirDirection,
  liquidDisplay, LIQUID_EMPTY_OUTPUTS, liquidAlarmFlags,
} from './constants/liquidConstants';
import { liquidSensorBits, LIQUID_SENSOR_FEEDBACK, encodeAction, LIQUID_ACTION } from './constants/liquidVariables';

const S = () => useLiquidStore.getState();
/** 以 0.05s 帧推进，模拟浏览器 rAF */
const run = (frames: number) => { for (let i = 0; i < frames; i += 1) S().tick(0.05); };

beforeEach(() => {
  S().resetAll();
});

describe('去皮 / 零点语义（项目红线）', () => {
  it('设 0.0 点只写偏置，四罐体积 / 配方 / 阶段 / 轮次零位移', () => {
    const before = {
      volumes: { ...S().volumes }, recipe: { ...S().recipe },
      phase: S().phase, round: S().round, mixA: S().mixA, mixB: S().mixB,
    };
    S().tareTo('a', 0);
    S().tareTo('mix', 12.5);
    expect(S().volumes).toEqual(before.volumes);
    expect(S().recipe).toEqual(before.recipe);
    expect(S().phase).toBe(before.phase);
    expect(S().round).toBe(before.round);
    expect(S().mixA).toBe(before.mixA);
    expect(S().mixB).toBe(before.mixB);
    expect(S().tare.a).toBe(before.volumes.a);
    expect(S().tare.mix).toBe(before.volumes.mix - 12.5);
    expect(liquidDisplay('a', S().volumes, S().tare)).toBe(0);
    expect(liquidDisplay('mix', S().volumes, S().tare)).toBeCloseTo(12.5, 6);
  });

  it('resetTare 只清偏置，真值不动', () => {
    S().tareTo('b', 3);
    const v = { ...S().volumes };
    S().resetTare();
    expect(S().volumes).toEqual(v);
    expect(S().tare.b).toBe(0);
  });
});

describe('模拟量与开关量同源', () => {
  it('REAL 液位到 90% 触发上限、到 10% 触发下限，14 位布尔表同序', () => {
    const full = { a: 90, b: 90, mix: 108, product: 270 };
    const high = liquidSensorStates(full as never, LIQUID_EMPTY_OUTPUTS, 0);
    expect(high.aHigh && high.bHigh && high.mixHigh && high.productHigh).toBe(true);
    const low = liquidSensorStates({ a: 10, b: 10, mix: 12, product: 30 } as never, LIQUID_EMPTY_OUTPUTS, 0);
    expect(low.aLow && low.bLow && low.mixLow && low.productLow).toBe(true);
    expect(liquidSensorBits(high)).toHaveLength(LIQUID_SENSOR_FEEDBACK.length);
  });

  it('液面高度由 REAL 体积纯函数派生，零体积零高度、满量程满高度', () => {
    expect(liquidLevelHeight('a', 0)).toBe(0);
    expect(liquidLevelRatio('a', LIQUID_CAPACITY.a)).toBe(1);
    expect(liquidLevelHeight('a', 50)).toBeCloseTo(
      (LIQUID_TANKS.a.height - 2 * LIQUID_GEOM.LIQUID_GAP) * 0.5, 6,
    );
  });

  it('配比由 mixA / mixB 派生，组分全零时取中值', () => {
    expect(liquidRatioA(30, 20)).toBeCloseTo(0.6, 6);
    expect(liquidRatioA(0, 0)).toBe(0.5);
  });

  it('正反转同时有效属禁止态，保持上次方向', () => {
    expect(resolveStirDirection(true, true, 1)).toBe(1);
    expect(resolveStirDirection(true, true, -1)).toBe(-1);
    expect(resolveStirDirection(true, false, -1)).toBe(1);
    expect(resolveStirDirection(false, true, 1)).toBe(-1);
    expect(resolveStirDirection(false, false, 1)).toBe(0);
  });
});

describe('演示状态机：一直循环 / 完成当前循环再停 / 正反转交替', () => {
  it('启动后不按停止就一直循环，多轮不卡步', () => {
    S().startDemo();
    run(1400);
    expect(S().demoRunning).toBe(true);
    expect(S().round).toBeGreaterThanOrEqual(2);
    expect(S().alarm).toBe(0);
    expect(S().volumes.a).toBeGreaterThan(LIQUID_PROCESS.EPS);
  });

  it('走完一轮会依次经过 A 进料 → B 进料 → 正转 → 反转 → 出料 → 完成', () => {
    S().startDemo();
    const seen: number[] = [];
    for (let i = 0; i < 600; i += 1) {
      S().tick(0.05);
      const p = S().phase;
      if (seen[seen.length - 1] !== p) seen.push(p);
    }
    const order = [
      LIQUID_PHASE.FEED_A, LIQUID_PHASE.FEED_B,
      LIQUID_PHASE.STIR_FWD, LIQUID_PHASE.STIR_REV,
      LIQUID_PHASE.DISCHARGE, LIQUID_PHASE.DONE,
    ];
    for (const p of order) expect(seen).toContain(p);
    expect(seen.indexOf(LIQUID_PHASE.STIR_FWD)).toBeLessThan(seen.indexOf(LIQUID_PHASE.STIR_REV));
    expect(seen.indexOf(LIQUID_PHASE.FEED_A)).toBeLessThan(seen.indexOf(LIQUID_PHASE.FEED_B));
  });

  it('按停止只置标志，完成当前循环后才停，且不停在半程', () => {
    S().startDemo();
    run(120); // 落在本轮中段
    expect(S().demoRunning).toBe(true);
    const roundAtStop = S().round;
    S().requestStopDemo();
    expect(S().stopRequested).toBe(true);
    expect(S().demoRunning).toBe(true);
    run(600);
    expect(S().demoRunning).toBe(false);
    expect(S().stopRequested).toBe(false);
    expect(S().phase).toBe(LIQUID_PHASE.IDLE);
    expect(S().round).toBe(roundAtStop + 1);
    // 收尾后原液回补、成品转出，下一轮可随时启动
    expect(S().volumes.a).toBeGreaterThan(LIQUID_PROCESS.INITIAL_A - 0.5);
    expect(S().volumes.product).toBeLessThan(0.5);
  });

  it('暂停期间体积与阶段不推进', () => {
    S().startDemo();
    run(30);
    S().toggleDemoPause();
    const v = { ...S().volumes };
    const p = S().phase;
    run(60);
    expect(S().volumes).toEqual(v);
    expect(S().phase).toBe(p);
    S().toggleDemoPause();
    run(30);
    expect(S().volumes).not.toEqual(v);
  });
});

describe('报警 / 急停 / 仿真边界', () => {
  it('成品罐满与溢流触发报警并立即停机，全部执行器断电', () => {
    S().setOutput('valveA', true);
    S().setVolume('product', LIQUID_CAPACITY.product);
    S().tick(0.05);
    expect(S().alarm & LIQUID_ALARM.PRODUCT_FULL).toBeTruthy();
    expect(S().outputs).toEqual(LIQUID_EMPTY_OUTPUTS);
    expect(S().demoRunning).toBe(false);
    S().clearAlarm();
    expect(S().alarm).toBe(0);
  });

  it('空罐仍开进料阀触发低液位报警', () => {
    S().setVolume('a', 0);
    S().setOutput('valveA', true);
    expect(liquidAlarmFlags(S().volumes, S().outputs, false) & LIQUID_ALARM.LOW_LEVEL).toBeTruthy();
  });

  it('急停后 tick 不积分体积、搅拌不转', () => {
    S().setOutput('valveA', true);
    S().setEstop(true);
    const v = { ...S().volumes };
    const angle = S().agitatorAngle;
    run(40);
    expect(S().volumes).toEqual(v);
    expect(S().agitatorAngle).toBe(angle);
  });

  it('仿真模式不跑本地演示状态机，但 PLC 输出仍驱动流量积分', () => {
    S().startDemo();
    S().setControlSource('plc'); // 切到仿真后本地状态机停用
    run(60);
    expect(S().phase).toBe(LIQUID_PHASE.IDLE);
    const before = S().volumes.a;
    S().setPlcFrame({ outputs: { valveA: true } });
    run(20);
    expect(S().volumes.a).toBeLessThan(before);
    expect(S().volumes.mix).toBeGreaterThan(0);
  });

  it('显式动作字只在序号变化沿触发，重复电平不重复复位', () => {
    S().setVolume('a', 1);
    S().setPlcFrame({ actionWord: encodeAction(LIQUID_ACTION.RESET, 7) });
    expect(S().volumes.a).toBe(LIQUID_PROCESS.INITIAL_A);
    S().setVolume('a', 2);
    S().setPlcFrame({ actionWord: encodeAction(LIQUID_ACTION.RESET, 7) });
    expect(S().volumes.a).toBe(2); // 同一序号不重复触发
    S().setPlcFrame({ actionWord: encodeAction(LIQUID_ACTION.RESET, 8) });
    expect(S().volumes.a).toBe(LIQUID_PROCESS.INITIAL_A);
  });
});

describe('快照 / 观众只读镜像', () => {
  it('导出快照能把四罐 REAL 体积与去皮偏置完整镜像回来', () => {
    S().setVolume('a', 42.5);
    S().setVolume('mix', 7.25);
    S().tareTo('a', 0);
    const snap = exportLiquidSnapshot();
    S().resetAll();
    expect(S().volumes.a).not.toBe(42.5);
    S().applyBroadcast(snap);
    expect(S().volumes.a).toBeCloseTo(42.5, 3);
    expect(S().volumes.mix).toBeCloseTo(7.25, 3);
    expect(S().tare.a).toBeCloseTo(42.5, 3);
    expect(S().phase).toBe(LIQUID_PHASE.IDLE);
  });

  it('缺字段保留上次值，NaN / Infinity / 负数一律丢弃', () => {
    S().setVolume('b', 55);
    S().applyBroadcast({ LIQUID_B: NaN, LIQUID_A: Infinity, LIQUID_MIX: -1 });
    expect(S().volumes.b).toBe(55);
    expect(S().volumes.a).toBe(LIQUID_PROCESS.INITIAL_A);
    expect(S().volumes.mix).toBe(0);
  });

  it('快照键全为有限数值，掩码与 14 路开关量同源', () => {
    const snap = exportLiquidSnapshot();
    for (const [k, v] of Object.entries(snap)) {
      expect(Number.isFinite(v), `${k} 必须是有限数`).toBe(true);
    }
    expect(snap.LIQUID_SENSOR_MASK).toBeGreaterThanOrEqual(0);
    expect(snap.LIQUID_SENSOR_MASK).toBeLessThan(1 << LIQUID_SENSOR_FEEDBACK.length);
  });
});
