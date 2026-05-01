import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModbusService } from './modbus';

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let modbusService: ReturnType<typeof createModbusService> | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '../build/icon.ico'),
  });

  // 开发模式下加载Vite开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式下加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow();
  setupModbusIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
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

// 应用退出前清理
app.on('before-quit', () => {
  if (modbusService) {
    modbusService.disconnect();
  }
});