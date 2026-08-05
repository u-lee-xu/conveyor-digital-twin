import { app, BrowserWindow, utilityProcess } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let wsServerProcess: Electron.UtilityProcess | null = null;

function startWebSocketServer(): void {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'websocket-server', 'server.js')
    : path.join(__dirname, '../../../websocket-server/server.js');

  console.log('[Main] Starting WebSocket server:', serverPath);
  if (!fs.existsSync(serverPath)) {
    console.error('[Main] WS server.js not found at:', serverPath);
    return;
  }
  try {
    wsServerProcess = utilityProcess.fork(serverPath, [], { stdio: 'pipe' });
    wsServerProcess.on('exit', (code) => console.log('[WS] Server exited with code:', code));
    wsServerProcess.stdout?.on('data', (d) => console.log('[WS]', d.toString().trim()));
    wsServerProcess.stderr?.on('data', (d) => console.error('[WS]', d.toString().trim()));
  } catch (err) {
    console.error('[Main] Failed to start WS server:', err);
  }
}

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
    title: '气动机械手数字孪生系统 V1.0',
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
    mainWindow.loadURL('http://localhost:5175');
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (wsServerProcess) {
    wsServerProcess.kill();
    wsServerProcess = null;
  }
});