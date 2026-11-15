/**
 * 设备清单单一来源（P2-2）：把「启动器元数据 / 注册表 ID / 每设备 loader / 设备真值」
 * 四份数据做双向比对，替代原来只查源码字样的恒真断言。
 * registry.ts 的 DEVICE_LOADERS 只是惰性函数，加载本测试不会拉起任何设备实现。
 */
import { describe, it, expect } from 'vitest';
import { DEVICE_IDS, DEVICE_LOADERS, loadDevice, getDevice } from '../../platform/src/registry';
import { DEVICE_META } from '../../platform/src/deviceMeta';
import { SCENE_DESCRIPTORS } from '../../platform/src/deviceCatalog';

// 不用 import 'node:fs'：该包 vite 配置会把 node:fs 映射到 electron renderer 的 fs shim
const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('设备清单单一来源', () => {
  it('DEVICE_META / DEVICE_IDS / DEVICE_LOADERS 的 id 集合与顺序完全一致', () => {
    expect(DEVICE_META.map((m) => m.id)).toEqual([...DEVICE_IDS]);
    expect(Object.keys(DEVICE_LOADERS)).toEqual([...DEVICE_IDS]);
  });

  it('每个自描述场景包 index.ts 的 id 与注册表逐项一致', () => {
    const pkgs = SCENE_DESCRIPTORS.map((s) => s.pkg);
    const ids = pkgs.map((p) => {
      const m = read(`../../${p}/src/index.ts`).match(/^\s*id:\s*'([^']+)',/m);
      return m ? m[1] : null;
    });
    expect(ids).toEqual([...DEVICE_IDS]);
  });

  it('场景包契约完整：device.json 与 src/device.ts 成对且导出名一致', () => {
    for (const s of SCENE_DESCRIPTORS) {
      expect(s.id).toBe(s.pkg);
      expect(s.exportName).toBeTruthy();
      expect(Number.isFinite(s.order)).toBe(true);
      expect(read(`../../${s.pkg}/src/device.ts`)).toContain(s.exportName);
    }
    expect(SCENE_DESCRIPTORS.length).toBeGreaterThan(0);
  });

  it('未知设备明确拒绝，缓存为空时不返回陈旧定义', async () => {
    await expect(loadDevice('__unknown_device__')).rejects.toThrow(/未知设备/);
    expect(getDevice('__unknown_device__')).toBeUndefined();
  });
});
