import { describe, it, expect, beforeEach } from 'vitest';
import { useDeviceStore } from './useDeviceStore';

describe('useDeviceStore - 基础功能', () => {
  beforeEach(() => {
    useDeviceStore.getState().reset();
  });

  it('应该能够启动和停止传送带', () => {
    const { startConveyor, stopConveyor } = useDeviceStore.getState();

    startConveyor();
    expect(useDeviceStore.getState().conveyorRunning).toBe(true);

    stopConveyor();
    expect(useDeviceStore.getState().conveyorRunning).toBe(false);
  });

  it('应该能够产生新物料', () => {
    const { spawnMaterial } = useDeviceStore.getState();

    spawnMaterial();
    const state = useDeviceStore.getState();
    expect(state.material.visible).toBe(true);
    expect(['blue', 'black']).toContain(state.material.color);
  });

  it('应该能够设置传感器状态', () => {
    const { setSensor } = useDeviceStore.getState();

    setSensor('feed', true);
    expect(useDeviceStore.getState().sensors.feed).toBe(true);
  });
});

describe('useDeviceStore - 评分功能', () => {
  beforeEach(() => {
    useDeviceStore.getState().reset();
    useDeviceStore.getState().resetScore();
  });

  describe('markScoringItem', () => {
    it('应该能标记评分项为 passed 并累加分数', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('test_item_1', 'passed', '测试项1', 5);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['test_item_1']).toBe('passed');
      expect(state.score).toBe(5);
      expect(state.scoringLog).toHaveLength(1);
      expect(state.scoringLog[0].status).toBe('passed');
      expect(state.scoringLog[0].points).toBe(5);
    });

    it('应该能标记评分项为 failed 且不加分', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('test_item_2', 'failed', '测试项2', 5);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['test_item_2']).toBe('failed');
      expect(state.score).toBe(0);
      expect(state.scoringLog).toHaveLength(1);
      expect(state.scoringLog[0].status).toBe('failed');
      expect(state.scoringLog[0].points).toBe(0);
    });

    it('应该能标记评分项为 skipped 且不加分', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('test_item_3', 'skipped', '测试项3', 5);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['test_item_3']).toBe('skipped');
      expect(state.score).toBe(0);
    });

    it('同一评分项不应被重复标记（幂等性）', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('test_item_dup', 'passed', '重复项', 5);
      markScoringItem('test_item_dup', 'failed', '重复项-失败', 5);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['test_item_dup']).toBe('passed');
      expect(state.score).toBe(5);
      expect(state.scoringLog).toHaveLength(1);
    });

    it('pending 状态的评分项可以被覆盖', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('test_item_pending', 'pending', '待定项', 5);
      markScoringItem('test_item_pending', 'passed', '待定项-通过', 5);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['test_item_pending']).toBe('passed');
      expect(state.score).toBe(5);
    });

    it('分数累加不应超过100分', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('item_a', 'passed', '项A', 60);
      markScoringItem('item_b', 'passed', '项B', 50);

      const state = useDeviceStore.getState();
      expect(state.score).toBe(100);
    });

    it('passed 项应添加到 passedItems 列表', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('item_pass', 'passed', '通过项', 10);

      const state = useDeviceStore.getState();
      expect(state.passedItems).toHaveLength(1);
      expect(state.passedItems[0].message).toBe('通过项');
      expect(state.passedItems[0].points).toBe(10);
    });

    it('failed 项不应添加到 passedItems 列表', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('item_fail', 'failed', '失败项', 10);

      const state = useDeviceStore.getState();
      expect(state.passedItems).toHaveLength(0);
    });

    it('多个评分项应正确累加', () => {
      const { markScoringItem } = useDeviceStore.getState();

      markScoringItem('multi_1', 'passed', '多项1', 2);
      markScoringItem('multi_2', 'passed', '多项2', 4);
      markScoringItem('multi_3', 'failed', '多项3', 3);
      markScoringItem('multi_4', 'passed', '多项4', 1);

      const state = useDeviceStore.getState();
      expect(state.score).toBe(7);
      expect(state.scoringLog).toHaveLength(4);
      expect(state.passedItems).toHaveLength(3);
    });
  });

  describe('markItemsSkipped', () => {
    it('应该能批量标记评分项为 skipped', () => {
      const { markItemsSkipped } = useDeviceStore.getState();

      markItemsSkipped([
        { itemId: 'skip_1', label: '跳过项1', points: 5 },
        { itemId: 'skip_2', label: '跳过项2', points: 3 },
      ]);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['skip_1']).toBe('skipped');
      expect(state.scoringStatus['skip_2']).toBe('skipped');
      expect(state.score).toBe(0);
      expect(state.scoringLog).toHaveLength(2);
    });

    it('已标记的评分项不应被覆盖为 skipped', () => {
      const { markScoringItem, markItemsSkipped } = useDeviceStore.getState();

      markScoringItem('already_passed', 'passed', '已通过项', 5);

      markItemsSkipped([
        { itemId: 'already_passed', label: '已通过项-跳过', points: 5 },
        { itemId: 'new_skip', label: '新跳过项', points: 3 },
      ]);

      const state = useDeviceStore.getState();
      expect(state.scoringStatus['already_passed']).toBe('passed');
      expect(state.scoringStatus['new_skip']).toBe('skipped');
      expect(state.score).toBe(5);
    });
  });

  describe('resetScore', () => {
    it('应该重置所有评分状态', () => {
      const store = useDeviceStore.getState();

      store.markScoringItem('reset_test', 'passed', '重置测试', 10);
      expect(useDeviceStore.getState().score).toBe(10);

      useDeviceStore.getState().resetScore();

      const state = useDeviceStore.getState();
      expect(state.score).toBe(0);
      expect(state.scoringStatus).toEqual({});
      expect(state.scoringLog).toEqual([]);
      expect(state.passedItems).toEqual([]);
      expect(state.scoringPrompt).toBe('');
    });
  });

  describe('setScoringPrompt', () => {
    it('应该能设置评分提示', () => {
      const { setScoringPrompt } = useDeviceStore.getState();

      setScoringPrompt('请点击复位按钮');

      const state = useDeviceStore.getState();
      expect(state.scoringPrompt).toBe('请点击复位按钮');
    });
  });

  describe('addPassedItem', () => {
    it('应该能添加通过项并累加分数', () => {
      const { addPassedItem } = useDeviceStore.getState();

      addPassedItem('手动通过项', 8);

      const state = useDeviceStore.getState();
      expect(state.passedItems).toHaveLength(1);
      expect(state.score).toBe(8);
    });

    it('重复消息不应被添加', () => {
      const { addPassedItem } = useDeviceStore.getState();

      addPassedItem('重复消息', 5);
      addPassedItem('重复消息', 5);

      const state = useDeviceStore.getState();
      expect(state.passedItems).toHaveLength(1);
      expect(state.score).toBe(5);
    });
  });

  describe('setScoringRunning', () => {
    it('应该能设置评分运行状态', () => {
      const { setScoringRunning } = useDeviceStore.getState();

      setScoringRunning(true);
      expect(useDeviceStore.getState().isScoringRunning).toBe(true);

      setScoringRunning(false);
      expect(useDeviceStore.getState().isScoringRunning).toBe(false);
    });
  });

  describe('Trace 录制', () => {
    it('应该能录制线圈状态轨迹', () => {
      const store = useDeviceStore.getState();
      store.startRecording();
      store.addTraceEntry([true, false, true]);
      store.addTraceEntry([false, true, false]);
      store.stopRecording();

      const state = useDeviceStore.getState();
      expect(state.recordedTrace).toHaveLength(2);
      expect(state.recordedTrace[0].coils).toEqual([true, false, true]);
      expect(state.recordedTrace[1].coils).toEqual([false, true, false]);
    });

    it('评分运行时也应能录制轨迹', () => {
      const store = useDeviceStore.getState();
      store.setScoringRunning(true);
      store.addTraceEntry([true, false]);
      store.addTraceEntry([false, true]);

      const state = useDeviceStore.getState();
      expect(state.recordedTrace).toHaveLength(2);
    });

    it('clearTrace 应清空轨迹', () => {
      const store = useDeviceStore.getState();
      store.startRecording();
      store.addTraceEntry([true]);
      store.clearTrace();

      expect(useDeviceStore.getState().recordedTrace).toHaveLength(0);
    });
  });

  describe('纯累加制评分完整性', () => {
    it('只有 passed 状态才加分，failed/skipped 不扣分', () => {
      const store = useDeviceStore.getState();

      store.markScoringItem('acc_pass', 'passed', '通过', 10);
      store.markScoringItem('acc_fail', 'failed', '失败', 10);
      store.markScoringItem('acc_skip', 'skipped', '跳过', 10);

      expect(useDeviceStore.getState().score).toBe(10);
    });

    it('分数从0开始，不会变为负数', () => {
      const store = useDeviceStore.getState();

      store.markScoringItem('neg_test', 'failed', '失败', 100);

      expect(useDeviceStore.getState().score).toBe(0);
    });
  });
});
