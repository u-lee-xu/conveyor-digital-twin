/**
 * 交通灯包最小行为回归：此前该包无测试文件，`vitest --run` 直接以退出码 1 失败。
 * 这里只覆盖纯 store（不依赖 Three / DOM / PLC），评分状态机另由运行态验收覆盖。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTrafficStore, LAMP_KEYS } from './scenes/traffic-light/useTrafficStore';
import { TIMING_DEFAULTS } from './scenes/traffic-light/constants';

const S = () => useTrafficStore.getState();

beforeEach(() => {
  S().resetAll();
  S().resetTiming();
  useTrafficStore.setState({
    score: 0, scoringStatus: {}, scoringLog: [], passedItems: [],
    isScoringRunning: false, scoringComplete: false, scoringPrompt: '',
  });
});

describe('交通灯 store 最小行为回归', () => {
  it('六路灯与按钮初始全灭，setLamp / setButton 只改对应一路', () => {
    for (const k of LAMP_KEYS) expect(S().lamps[k]).toBe(false);
    S().setLamp('ew_green', true);
    expect(S().lamps.ew_green).toBe(true);
    expect(S().lamps.ns_green).toBe(false);
    S().setButton('estop', true);
    expect(S().buttons.estop).toBe(true);
    S().resetAll();
    expect(S().lamps.ew_green).toBe(false);
    expect(S().buttons.estop).toBe(false);
  });

  it('时序参数写入合法值并持久化，resetTiming 恢复默认', () => {
    S().setTiming({ ew: { greenSteady: 12 } });
    expect(S().timing.ew.greenSteady).toBe(12);
    // 本包 vitest 是 node 环境，localStorage 可能不存在；存在时顺带验证持久化
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('traffic-light-timing-params');
    if (stored) expect(JSON.parse(stored).ew.greenSteady).toBe(12);
    S().resetTiming();
    expect(S().timing.ew.greenSteady).toBe(TIMING_DEFAULTS.ew.greenSteady);
  });

  it('评分项只记一次，重复标记不重复加分', () => {
    S().setScoringRunning(true);
    expect(S().scoringComplete).toBe(false);
    S().markScoringItem('item-1', 'passed', '第一项', 10);
    expect(S().score).toBe(10);
    S().markScoringItem('item-1', 'passed', '第一项', 10);
    expect(S().score).toBe(10);
    expect(S().scoringLog).toHaveLength(1);
    S().markScoringItem('item-2', 'failed', '第二项', 20);
    expect(S().score).toBe(10);
    expect(S().scoringStatus['item-2']).toBe('failed');
  });
});
