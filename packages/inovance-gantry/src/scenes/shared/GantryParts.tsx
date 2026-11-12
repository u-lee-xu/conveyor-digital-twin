/**
 * 兼容层：部件已按配药项目的组织方式拆到 src/scenes/gantry/components/ 下，
 * 每个部件单独文件、单独完善（尺寸取自 gantryConstants.ts 的 *_DETAIL）。
 * 这里只做统一 re-export，避免旧 import 路径失效；新代码请直接从 components 导入。
 */
export {
  Bolt, BoltRow, Profile,
  LinearModule, ServoHousing,
  EndSupport, Carriage, ZAxisAssembly,
  LimitSensor, SensorFlag, AxisSensorSet,
  WeldedTable, ChessboardTable, ChessPieceMesh,
} from '../gantry/components';
