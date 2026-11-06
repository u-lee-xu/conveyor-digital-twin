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

// Types
export type { Mode } from './types';

// Hooks
export { useMobile } from './hooks/useMobile';
