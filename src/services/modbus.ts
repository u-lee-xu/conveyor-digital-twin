import { modbusService } from './modbus-websocket';
import type { ModbusConfig, ModbusStatus, ModbusResult, ModbusReadResult } from './modbus-websocket';

// 统一地址定义 (从 modbus-websocket 重新导出以保持一致性)
export { MODBUS_ADDRESSES } from './modbus-websocket';

export const MODBUS_CONFIG = {
  host: '127.0.0.1',
  port: 502,
  unitId: 1,
};

// 仿真模式专用的 Hook，适配现有的代码使用习惯
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
