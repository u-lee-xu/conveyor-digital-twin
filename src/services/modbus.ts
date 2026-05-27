/**
 * ================================================
 * 文件名: modbus.ts
 * 功能: 数字孪生传送带分拣系统 - Modbus服务封装
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: ./modbus-websocket
 * - 被依赖: useSimMode.ts, useScoring.ts
 * - 数据流向: 本模块作为modbus-websocket的封装层，提供统一的API接口
 * 
 * 【功能说明】
 * 本文件提供Modbus服务的封装和配置：
 * 1. 导出统一的Modbus地址定义
 * 2. 定义默认的Modbus配置
 * 3. 提供useModbusService Hook，适配现有代码使用习惯
 * 4. 类型重导出，简化其他模块的导入
 */

import { modbusService } from './modbus-websocket';
import type { ModbusConfig, ModbusStatus, ModbusResult, ModbusReadResult } from './modbus-websocket';

/**
 * 统一地址定义 (从 modbus-websocket 重新导出以保持一致性)
 */
export { MODBUS_ADDRESSES } from './modbus-websocket';

/**
 * 默认Modbus配置
 * - host: PLC或Modbus服务器地址（默认本地）
 * - port: ModbusTCP端口（默认502）
 * - unitId: 从站地址（默认1）
 */
export const MODBUS_CONFIG = {
  host: '127.0.0.1',
  port: 502,
  unitId: 1,
};

/**
 * 仿真模式专用的Hook，适配现有的代码使用习惯
 * 提供统一的Modbus操作API，内部委托给modbus-websocket服务
 */
export const useModbusService = (config: { host: string; port: number; unitId?: number }) => {
  return {
    connect: () => modbusService.connect(config.host, config.port),
    disconnect: () => modbusService.disconnect(),
    getStatus: () => modbusService.getStatus(),
    testConnection: async () => {
        const status = await modbusService.getStatus();
        return status.connected;
    },
    // 写入单个线圈
    writeCoil: (address: number, value: number | boolean) => 
        modbusService.writeCoil(address, typeof value === 'number' ? value === 1 : value),
    
    // 读取单个线圈 (适配 useSimMode 的需求)
    readCoil: async (address: number) => {
        const result = await modbusService.readCoils(address, 1);
        if (result.success && result.values && result.values.length > 0) {
            return result.values[0] ? 1 : 0;
        }
        return 0;
    },

    // 批量写入反馈信号
    writeFeedbackBatch: (values: {
      magneticExtend: { feed: boolean, sort1: boolean, sort2: boolean },
      magneticRetract: { feed: boolean, sort1: boolean, sort2: boolean },
      sensors: { feed: boolean, color: boolean, material: boolean }
    }) => modbusService.writeFeedbackBatch(values),

    // 批量读取线圈
    readCoils: (address: number, length: number) => modbusService.readCoils(address, length),
  };
};

export type { ModbusConfig, ModbusStatus, ModbusResult, ModbusReadResult };
