import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/modbus-websocket', () => ({
  modbusService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    writeCoil: vi.fn(),
    readCoils: vi.fn(),
    getStatus: vi.fn(),
  },
  MODBUS_ADDRESSES: {
    START: 0, RESET: 1,
    FEED_CYLINDER_VALVE: 100, SORTING1_CYLINDER_VALVE: 101,
    SORTING2_CYLINDER_VALVE: 102, CONVEYOR: 103,
    SENSOR_FEED: 8, SENSOR_COLOR: 9, SENSOR_MATERIAL: 10,
    MAGNETIC_FEED_RETRACT: 2, MAGNETIC_FEED_EXTEND: 3,
    MAGNETIC_SORTING1_RETRACT: 4, MAGNETIC_SORTING1_EXTEND: 5,
    MAGNETIC_SORTING2_RETRACT: 6, MAGNETIC_SORTING2_EXTEND: 7,
  },
}));

import {
  SCORING_MODULES,
} from '../hooks/useConveyorScoring';

describe('SCORING_MODULES - 数据完整性验证', () => {

  describe('模块结构', () => {
    it('应该有4个评分模块', () => {
      expect(SCORING_MODULES).toHaveLength(4);
    });

    it('每个模块应有正确的ID格式', () => {
      SCORING_MODULES.forEach((m, i) => {
        expect(m.id).toBe(`M${i + 1}`);
      });
    });

    it('每个模块应有名称', () => {
      SCORING_MODULES.forEach(m => {
        expect(m.name).toBeTruthy();
        expect(typeof m.name).toBe('string');
      });
    });

    it('每个模块应至少有1个子模块', () => {
      SCORING_MODULES.forEach(m => {
        expect(m.subModules.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('分数完整性', () => {
    it('4个模块总分应为100分', () => {
      const total = SCORING_MODULES.reduce((sum, m) => sum + m.maxPoints, 0);
      expect(total).toBe(100);
    });

    it('每个模块的 maxPoints 应等于其所有评分项的分数之和', () => {
      SCORING_MODULES.forEach(m => {
        const itemsTotal = m.subModules
          .flatMap(sm => sm.items)
          .reduce((sum, item) => sum + item.points, 0);
        expect(itemsTotal).toBe(m.maxPoints);
      });
    });

    it('每个模块的 maxPoints 应为25分', () => {
      SCORING_MODULES.forEach(m => {
        expect(m.maxPoints).toBe(25);
      });
    });

    it('所有评分项的分数都应为正整数', () => {
      SCORING_MODULES.forEach(m => {
        m.subModules.forEach(sm => {
          sm.items.forEach(item => {
            expect(item.points).toBeGreaterThan(0);
            expect(Number.isInteger(item.points)).toBe(true);
          });
        });
      });
    });
  });

  describe('评分项ID唯一性', () => {
    it('所有评分项的ID应该唯一', () => {
      const allIds = SCORING_MODULES.flatMap(m =>
        m.subModules.flatMap(sm => sm.items.map(item => item.id))
      );
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('所有子模块的ID应该唯一', () => {
      const allSubModuleIds = SCORING_MODULES.flatMap(m =>
        m.subModules.map(sm => sm.id)
      );
      const uniqueIds = new Set(allSubModuleIds);
      expect(uniqueIds.size).toBe(allSubModuleIds.length);
    });
  });

  describe('前置子模块（prerequisite）', () => {
    it('每个模块应恰好有1个前置子模块', () => {
      SCORING_MODULES.forEach(m => {
        const prerequisites = m.subModules.filter(sm => sm.isPrerequisite);
        expect(prerequisites).toHaveLength(1);
      });
    });

    it('前置子模块应排在前面', () => {
      SCORING_MODULES.forEach(m => {
        const firstSubModule = m.subModules[0];
        expect(firstSubModule.isPrerequisite).toBe(true);
      });
    });
  });

  describe('评分项字段完整性', () => {
    it('每个评分项应有id、name、points、desc', () => {
      SCORING_MODULES.forEach(m => {
        m.subModules.forEach(sm => {
          sm.items.forEach(item => {
            expect(item.id).toBeTruthy();
            expect(item.name).toBeTruthy();
            expect(item.points).toBeGreaterThan(0);
            expect(item.desc).toBeTruthy();
          });
        });
      });
    });
  });

  describe('模块内容验证', () => {
    it('M1 复位测试应包含正确的评分项', () => {
      const m1 = SCORING_MODULES[0];
      expect(m1.id).toBe('M1');
      expect(m1.name).toContain('复位');

      const allItemIds = m1.subModules.flatMap(sm => sm.items.map(i => i.id));
      expect(allItemIds).toContain('m1_btn');
      expect(allItemIds).toContain('m1_feed_ctrl');
      expect(allItemIds).toContain('m1_feed_in');
    });

    it('M2 上料流程应包含正确的评分项', () => {
      const m2 = SCORING_MODULES[1];
      expect(m2.id).toBe('M2');
      expect(m2.name).toContain('上料');

      const allItemIds = m2.subModules.flatMap(sm => sm.items.map(i => i.id));
      expect(allItemIds).toContain('m2_btn');
      expect(allItemIds).toContain('m2_feed_ctrl');
    });

    it('M3 黑色分拣应包含正确的评分项', () => {
      const m3 = SCORING_MODULES[2];
      expect(m3.id).toBe('M3');
      expect(m3.name).toContain('黑色');

      const allItemIds = m3.subModules.flatMap(sm => sm.items.map(i => i.id));
      expect(allItemIds).toContain('m3_color');
      expect(allItemIds).toContain('m3_s1_ctrl');
    });

    it('M4 蓝色分拣应包含正确的评分项', () => {
      const m4 = SCORING_MODULES[3];
      expect(m4.id).toBe('M4');
      expect(m4.name).toContain('蓝色');

      const allItemIds = m4.subModules.flatMap(sm => sm.items.map(i => i.id));
      expect(allItemIds).toContain('m4_btn');
      expect(allItemIds).toContain('m4_s2_ctrl');
    });
  });

  describe('单电控电磁阀逻辑验证', () => {
    it('M1复位测试应检测控制信号下降沿（单电控失电=缩回）', () => {
      const m1 = SCORING_MODULES[0];
      const allItems = m1.subModules.flatMap(sm => sm.items);

      const feedCtrlItem = allItems.find(i => i.id === 'm1_feed_ctrl');
      expect(feedCtrlItem).toBeDefined();
      expect(feedCtrlItem!.name).toContain('单电控失电');

      const sort1CtrlItem = allItems.find(i => i.id === 'm1_s1_ctrl');
      expect(sort1CtrlItem).toBeDefined();
      expect(sort1CtrlItem!.name).toContain('单电控失电');

      const sort2CtrlItem = allItems.find(i => i.id === 'm1_s2_ctrl');
      expect(sort2CtrlItem).toBeDefined();
      expect(sort2CtrlItem!.name).toContain('单电控失电');
    });

    it('M2上料流程应检测控制信号上升沿（单电控得电=伸出）', () => {
      const m2 = SCORING_MODULES[1];
      const allItems = m2.subModules.flatMap(sm => sm.items);

      const feedCtrlItem = allItems.find(i => i.id === 'm2_feed_ctrl');
      expect(feedCtrlItem).toBeDefined();
      expect(feedCtrlItem!.name).toContain('伸出');
    });
  });

  describe('评分项总数', () => {
    it('应有合理数量的评分项（10-40项）', () => {
      const totalItems = SCORING_MODULES.flatMap(m =>
        m.subModules.flatMap(sm => sm.items)
      ).length;
      expect(totalItems).toBeGreaterThanOrEqual(10);
      expect(totalItems).toBeLessThanOrEqual(40);
    });
  });
});
