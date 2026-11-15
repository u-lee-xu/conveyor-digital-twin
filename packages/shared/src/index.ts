// UI Components
export { Button } from './components/ui/Button';
export { ModeSelector } from './components/ui/ModeSelector';
export { Panel } from './components/ui/Panel';
export { StatusIndicator } from './components/ui/StatusIndicator';
export { PlcConnectionPanel } from './components/ui/PlcConnectionPanel';
export type { PlcConnConfig } from './components/ui/PlcConnectionPanel';
export { HelpPanel } from './components/ui/HelpPanel';
export type { HelpContent, HelpStep, GuideCard, AddressTable, ProtocolGuide } from './components/ui/HelpPanel';

// 工业场景统一视觉令牌（配药 / 传送带共用）
export {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL,
  LABEL_COLORS, makeLabelColor,
} from './styles/industrialVisual';
export type { IndustrialLighting } from './styles/industrialVisual';

// Physics Scene
/**
 * 物理组件刻意不再从 barrel 导出：barrel 被所有设备包引用，静态导出
 * PhysicsScene / Ground 会把 Rapier 拉进每个设备分包。请走子路径：
 *   @digital-twin/shared/components/PhysicsScene
 *   @digital-twin/shared/components/Ground          纯视觉，无 Rapier
 *   @digital-twin/shared/components/PhysicsGround   带碰撞体
 */
export { GROUND_SIZE, GROUND_COLOR, GROUND_GRID_COLOR } from './components/Ground';
// Services
/**
 * PLC 服务刻意不再从 barrel 做值导出：barrel 被所有设备包引用，静态 re-export
 * 会把 modbus-websocket（含模块级实例）拉进每个设备分包，连不用 PLC 服务的
 * 设备也要下载执行。真实使用者请走子路径：
 *   @digital-twin/shared/services/modbus-websocket
 *   @digital-twin/shared/services/modbus
 */
export type { ProtocolType } from './services/modbus-websocket';
export {
  PLC_WS_PATH, RELAY_WS_PATH, PLC_WS_PORT, RELAY_WS_PORT,
  resolveWsUrl, plcWsUrl, relayWsUrl, canOpenPlcChannel,
} from './services/wsEndpoints';

// 跨设备画面适配（纯函数，桌面零回退）
export {
  DESIGN_ASPECT, MAX_ASPECT_FIT, aspectFitScale, fitCameraPosition,
  fitMaxDistance, renderPixelRatio,
} from './styles/aspectFit';

// Runtime（软件 = 主控 / 浏览器访问 = 观众，判据单一来源）
export { detectRuntimeRole, isTeacherRuntime, isViewerRuntime } from './runtime/runtimeRole';
export type { RuntimeRole } from './runtime/runtimeRole';
// 观众访问地址：运行时按当前 Host 与网卡表生成候选，不固化 IP
export {
  sameOriginViewerUrl, isLoopbackViewerUrl, rankViewerUrls, loadViewerUrls,
} from './runtime/labInfo';
export type { LabInfo, LabNetworkAddress } from './runtime/labInfo';

// Types
export type { Mode } from './types';
/** 场景包契约：单独开发场景包只需要依赖本契约，不依赖平台壳 */
export type { DeviceDefinition, PlatformModeDef, PlatformModeState } from './types/deviceContract';

// Hooks
export { useMobile } from './hooks/useMobile';

// 快照差分（主控 → 中继；Node 侧合并口径见 websocket-server/snapshot-diff.js）
export { diffSnapshot, sanitizeSnapshot, isSnapshotValue } from './sync/snapshotDiff';
export type { Snapshot, SnapshotDelta, SnapshotValue, SnapshotDeltaValue } from './sync/snapshotDiff';
export { patchChanged } from './sync/patchChanged';
