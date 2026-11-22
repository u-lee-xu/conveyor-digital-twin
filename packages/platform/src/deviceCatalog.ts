/**
 * 场景包自动发现：只读取各包的 device.json（纯标量），不引入任何设备实现。
 *
 * 导入一个新场景 = 在 packages/ 下放一个目录，提供：
 *   device.json        —— 自描述元数据（id 必须等于目录名，order 决定启动器顺序）
 *   src/device.ts      —— 统一入口，导出名为 device 的 DeviceDefinition
 * 平台壳的启动器元数据、注册表、alias、自检与验收脚本都从这里派生，无需改源码。
 */
import type { ProtocolType } from '@digital-twin/shared';

export interface DeviceMeta {
  id: string;
  name: string;
  icon: string;
  gradient: string;
  version: string;
  description: string;
  protocols: ProtocolType[];
  /** 设备 modes 数组长度，供启动器卡片显示 */
  modeCount: number;
}

/** 场景包自描述：除启动器元数据外，还声明构建与验收需要的能力标记 */
export interface SceneDescriptor extends DeviceMeta {
  /** 启动器卡片顺序；缺省排末尾 */
  order: number;
  /** 包目录名，由 device.json 所在路径推导，必须与 id 一致 */
  pkg: string;
  /** 是否依赖 Rapier / wasm（CDP 逐个进场景时用于断言） */
  hasPhysics: boolean;
  /** 是否依赖 shared 的 PLC 服务（首屏产物断言用于防回退） */
  needsPlcService: boolean;
  /** 设备定义在 src/index.ts 中的导出名，供 src/device.ts 统一转出 */
  exportName: string;
}

type SceneManifest = Omit<SceneDescriptor, 'pkg'>;

const manifests = import.meta.glob<SceneManifest>('../../*/device.json', {
  eager: true,
  import: 'default',
});

function packageOf(file: string): string {
  const parts = file.split('/');
  return parts[parts.length - 2] || '';
}

/**
 * 不合规的 device.json 不能静默消失：第三方包字段写错时，唯一症状会是「卡片不出现」，
 * 浏览器侧没有任何排错线索（Node 侧 device-catalog.cjs 会直接抛错，两边行为必须一致）。
 * 这里报出包目录与原因，返回值仍按原规则过滤，不改变已合规包的加载结果。
 */
function invalidReason(d: SceneDescriptor): string | null {
  if (typeof d.id !== 'string' || d.id === '') return '缺少字符串 id';
  if (d.id !== d.pkg) return `id(${d.id}) 与目录名(${d.pkg}) 不一致`;
  if (typeof d.name !== 'string' || d.name === '') return '缺少字符串 name';
  return null;
}

/** 按 order 排序，保持既有卡片顺序；仅收目录名与 id 一致、且字段完整的包 */
export const SCENE_DESCRIPTORS: readonly SceneDescriptor[] = Object.entries(manifests)
  .map(([file, meta]) => ({ ...meta, pkg: packageOf(file) }))
  .filter((d) => {
    const reason = invalidReason(d);
    if (reason === null) return true;
    console.error(`[deviceCatalog] 忽略场景包 ${d.pkg || '?'}：device.json ${reason}`);
    return false;
  })
  .sort((a, b) => (Number.isFinite(a.order) ? a.order : 999) - (Number.isFinite(b.order) ? b.order : 999));

/** 首屏只需要标量元数据；实现仍由 registry 按设备懒加载 */
export const DEVICE_META: readonly DeviceMeta[] = SCENE_DESCRIPTORS.map((d) => ({
  id: d.id,
  name: d.name,
  icon: d.icon,
  gradient: d.gradient,
  version: d.version,
  description: d.description,
  protocols: d.protocols,
  modeCount: d.modeCount,
}));
