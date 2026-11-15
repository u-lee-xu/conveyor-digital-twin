import { contextBridge } from 'electron';

// 平台应用目前不需要 Modbus 直连 IPC，所有 PLC 通信走 WebSocket 网关。
// 预留 contextBridge 以便未来扩展（如文件导出、系统信息等）。
contextBridge.exposeInMainWorld('electronAPI', {
  platform: {
    version: '1.0.0',
  },
  // 主进程签发的一次性凭据：file:// 直连内部 WS 时携带，供网关区分 Electron 与 opaque origin
  internalToken: process.env.DT_INTERNAL_TOKEN || '',
});

declare global {
  interface Window {
    electronAPI: {
      platform: {
        version: string;
      };
      internalToken?: string;
    };
  }
}
