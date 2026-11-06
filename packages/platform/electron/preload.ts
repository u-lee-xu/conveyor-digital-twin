import { contextBridge } from 'electron';

// 平台应用目前不需要 Modbus 直连 IPC，所有 PLC 通信走 WebSocket 网关。
// 预留 contextBridge 以便未来扩展（如文件导出、系统信息等）。
contextBridge.exposeInMainWorld('electronAPI', {
  platform: {
    version: '1.0.0',
  },
});

declare global {
  interface Window {
    electronAPI: {
      platform: {
        version: string;
      };
    };
  }
}
