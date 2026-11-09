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
export { PhysicsScene } from './components/PhysicsScene';
export { Ground, PhysicsGround, GROUND_SIZE, GROUND_COLOR, GROUND_GRID_COLOR } from './components/Ground';
// Services
export { modbusService } from './services/modbus-websocket';
export type { ProtocolType } from './services/modbus-websocket';
export { MODBUS_ADDRESSES, MODBUS_CONFIG, useModbusService } from './services/modbus';
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

// Hooks
export { useMobile } from './hooks/useMobile';
