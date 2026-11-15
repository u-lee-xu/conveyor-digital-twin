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
  liquidDisplay, LIQUID_EMPTY_OUTPUTS, liquidAlarmFlags, LIQUID_VISUAL, LIQUID_VIEW_PRESETS,
  LIQUID_INITIAL_COMPONENTS, liquidMixColor, liquidMixBandColors, liquidStratification, liquidSwirlStrength,
  liquidBlendColor, liquidProductColor, liquidMixStratification, liquidPairPresence,
  liquidValveStateColor, clampUniformity, mixHexColor,
} from './constants/liquidConstants';
import { liquidSensorBits, LIQUID_SENSOR_FEEDBACK, encodeAction, LIQUID_ACTION, liquidSensorHintRow } from './constants/liquidVariables';

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

  it('暂停期间阶段计时冻结，恢复后从原计时继续而不跳阶段', () => {
    S().startDemo();
    run(10);
    const elapsed = S().phaseElapsed;
    const phase = S().phase;
    S().toggleDemoPause();
    run(60);
    expect(S().phaseElapsed).toBe(elapsed);
    expect(S().phase).toBe(phase);
    S().toggleDemoPause();
    run(1);
    expect(S().phaseElapsed).toBeGreaterThan(elapsed);
  });

  it('配方非法输入不污染演示状态机：NaN 保留、负值归零、超量程钳位', () => {
    const before = { ...S().recipe };
    S().setRecipe({
      targetA: Number.NaN, targetB: -20,
      stirForwardSec: Number.POSITIVE_INFINITY, stirReverseSec: 999,
    });
    expect(S().recipe.targetA).toBe(before.targetA);
    expect(S().recipe.targetB).toBe(0);
    expect(S().recipe.stirForwardSec).toBe(before.stirForwardSec);
    expect(S().recipe.stirReverseSec).toBe(60);
    S().setRecipe({ targetA: 40, stirForwardSec: 5 });
    expect(S().recipe.targetA).toBe(40);
    expect(S().recipe.stirForwardSec).toBe(5);
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

  it('报警条件自我消除后仍锁存，直到显式复位', () => {
    S().setVolume('a', 0);
    S().setOutput('valveA', true);
    S().tick(0.05);
    expect(S().alarm & LIQUID_ALARM.LOW_LEVEL).toBeTruthy();
    // 报警停机把阀断电后，低液位判据不再成立；锁存必须让报警继续显示
    run(20);
    expect(S().alarm & LIQUID_ALARM.LOW_LEVEL).toBeTruthy();
    S().clearAlarm();
    expect(S().alarm).toBe(0);
  });

  it('急停写入 estop 后报警含 ESTOP 位，复位链路可解除', () => {
    S().setEstop(true);
    S().tick(0.05);
    expect(S().estop).toBe(true);
    expect(S().alarm & LIQUID_ALARM.ESTOP).toBeTruthy();
    S().clearAlarm();
    expect(S().estop).toBe(false);
    expect(S().alarm).toBe(0);
  });

  it('PLC 帧缺字段时配方与动作字边沿保持上次值', () => {
    S().setPlcFrame({ recipeA: 300, actionWord: 2011 });
    const recipe = { ...S().recipe };
    const seq = S().actionSeq;
    S().setPlcFrame({});
    expect(S().recipe).toEqual(recipe);
    expect(S().actionSeq).toBe(seq);
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

describe('搅拌可视化四层：混合均匀度真值（纯本地教学量）', () => {
  it('正转推进、反转同样推进，角度随方向反号，停机保持且不超 1', () => {
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(20); // 1s
    const fwd = S().mixUniformity;
    const angleFwd = S().agitatorAngle;
    expect(fwd).toBeGreaterThan(0);
    expect(angleFwd).toBeGreaterThan(0);
    S().setOutputs({ stirForward: false, stirReverse: true });
    run(20);
    expect(S().mixUniformity).toBeGreaterThan(fwd);
    expect(S().agitatorAngle).toBeLessThan(angleFwd);
    const reached = S().mixUniformity;
    S().setOutput('stirReverse', false);
    run(30);
    expect(S().mixUniformity).toBe(reached);
    S().setOutput('stirForward', true);
    run(600);
    expect(S().mixUniformity).toBe(1);
  });

  it('正反转同时有效属禁止态：不积分均匀度、桨叶不转', () => {
    S().setVolume('mix', 40);
    S().setOutputs({ stirForward: true, stirReverse: true });
    const before = S().mixUniformity;
    const angle = S().agitatorAngle;
    run(40);
    // 展示初值不是 0，禁止态的语义是「保持原值不推进」，不是「归零」
    expect(S().mixUniformity).toBe(before);
    expect(S().agitatorAngle).toBe(angle);
  });

  it('演示暂停 / 急停冻结均匀度，恢复后从原值继续', () => {
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(20);
    const before = S().mixUniformity;
    S().startDemo();
    S().toggleDemoPause();
    S().setOutput('stirForward', true);
    run(40);
    expect(S().mixUniformity).toBe(before);
    S().toggleDemoPause();
    S().stopDemo();
    S().setOutput('stirForward', true);
    run(10);
    expect(S().mixUniformity).toBeGreaterThan(before);
    S().setEstop(true);
    const held = S().mixUniformity;
    run(40);
    expect(S().mixUniformity).toBe(held);
  });

  it('新进原液按质量占比稀释均匀度，排空归零', () => {
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(60); // 3s → 0.51
    const before = S().mixUniformity;
    expect(before).toBeGreaterThan(0.4);
    S().setOutputs({ stirForward: false, valveA: true });
    run(20); // 1s × 12 L/s = 12 L 新 A 液
    const afterFeed = S().volumes.mix;
    expect(S().mixUniformity).toBeCloseTo(before * 40 / afterFeed, 6);
    expect(S().mixUniformity).toBeLessThan(before);
    S().setVolume('mix', 0);
    expect(S().mixUniformity).toBe(0);
  });

  it('复位与动作字复位回到展示初值，停机不清（保持当前值）', () => {
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(20);
    S().stopDemo();
    expect(S().mixUniformity).toBeGreaterThan(0);
    // 初始展示态与「全部复位 / PLC RESET」是同一个状态，语义才自洽
    S().setPlcFrame({ actionWord: encodeAction(LIQUID_ACTION.RESET, 3) });
    expect(S().mixUniformity).toBe(LIQUID_PROCESS.INITIAL_UNIFORMITY);
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(20);
    expect(S().mixUniformity).toBeGreaterThan(0);
    S().resetAll();
    expect(S().mixUniformity).toBe(LIQUID_PROCESS.INITIAL_UNIFORMITY);
  });

  it('快照与观众镜像成对：均匀度可导出、可回放、越界与 NaN 被守卫', () => {
    S().setVolume('mix', 40);
    S().setOutput('stirForward', true);
    run(20);
    const snap = exportLiquidSnapshot();
    expect(snap.LIQUID_UNIFORMITY).toBeCloseTo(S().mixUniformity, 3);
    S().resetAll();
    S().applyBroadcast(snap);
    expect(S().mixUniformity).toBeCloseTo(snap.LIQUID_UNIFORMITY, 3);
    S().applyBroadcast({ LIQUID_UNIFORMITY: 5 });
    expect(S().mixUniformity).toBe(1);
    S().applyBroadcast({ LIQUID_UNIFORMITY: NaN });
    expect(S().mixUniformity).toBe(1);
  });
});

describe('搅拌可视化四层：颜色 / 涡流 / 机位纯函数', () => {
  it('混合色按 B 液占比插值，A 越多越蓝而不是越橙', () => {
    expect(liquidMixColor(30, 0)).toBe(LIQUID_VISUAL.LIQUID_A);
    expect(liquidMixColor(0, 20)).toBe(LIQUID_VISUAL.LIQUID_B);
    expect(mixHexColor(LIQUID_VISUAL.LIQUID_A, LIQUID_VISUAL.LIQUID_B, 0)).toBe(LIQUID_VISUAL.LIQUID_A);
    expect(mixHexColor(LIQUID_VISUAL.LIQUID_A, LIQUID_VISUAL.LIQUID_B, 1)).toBe(LIQUID_VISUAL.LIQUID_B);
    expect(liquidMixColor(30, 20)).not.toBe(liquidMixColor(20, 30));
  });

  it('分层色带：未混合时上下异色，搅匀后收敛到混合色', () => {
    const [lo0, up0] = liquidMixBandColors(0, 30, 20);
    const [lo1, up1] = liquidMixBandColors(1, 30, 20);
    expect(lo0).not.toBe(up0);
    expect(lo1).toBe(up1);
    expect(lo1).toBe(liquidBlendColor(30, 20));
    // 蓝橙直接插值会发灰，搅匀目标色要明显偏紫，避免「搅完变透明」的观感
    expect(liquidBlendColor(30, 20)).not.toBe(liquidMixColor(30, 20));
    // 只有 A 液时不凭空画出 B 色分层
    const [onlyA0, onlyA1] = liquidMixBandColors(0, 30, 0);
    expect(onlyA0).toBe(onlyA1);
    expect(onlyA0).toBe(LIQUID_VISUAL.LIQUID_A);
    expect(liquidStratification(0)).toBe(1);
    expect(liquidStratification(1)).toBe(0);
    expect(clampUniformity(9)).toBe(1);
    expect(clampUniformity(Number.NaN)).toBe(0);
  });

  it('分层带高度随均匀度归零：搅匀后只剩一根连续液柱，不再有两层', () => {
    expect(liquidPairPresence(30, 20)).toBeCloseTo(0.8, 6);
    expect(liquidPairPresence(30, 0)).toBe(0);
    // 未搅拌且两组分齐备 → 分层带占半高；搅到 1 → 归零
    expect(liquidMixStratification(0, 30, 30)).toBe(1);
    expect(liquidMixStratification(1, 30, 20)).toBe(0);
    expect(liquidMixStratification(0, 30, 0)).toBe(0);
    const heights = [0, 0.25, 0.5, 0.75, 1].map((u) => liquidMixStratification(u, 30, 30));
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]).toBeLessThan(heights[i - 1]);
  });

  it('停机无涡流，搅拌时涡流强度随方向保留且落在 0..1', () => {
    expect(liquidSwirlStrength(0.5, 0)).toBe(0);
    expect(liquidSwirlStrength(0.5, 1)).toBeGreaterThan(0);
    expect(liquidSwirlStrength(0.5, -1)).toBe(liquidSwirlStrength(0.5, 1));
    expect(liquidSwirlStrength(1, 1)).toBeLessThanOrEqual(1);
  });

  it('机位预设含低角度「搅拌观察」，且六项都有完整位姿', () => {
    expect(Object.keys(LIQUID_VIEW_PRESETS)).toHaveLength(6);
    expect(LIQUID_VIEW_PRESETS.stir.label).toBe('搅拌观察');
    for (const v of Object.values(LIQUID_VIEW_PRESETS)) {
      expect(v.position).toHaveLength(3);
      expect(v.target).toHaveLength(3);
    }
  });
});

describe('成品罐颜色与混合后的液体同源', () => {
  /** 造一批已搅匀的混合液，再出料到成品罐 */
  const feedAndStir = () => {
    S().resetAll();
    useLiquidStore.setState({
      volumes: { a: 80, b: 80, mix: 50, product: 0 },
      mixA: 30, mixB: 20, mixUniformity: 1,
      // 展示初值里成品罐已有组分，造批时必须显式清零，否则「组分和 = 体积」不成立
      productA: 0, productB: 0,
    });
  };

  it('成品色由与混合色相同的纯函数派生，空罐回退到混合紫', () => {
    expect(liquidProductColor(30, 20)).toBe(liquidBlendColor(30, 20));
    expect(liquidProductColor(20, 30)).toBe(liquidBlendColor(20, 30));
    expect(liquidProductColor(0, 0)).toBe(LIQUID_VISUAL.LIQUID_MIX);
    // 两罐都空 / 混合罐刚排空的循环间隙也必须同色，不能让空罐灰褐色破坏同源
    expect(liquidBlendColor(0, 0)).toBe(liquidProductColor(0, 0));
    expect(liquidBlendColor(Number.NaN, 0)).toBe(LIQUID_VISUAL.LIQUID_MIX);
    expect(liquidProductColor(Number.NaN, 5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('出料时 A/B 组分随体积同比例转移，成品色与搅匀色完全一致', () => {
    feedAndStir();
    const mixed = liquidBlendColor(S().mixA, S().mixB);
    S().setOutput('discharge', true);
    run(20); // 1s × 15 L/s = 15 L 转入成品罐
    S().setOutput('discharge', false);
    expect(S().volumes.product).toBeGreaterThan(0);
    expect(S().productA + S().productB).toBeCloseTo(S().volumes.product, 3);
    expect(S().productA / (S().productA + S().productB)).toBeCloseTo(0.6, 3);
    expect(liquidProductColor(S().productA, S().productB)).toBe(mixed);
  });

  it('混合罐排空后组分归零，不把残量带进下一批', () => {
    feedAndStir();
    S().setOutput('discharge', true);
    run(400); // 足够把 50 L 全部转入成品罐
    S().setOutput('discharge', false);
    expect(S().volumes.mix).toBeLessThanOrEqual(LIQUID_PROCESS.EPS);
    expect(S().mixA).toBe(0);
    expect(S().mixB).toBe(0);
    expect(liquidProductColor(S().productA, S().productB))
      .toBe(liquidBlendColor(30, 20));
  });

  it('成品组分进快照 / 观众镜像，复位回到展示初值、排空清零', () => {
    feedAndStir();
    S().setOutput('discharge', true);
    run(20);
    S().setOutput('discharge', false);
    const color = liquidProductColor(S().productA, S().productB);
    const snap = exportLiquidSnapshot();
    expect(snap.LIQUID_PRODUCT_A).toBeCloseTo(S().productA, 3);
    expect(snap.LIQUID_PRODUCT_B).toBeCloseTo(S().productB, 3);
    S().resetAll();
    expect(S().productA).toBe(LIQUID_INITIAL_COMPONENTS.productA);
    expect(S().productB).toBe(LIQUID_INITIAL_COMPONENTS.productB);
    S().applyBroadcast(snap);
    expect(liquidProductColor(S().productA, S().productB)).toBe(color);
    S().setVolume('product', 0);
    expect(S().productA).toBe(0);
    expect(S().productB).toBe(0);
    expect(liquidProductColor(S().productA, S().productB)).toBe(LIQUID_VISUAL.LIQUID_MIX);
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
    expect(S().volumes.mix).toBe(LIQUID_PROCESS.INITIAL_MIX);
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

describe('面板地址浮框数据源', () => {
  it('14 路开关量逐路给出三协议地址，与回写表同源', () => {
    for (const r of LIQUID_SENSOR_FEEDBACK) {
      const rows = liquidSensorHintRow(r.key);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        label: r.signal, mitsubishi: r.mitsubishi, modbus: `C${r.modbus}`, s7: r.s7,
      });
    }
  });

  it('未知开关量键立即报错，不静默给出空地址', () => {
    expect(() => liquidSensorHintRow('NOT_EXIST')).toThrow(/缺少信号/);
  });
});

describe('阀门开关状态色与真值同源', () => {
  it('开绿关红，且与共享工业灯色令牌完全一致', () => {
    expect(liquidValveStateColor(true)).toBe(LIQUID_VISUAL.LAMP_GREEN);
    expect(liquidValveStateColor(false)).toBe(LIQUID_VISUAL.LAMP_RED);
    expect(liquidValveStateColor(true)).not.toBe(liquidValveStateColor(false));
  });

  it('颜色只由 outputs 派生：快照与观众镜像天然同源，无需新增快照键', () => {
    S().resetAll();
    expect(exportLiquidSnapshot().LIQUID_VALVE_A).toBe(0);
    expect(liquidValveStateColor(S().outputs.valveA)).toBe(LIQUID_VISUAL.LAMP_RED);

    S().setOutput('valveA', true);
    expect(exportLiquidSnapshot().LIQUID_VALVE_A).toBe(1);
    expect(liquidValveStateColor(S().outputs.valveA)).toBe(LIQUID_VISUAL.LAMP_GREEN);

    // 观众端还原 0 后立刻回到关态红，颜色不会与真值脱节
    S().applyBroadcast({ LIQUID_VALVE_A: 0 });
    expect(S().outputs.valveA).toBe(false);
    expect(liquidValveStateColor(S().outputs.valveA)).toBe(LIQUID_VISUAL.LAMP_RED);

    S().applyBroadcast({ LIQUID_VALVE_A: 1 });
    expect(S().outputs.valveA).toBe(true);
    expect(liquidValveStateColor(S().outputs.valveA)).toBe(LIQUID_VISUAL.LAMP_GREEN);
  });

  it('三个阀门状态互不影响，可分别开 / 关', () => {
    S().resetAll();
    S().setOutput('valveA', true);
    S().setOutput('discharge', true);
    expect(liquidValveStateColor(S().outputs.valveA)).toBe(LIQUID_VISUAL.LAMP_GREEN);
    expect(liquidValveStateColor(S().outputs.valveB)).toBe(LIQUID_VISUAL.LAMP_RED);
    expect(liquidValveStateColor(S().outputs.discharge)).toBe(LIQUID_VISUAL.LAMP_GREEN);
    const snap = exportLiquidSnapshot();
    expect([snap.LIQUID_VALVE_A, snap.LIQUID_VALVE_B, snap.LIQUID_DISCHARGE]).toEqual([1, 0, 1]);
  });
});

describe('rAF 写入守卫', () => {
  it('静止期 tick 不产生新 store 引用，阀门打开后液面照常推进', () => {
    const before = S();
    before.tick(0.05);
    expect(S().volumes).toBe(before.volumes);
    expect(S().sensors).toBe(before.sensors);

    useLiquidStore.setState({ outputs: { ...LIQUID_EMPTY_OUTPUTS, valveA: true } });
    const flowing = S();
    flowing.tick(0.05);
    expect(S().volumes.a).toBeLessThan(flowing.volumes.a);
  });
});
