/** 龙门部件统一出口：SceneContent 只从这里组装，不感知零件内部实现 */
export { Bolt, BoltRow, Profile } from './IndustrialProfile';
export { LinearModule, ServoHousing } from './LinearModule';
export { EndSupport } from './EndSupport';
export { Carriage } from './Carriage';
export { ZAxisAssembly, Z_AXIS_GEOM, ROD_TOP } from './ZAxisAssembly';
export { LimitSensor, SensorFlag, AxisSensorSet } from './SensorSet';
export type { SensorKind, RailAxis } from './SensorSet';
export { WeldedTable } from './WeldedTable';
export { ChessboardTable } from './ChessboardTable';
export { ChessPieceMesh } from './ChessPieceMesh';
export { GantryCameraRig } from './GantryCameraRig';
