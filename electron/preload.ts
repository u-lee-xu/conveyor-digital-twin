import { contextBridge, ipcRenderer } from 'electron';

// Modbus API接口
export interface ModbusAPI {
  connect: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean; error?: string }>;
  writeCoil: (address: number, value: boolean) => Promise<{ success: boolean; error?: string }>;
  readDiscreteInputs: (address: number, length: number) => Promise<{ success: boolean; values?: boolean[]; error?: string }>;
  readCoils: (address: number, length: number) => Promise<{ success: boolean; values?: boolean[]; error?: string }>;
  getStatus: () => Promise<{ connected: boolean; host: string; port: number }>;
}

// 暴露Modbus API到渲染进程
const modbusAPI: ModbusAPI = {
  connect: (host: string, port: number) => ipcRenderer.invoke('modbus:connect', host, port),
  disconnect: () => ipcRenderer.invoke('modbus:disconnect'),
  writeCoil: (address: number, value: boolean) => ipcRenderer.invoke('modbus:write-coil', address, value),
  readDiscreteInputs: (address: number, length: number) => ipcRenderer.invoke('modbus:read-discrete-inputs', address, length),
  readCoils: (address: number, length: number) => ipcRenderer.invoke('modbus:read-coils', address, length),
  getStatus: () => ipcRenderer.invoke('modbus:get-status'),
};

// 通过contextBridge暴露API
contextBridge.exposeInMainWorld('electronAPI', {
  modbus: modbusAPI,
});

// TypeScript类型声明
declare global {
  interface Window {
    electronAPI: {
      modbus: ModbusAPI;
    };
  }
}

export type { ModbusAPI };