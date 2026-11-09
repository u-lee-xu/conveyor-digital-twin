/**
 * 仿真模式 PLC 写入桥接：UI 主令按钮、3D 按钮箱、输出点按钮共用这一条写通道。
 *
 * 观众端 `canOpenPlcChannel()` 会阻止 plcService 建立 /ws/plc 连接，
 * 因此 `connected` 恒为 false，所有写入自动短路，不会破坏「观众只读」。
 * 未连接 PLC 时也不抛异常：面板会显示「未连接」提示，本地操作不产生副作用。
 */
import { plcService, type PlcResult } from './plc-websocket';
import { selectorIo } from '../scenes/auto-dispensing/simulationIo';

const NOT_CONNECTED: PlcResult = { success: false, error: '未连接 PLC' };

export function simPlcReady(): boolean {
  return plcService.connected;
}

/** 按变量名写单个 PLC 线圈 / 输入点 */
export function writeSimPlcVar(name: string, value: boolean): Promise<PlcResult> {
  if (!plcService.connected) return Promise.resolve(NOT_CONNECTED);
  return plcService.writeVar(name, value);
}

/** 一帧写多个点：传感器批量回写、电机正反转互锁都走这里 */
export function writeSimPlcVars(names: string[], values: boolean[]): Promise<PlcResult> {
  if (!plcService.connected) return Promise.resolve(NOT_CONNECTED);
  return plcService.writeVars(names, values);
}

/**
 * 拨动两位选择开关：UI 自锁按钮、3D 控制柜旋钮、连接上电同步共用这一入口。
 * 一帧写 SEL_MANUAL / SEL_AUTO 两路互锁输入，保证三个入口口径完全一致；
 * 未连接 PLC 时 writeSimPlcVars 短路，只切本地旋钮、不写任何地址。
 */
export function writeSimSelector(auto: boolean): Promise<PlcResult> {
  const io = selectorIo(auto);
  return writeSimPlcVars(io.names, io.values);
}
