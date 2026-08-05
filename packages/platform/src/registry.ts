import type { DeviceDefinition } from './types';
import { conveyorDevice } from '@digital-twin/conveyor-sorting';

/**
 * 设备注册表：平台统一外壳 + 设备插件列表。
 * 新增设备 = 新增一个包 + 在这里注册一行。
 */
export const devices: DeviceDefinition[] = [
  conveyorDevice,
];

export function getDevice(id: string): DeviceDefinition | undefined {
  return devices.find((device) => device.id === id);
}
