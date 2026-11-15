import type { DeviceDefinition } from './types';
import { DEVICE_META } from './deviceMeta';
import { SCENE_DESCRIPTORS } from './deviceCatalog';

/**
 * 设备注册表（场景包自动发现 + 按设备懒加载）：
 *  - 启动器只读 deviceCatalog / deviceMeta，不引用本文件；
 *  - 场景清单来自各包 device.json，实现入口来自各包 src/device.ts；
 *  - 新增场景包不需要修改本文件：静态 glob 会把每个新包拆成独立 chunk，
 *    进入某个设备或观众跟随某个设备时才下载那一个实现；
 *  - 加载后仍逐项比对 device.json 与设备实现，元数据漂移立即报错。
 */
const implementations = import.meta.glob<{ device: DeviceDefinition }>('../../*/src/device.ts');

type DeviceLoader = () => Promise<DeviceDefinition>;

export const DEVICE_IDS: readonly string[] = SCENE_DESCRIPTORS.map((d) => d.id);
export type DeviceId = string;

/** 每个 id 对应一个独立 chunk；未被引用的场景实现不会进入当前分包 */
export const DEVICE_LOADERS: Record<string, DeviceLoader> = Object.fromEntries(
  SCENE_DESCRIPTORS.map((d) => {
    const key = `../../${d.pkg}/src/device.ts`;
    const load = implementations[key];
    if (!load) throw new Error(`场景包 ${d.pkg} 缺少 src/device.ts 统一入口`);
    return [d.id, () => load().then((m) => m.device)];
  }),
);

/** 已加载的设备缓存：同步查找只用于热切换，绝不在启动时预载 */
const loaded = new Map<string, DeviceDefinition>();

/** 元数据真值在设备实现里；自描述那份是副本，加载后逐项核对，漂移立即报错 */
function assertDeviceMeta(device: DeviceDefinition): void {
  const meta = DEVICE_META.find((m) => m.id === device.id);
  const same = meta
    && meta.name === device.name
    && meta.icon === device.icon
    && meta.gradient === device.gradient
    && meta.version === device.version
    && meta.description === device.description
    && meta.modeCount === device.modes.length
    && meta.protocols.length === device.protocols.length
    && meta.protocols.every((p, i) => p === device.protocols[i]);
  if (!same) throw new Error(`设备元数据与注册表不一致: ${device.id}`);
}

export function loadDevice(id: string): Promise<DeviceDefinition> {
  const cached = loaded.get(id);
  if (cached) return Promise.resolve(cached);
  const loader = (DEVICE_LOADERS as Record<string, DeviceLoader | undefined>)[id];
  if (!loader) return Promise.reject(new Error(`未知设备: ${id}`));
  return loader().then((device) => {
    assertDeviceMeta(device);
    loaded.set(id, device);
    return device;
  });
}

/** 同步查已加载设备；未加载时返回 undefined，由调用方走 loadDevice */
export function getDevice(id: string): DeviceDefinition | undefined {
  return loaded.get(id);
}
