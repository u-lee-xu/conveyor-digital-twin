/**
 * 启动器元数据兼容入口。
 *
 * 元数据不再手写：deviceCatalog.ts 通过 import.meta.glob 收集各场景包的
 * device.json，只把标量带进首屏；设备实现仍由 registry.ts 在进入工作区时
 * 按设备懒加载，并逐项核对实现与自描述元数据是否一致。
 */
export type { DeviceMeta } from './deviceCatalog';
export { DEVICE_META } from './deviceCatalog';
