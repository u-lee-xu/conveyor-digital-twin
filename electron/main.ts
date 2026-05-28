import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import { createModbusService } from './modbus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let modbusService: ReturnType<typeof createModbusService> | null = null;
let wsServer: any = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startWebSocketServer();
    createWindow();
    setupModbusIPC();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '../build/icon.ico'),
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

class SimpleModbusTCP {
  private client: net.Socket | null = null;
  private connected = false;
  private transactionId = 0;
  private pendingRequests = new Map<number, { resolve: (result: any) => void; timeout: NodeJS.Timeout; length?: number }>();
  private receiveBuffer = Buffer.alloc(0);

  async connect(host: string, port: number) {
    return new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      this.client = new net.Socket();

      this.client.on('connect', () => {
        this.connected = true;
        console.log(`ModbusTCP连接成功: ${host}:${port}`);

        this.client!.on('data', (data: Buffer) => {
          this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

          while (this.receiveBuffer.length >= 8) {
            const msgLength = this.receiveBuffer.readUInt16BE(4);
            const totalPacketSize = 6 + msgLength;

            if (this.receiveBuffer.length < totalPacketSize) break;

            const packet = this.receiveBuffer.slice(0, totalPacketSize);
            this.receiveBuffer = this.receiveBuffer.slice(totalPacketSize);

            const respTransactionId = packet.readUInt16BE(0);
            const pendingRequest = this.pendingRequests.get(respTransactionId);

            if (pendingRequest) {
              clearTimeout(pendingRequest.timeout);
              this.pendingRequests.delete(respTransactionId);

              try {
                const functionCode = packet.readUInt8(7);
                if (functionCode === 0x01) {
                  const byteCount = packet.readUInt8(8);
                  const values: boolean[] = [];
                  for (let i = 0; i < byteCount; i++) {
                    const byte = packet.readUInt8(9 + i);
                    for (let j = 0; j < 8; j++) {
                      if (values.length < (pendingRequest.length ?? 999)) {
                        values.push(((byte >> j) & 0x01) === 1);
                      }
                    }
                  }
                  pendingRequest.resolve({ success: true, values: values.slice(0, pendingRequest.length) });
                } else if (functionCode === 0x05 || functionCode === 0x0F) {
                  pendingRequest.resolve({ success: true });
                } else if (functionCode >= 0x80) {
                  const errorCode = packet.readUInt8(8);
                  pendingRequest.resolve({ success: false, error: `Modbus错误码: ${errorCode}` });
                } else {
                  pendingRequest.resolve({ success: false, error: `意外的功能码: ${functionCode}` });
                }
              } catch (error: any) {
                pendingRequest.resolve({ success: false, error: error.message });
              }
            }
          }
        });

        resolve({ success: true });
      });

      this.client.on('error', (error: Error) => {
        console.error('ModbusTCP连接失败:', error);
        this.receiveBuffer = Buffer.alloc(0);
        reject({ success: false, error: error.message });
      });

      this.client.on('close', () => {
        this.receiveBuffer = Buffer.alloc(0);
      });

      this.client.connect(port, host);
    });
  }

  async disconnect() {
    if (this.connected && this.client) {
      return new Promise<{ success: boolean }>((resolve) => {
        this.client!.end(() => {
          this.connected = false;
          this.client = null;
          console.log('ModbusTCP连接已断开');
          resolve({ success: true });
        });
      });
    }
    return { success: true };
  }

  async readCoils(address: number, length: number) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise<{ success: boolean; values?: boolean[]; error?: string }>((resolve) => {
      try {
        this.transactionId++;
        const tid = this.transactionId;
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(6, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x01, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(length, 10);

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '读取超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, length });
        this.client!.write(buffer);
      } catch (e: any) { resolve({ success: false, error: e.message }); }
    });
  }

  async writeCoil(address: number, value: boolean) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      try {
        this.transactionId++;
        const tid = this.transactionId;
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(6, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x05, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(value ? 0xFF00 : 0x0000, 10);

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '写入超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout });
        this.client!.write(buffer);
      } catch (e: any) { resolve({ success: false, error: e.message }); }
    });
  }

  async writeCoils(address: number, values: boolean[]) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      try {
        this.transactionId = (this.transactionId + 1) % 65536;
        const tid = this.transactionId;
        const count = values.length;
        const byteCount = Math.ceil(count / 8);
        const buffer = Buffer.alloc(13 + byteCount);

        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(7 + byteCount, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x0F, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(count, 10);
        buffer.writeUInt8(byteCount, 12);

        for (let i = 0; i < byteCount; i++) {
          let byte = 0;
          for (let j = 0; j < 8; j++) {
            const idx = i * 8 + j;
            if (idx < count && values[idx]) byte |= (1 << j);
          }
          buffer.writeUInt8(byte, 13 + i);
        }

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '批量写入超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, length: count });
        this.client!.write(buffer);
      } catch (e: any) { resolve({ success: false, error: e.message }); }
    });
  }

  isConnected() { return this.connected; }
}

function startWebSocketServer(): void {
  if (process.env.NODE_ENV === 'development') return;

  import('ws').then(({ default: WebSocketModule }) => {
    const WebSocketServer = WebSocketModule.Server || WebSocketModule.WebSocketServer;
    const modbusClient = new SimpleModbusTCP();

    wsServer = new WebSocketServer({ port: 8081 });
    console.log('[内置] WebSocket服务器启动在端口 8081');

    wsServer.on('connection', (ws: any) => {
      ws.on('message', async (message: Buffer) => {
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(message.toString());
          let result: any;
          switch (parsedData.type) {
            case 'connect': result = await modbusClient.connect(parsedData.host, parsedData.port); break;
            case 'disconnect': result = await modbusClient.disconnect(); break;
            case 'write-coil': result = await modbusClient.writeCoil(parsedData.address, parsedData.value); break;
            case 'write-coils': result = await modbusClient.writeCoils(parsedData.address, parsedData.values); break;
            case 'read-coils': result = await modbusClient.readCoils(parsedData.address, parsedData.length); break;
            case 'get-status': result = { success: true, connected: modbusClient.isConnected() }; break;
            default: result = { success: false, error: '未知消息类型' };
          }
          ws.send(JSON.stringify({ id: parsedData.id, type: parsedData.type, ...result }));
        } catch (error: any) {
          ws.send(JSON.stringify({ id: parsedData?.id || 'unknown', success: false, error: error.message }));
        }
      });
    });
  }).catch((error: any) => {
    console.error('[内置] WebSocket服务器启动失败:', error.message);
  });
}

function stopWebSocketServer(): void {
  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupModbusIPC(): void {
  modbusService = createModbusService();

  ipcMain.handle('modbus:connect', async (_event, host: string, port: number) => {
    try {
      await modbusService!.connect(host, port);
      return { success: true };
    } catch (error) {
      console.error('Modbus连接失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('modbus:disconnect', async () => {
    try {
      modbusService!.disconnect();
      return { success: true };
    } catch (error) {
      console.error('Modbus断开失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('modbus:write-coil', async (_event, address: number, value: boolean) => {
    try {
      await modbusService!.writeCoil(address, value);
      return { success: true };
    } catch (error) {
      console.error('写入线圈失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('modbus:read-discrete-inputs', async (_event, address: number, length: number) => {
    try {
      const values = await modbusService!.readDiscreteInputs(address, length);
      return { success: true, values };
    } catch (error) {
      console.error('读取离散输入失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('modbus:read-coils', async (_event, address: number, length: number) => {
    try {
      const values = await modbusService!.readCoils(address, length);
      return { success: true, values };
    } catch (error) {
      console.error('读取线圈失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('modbus:get-status', async () => {
    return {
      connected: modbusService!.isConnected(),
      host: modbusService!.getHost(),
      port: modbusService!.getPort(),
    };
  });
}

app.on('before-quit', () => {
  stopWebSocketServer();
  if (modbusService) {
    modbusService.disconnect();
  }
});
