import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import { createModbusService } from './modbus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let modbusService: ReturnType<typeof createModbusService> | null = null;
let wsServerProcess: ChildProcess | null = null;

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

function startWebSocketServer(): void {
  if (process.env.NODE_ENV === 'development') return;

  const serverPath = path.join(process.resourcesPath, 'websocket-server', 'server.js');
  const wsPath = path.join(process.resourcesPath, 'websocket-server', 'node_modules', 'ws');
  const modbusPath = path.join(process.resourcesPath, 'websocket-server', 'node_modules', 'modbus-serial');

  wsServerProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_PATH: [wsPath, modbusPath, path.join(process.resourcesPath, 'websocket-server', 'node_modules')].join(path.delimiter),
    },
    stdio: 'pipe',
    windowsHide: true,
  });

  wsServerProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[WS-Server]', data.toString().trim());
  });

  wsServerProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[WS-Server]', data.toString().trim());
  });

  wsServerProcess.on('error', (err) => {
    console.error('WebSocket服务器启动失败:', err.message);
  });

  wsServerProcess.on('exit', (code) => {
    console.log('WebSocket服务器已退出, code:', code);
    wsServerProcess = null;
  });
}

function stopWebSocketServer(): void {
  if (wsServerProcess) {
    wsServerProcess.kill();
    wsServerProcess = null;
  }
}

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 设置Modbus IPC通信
function setupModbusIPC(): void {
  modbusService = createModbusService();

  // 连接ModbusTCP服务器
  ipcMain.handle('modbus:connect', async (_event, host: string, port: number) => {
    try {
      await modbusService!.connect(host, port);
      return { success: true };
    } catch (error) {
      console.error('Modbus连接失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 断开连接
  ipcMain.handle('modbus:disconnect', async () => {
    try {
      modbusService!.disconnect();
      return { success: true };
    } catch (error) {
      console.error('Modbus断开失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 写入线圈（传感器信号）
  ipcMain.handle('modbus:write-coil', async (_event, address: number, value: boolean) => {
    try {
      await modbusService!.writeCoil(address, value);
      return { success: true };
    } catch (error) {
      console.error('写入线圈失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 读取离散输入（控制信号）
  ipcMain.handle('modbus:read-discrete-inputs', async (_event, address: number, length: number) => {
    try {
      const values = await modbusService!.readDiscreteInputs(address, length);
      return { success: true, values };
    } catch (error) {
      console.error('读取离散输入失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 读取线圈（气缸状态反馈）
  ipcMain.handle('modbus:read-coils', async (_event, address: number, length: number) => {
    try {
      const values = await modbusService!.readCoils(address, length);
      return { success: true, values };
    } catch (error) {
      console.error('读取线圈失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取连接状态
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