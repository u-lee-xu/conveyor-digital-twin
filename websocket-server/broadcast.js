/**
 * 边缘部署状态广播服务（edge status broadcast）— 多设备版
 *
 * 拓扑：PLC <-> websocket-server(8081) <-> broadcast(8082) <-> 观众端
 *
 * 职责：
 *  1. 作为 websocket-server(8081) 的常驻客户端，建立/复用 PLC 会话
 *  2. 按"当前激活设备"周期轮询 PLC 关键状态（每设备独立协议/地址/变量表）
 *  3. 把状态快照（含 deviceId）广播给所有订阅者（手机观众页 / 平台观众模式）
 *  4. 接收 set-device 消息切换激活设备（教师端进入某设备工作区时上报）
 *
 * 配置：edge-broadcast.json
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'edge-broadcast.json');

const DEFAULT_CONFIG = {
  bridgeUrl: 'ws://127.0.0.1:8081',
  broadcastPort: 8082,
  pollIntervalMs: 1000,
  activeDevice: 'conveyor-sorting',
  devices: {
    'conveyor-sorting': {
      protocol: 'modbus',
      host: '192.168.1.10',
      port: 502,
      vars: ['START', 'RESET', 'STOP', 'SENSOR_FEED', 'SENSOR_COLOR', 'SENSOR_MATERIAL',
        'MAGNETIC_FEED_RETRACT', 'MAGNETIC_FEED_EXTEND',
        'MAGNETIC_SORTING1_RETRACT', 'MAGNETIC_SORTING1_EXTEND',
        'MAGNETIC_SORTING2_RETRACT', 'MAGNETIC_SORTING2_EXTEND',
        'FEED_CYLINDER_VALVE', 'SORTING1_CYLINDER_VALVE', 'SORTING2_CYLINDER_VALVE',
        'CONVEYOR', 'SIGNAL_TOWER_RED', 'SIGNAL_TOWER_GREEN', 'SIGNAL_TOWER_YELLOW'],
    },
  },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const user = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...user,
      devices: { ...DEFAULT_CONFIG.devices, ...(user.devices || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const config = loadConfig();
let reqId = 0;

/** 经桥发送消息并等待响应 */
function bridgeRequest(ws, payload) {
  return new Promise((resolve) => {
    const id = ++reqId;
    const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), 3000);
    const onMessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id === id) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, ...payload }));
  });
}

class Broadcaster {
  constructor() {
    this.bridge = null;
    this.connected = false;
    this.deviceId = config.activeDevice || Object.keys(config.devices)[0];
    this.lastSnapshot = null;
    this.viewers = new Set();
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.connectTimer = null;
  }

  get device() {
    return config.devices[this.deviceId] || Object.values(config.devices)[0];
  }

  start() {
    this.startBridge();
    this.startBroadcastServer();
  }

  startBridge() {
    this.bridge = new WebSocket(config.bridgeUrl);
    this.bridge.on('open', () => {
      console.log(`[broadcast] 已连接桥 ${config.bridgeUrl}`);
      this.tryConnect();
    });
    this.bridge.on('close', () => {
      this.connected = false;
      this.broadcastError('网关断开');
      console.log('[broadcast] 桥断开，5秒后重连');
      this.reconnectTimer = setTimeout(() => this.startBridge(), 5000);
    });
    this.bridge.on('error', (err) => {
      console.error('[broadcast] 桥错误:', err.message);
    });
  }

  async tryConnect() {
    if (!this.bridge || this.bridge.readyState !== WebSocket.OPEN) return;
    const dev = this.device;
    const res = await bridgeRequest(this.bridge, {
      type: 'connect',
      protocol: dev.protocol,
      host: dev.host,
      port: dev.port,
      rack: dev.rack || 0,
      slot: dev.slot || 1,
    });
    this.connected = res.success;
    console.log(`[broadcast] 设备 ${this.deviceId} PLC连接 ${res.success ? '成功' : '失败'}: ${res.error || ''}`);
    this.broadcastSnapshot({ vars: {}, error: res.success ? undefined : (res.error || 'PLC连接失败') });
    if (res.success) {
      this.pollLoop();
    } else {
      this.connectTimer = setTimeout(() => this.tryConnect(), 5000);
    }
  }

  async pollLoop() {
    while (this.connected && this.bridge && this.bridge.readyState === WebSocket.OPEN) {
      try {
        const dev = this.device;
        const varsRes = await bridgeRequest(this.bridge, { type: 'read-vars', names: dev.vars });
        const statusRes = await bridgeRequest(this.bridge, { type: 'get-status' });
        this.broadcastSnapshot({
          vars: varsRes.success ? (varsRes.values || {}) : {},
          error: varsRes.success ? undefined : varsRes.error,
          protocol: statusRes.protocol || dev.protocol,
        });
      } catch (err) {
        console.error('[broadcast] 轮询失败:', err.message);
      }
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  }

  /** 切换激活设备：断开旧 PLC 会话并重连新设备（不同协议/地址） */
  setActiveDevice(deviceId) {
    if (!config.devices[deviceId]) {
      console.error(`[broadcast] 未知设备: ${deviceId}`);
      return;
    }
    if (deviceId === this.deviceId && this.connected) {
      console.log(`[broadcast] 设备未变化，忽略: ${deviceId}`);
      return;
    }
    console.log(`[broadcast] 切换激活设备: ${this.deviceId} -> ${deviceId}`);
    this.deviceId = deviceId;
    this.connected = false;
    this.lastSnapshot = null;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.tryConnect();
  }

  broadcastSnapshot({ vars, error, protocol }) {
    const snapshot = {
      type: 'snapshot',
      deviceId: this.deviceId,
      ts: Date.now(),
      connected: this.connected,
      protocol: protocol || this.device.protocol,
      vars,
      error,
    };
    this.lastSnapshot = snapshot;
    this.broadcast(snapshot);
  }

  broadcastError(error) {
    const snapshot = {
      type: 'snapshot',
      deviceId: this.deviceId,
      ts: Date.now(),
      connected: false,
      protocol: this.device.protocol,
      vars: {},
      error,
    };
    this.lastSnapshot = snapshot;
    this.broadcast(snapshot);
  }

  startBroadcastServer() {
    const wss = new WebSocket.Server({ port: config.broadcastPort });
    console.log(`[broadcast] 观众广播服务启动 :${config.broadcastPort}`);
    wss.on('connection', (ws) => {
      this.viewers.add(ws);
      if (this.lastSnapshot) {
        ws.send(JSON.stringify(this.lastSnapshot));
      }
      // 教师端上报激活设备（控制消息；观众连接无影响）
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg && msg.type === 'set-device' && msg.deviceId) {
          this.setActiveDevice(msg.deviceId);
        }
      });
      ws.on('close', () => this.viewers.delete(ws));
    });
    wss.on('error', (err) => {
      console.error('[broadcast] 广播服务错误:', err.message);
    });
  }

  broadcast(snapshot) {
    const msg = JSON.stringify(snapshot);
    for (const ws of this.viewers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}

new Broadcaster().start();
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
