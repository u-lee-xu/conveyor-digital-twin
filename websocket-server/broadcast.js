/**
 * 边缘部署状态广播服务（edge status broadcast）
 *
 * 拓扑：PLC <-> websocket-server(8081) <-> broadcast(8082) <-> 学生手机观众
 *
 * 职责：
 *  1. 作为 websocket-server(8081) 的常驻客户端，建立/复用 PLC 会话
 *  2. 按配置周期轮询 PLC 关键状态（传感器/线圈/磁性开关等）
 *  3. 把状态快照广播给所有订阅者（手机观众页，只读，端口 8082）
 *
 * 配置：edge-broadcast.json（无则使用默认值）
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'edge-broadcast.json');

const DEFAULT_CONFIG = {
  bridgeUrl: 'ws://127.0.0.1:8081',
  broadcastPort: 8082,
  pollIntervalMs: 1000,
  plc: {
    protocol: 'modbus', // modbus | s7 | mitsubishi
    host: '192.168.1.10',
    port: 502, // s7: 102
    rack: 0,
    slot: 1,
  },
  // 要轮询的变量名（read-vars，与协议变量映射一致）
  vars: ['START', 'RESET', 'STOP', 'SENSOR_FEED', 'SENSOR_COLOR', 'SENSOR_MATERIAL',
    'MAGNETIC_FEED_RETRACT', 'MAGNETIC_FEED_EXTEND',
    'MAGNETIC_SORTING1_RETRACT', 'MAGNETIC_SORTING1_EXTEND',
    'MAGNETIC_SORTING2_RETRACT', 'MAGNETIC_SORTING2_EXTEND',
    'FEED_CYLINDER_VALVE', 'SORTING1_CYLINDER_VALVE', 'SORTING2_CYLINDER_VALVE', 'CONVEYOR'],
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const user = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...user,
      plc: { ...DEFAULT_CONFIG.plc, ...(user.plc || {}) },
      vars: (user.vars && user.vars.length ? user.vars : DEFAULT_CONFIG.vars),
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
    this.lastSnapshot = null;
    this.viewers = new Set();
  }

  start() {
    this.startBridge();
    this.startBroadcastServer();
  }

  startBridge() {
    this.bridge = new WebSocket(config.bridgeUrl);
    this.bridge.on('open', async () => {
      console.log(`[broadcast] 已连接桥 ${config.bridgeUrl}`);
      this.tryConnect();
    });
    this.bridge.on('close', () => {
      this.connected = false;
      this.broadcast({ ts: Date.now(), connected: false, protocol: config.plc.protocol, vars: {}, error: '网关断开' });
      console.log('[broadcast] 桥断开，5秒后重连');
      setTimeout(() => this.startBridge(), 5000);
    });
    this.bridge.on('error', (err) => {
      console.error('[broadcast] 桥错误:', err.message);
    });
  }

  async tryConnect() {
    if (!this.bridge || this.bridge.readyState !== WebSocket.OPEN) return;
    const res = await bridgeRequest(this.bridge, {
      type: 'connect',
      protocol: config.plc.protocol,
      host: config.plc.host,
      port: config.plc.port,
      rack: config.plc.rack,
      slot: config.plc.slot,
    });
    this.connected = res.success;
    console.log(`[broadcast] PLC连接 ${res.success ? '成功' : '失败'}: ${res.error || ''}`);
    this.broadcast({
      ts: Date.now(),
      connected: res.success,
      protocol: config.plc.protocol,
      vars: {},
      error: res.success ? undefined : (res.error || 'PLC连接失败'),
    });
    if (res.success) {
      this.pollLoop();
    } else {
      setTimeout(() => this.tryConnect(), 5000);
    }
  }

  async pollLoop() {
    while (this.connected && this.bridge.readyState === WebSocket.OPEN) {
      try {
        const varsRes = await bridgeRequest(this.bridge, { type: 'read-vars', names: config.vars });
        const statusRes = await bridgeRequest(this.bridge, { type: 'get-status' });
        const snapshot = {
          ts: Date.now(),
          connected: !!statusRes.connected,
          protocol: statusRes.protocol || config.plc.protocol,
          vars: varsRes.success ? (varsRes.values || {}) : {},
          error: varsRes.success ? undefined : varsRes.error,
        };
        this.lastSnapshot = snapshot;
        this.broadcast(snapshot);
      } catch (err) {
        console.error('[broadcast] 轮询失败:', err.message);
      }
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  }

  startBroadcastServer() {
    const wss = new WebSocket.Server({ port: config.broadcastPort });
    console.log(`[broadcast] 观众广播服务启动 :${config.broadcastPort}`);
    wss.on('connection', (ws) => {
      this.viewers.add(ws);
      // 新订阅者立即收到最近快照
      if (this.lastSnapshot) {
        ws.send(JSON.stringify({ type: 'snapshot', ...this.lastSnapshot }));
      }
      ws.on('close', () => this.viewers.delete(ws));
    });
    wss.on('error', (err) => {
      console.error('[broadcast] 广播服务错误:', err.message);
    });
  }

  broadcast(snapshot) {
    const msg = JSON.stringify({ type: 'snapshot', ...snapshot });
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
