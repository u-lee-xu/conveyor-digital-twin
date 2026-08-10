import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import { createModbusService } from './modbus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let modbusService: ReturnType<typeof createModbusService> | null = null;
let wsServerProcess: ChildProcess | null = null;
/** 应用主动退出标记：避免 WS 子进程随退出的 exit 事件误报异常弹窗 */
let isQuitting = false;

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
    title: '数字孪生传送带系统 V1.0',
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
    mainWindow.webContents.setFrameRate(30);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startWebSocketServer(): void {
  // 开发模式：指向仓库内 websocket-server（源码热改即时生效）；生产：随包 resources
  const serverPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../../websocket-server/server.js')
    : path.join(process.resourcesPath, 'websocket-server', 'server.js');
  const nodeModulesPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../../websocket-server/node_modules')
    : path.join(process.resourcesPath, 'websocket-server', 'node_modules');

  wsServerProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: nodeModulesPath,
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
    if (process.env.NODE_ENV !== 'development') {
      dialog.showErrorBox('通信网关启动失败', `无法启动内置 PLC 网关：${err.message}\n请重新安装应用后重试。`);
    }
  });

  wsServerProcess.on('exit', (code) => {
    console.log('WebSocket服务器已退出, code:', code);
    wsServerProcess = null;
    if (process.env.NODE_ENV !== 'development' && !isQuitting) {
      dialog.showErrorBox('通信网关异常退出', `内置 PLC 网关已停止（code: ${code}）。\n仿真/评分功能将不可用，请重启应用。`);
    }
  });
}

function stopWebSocketServer(): void {
  if (wsServerProcess) {
    try {
      wsServerProcess.stdin?.write(JSON.stringify({ type: 'shutdown' }) + '\n');
      wsServerProcess.stdin?.end();
    } catch {}
    setTimeout(() => {
      if (wsServerProcess) {
        wsServerProcess.kill();
        wsServerProcess = null;
      }
    }, 1500);
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
  isQuitting = true;
  stopWebSocketServer();
  if (modbusService) {
    modbusService.disconnect();
  }
});
