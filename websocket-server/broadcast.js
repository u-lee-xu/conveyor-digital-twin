/**
 * 课堂演示状态中继（纯扇出，不连接 PLC）
 *
 * 拓扑：主控浏览器 --(report 单向)--> 中继 --(snapshot)--> 观众浏览器 ×N
 *
 * 设计口径（2026-11-08 定稿）：
 *  - PLC 只由主控电脑通过网关 8081 双向访问；本服务不再连网关、不再 connect PLC、
 *    不再轮询 read-vars，避免真实 PLC 出现第二个客户端和共享会话写冲突。
 *  - 快照来自主控 UI store，因此演示 / 手动模式（未连 PLC）观众也能同步看到画面。
 *  - 观众端零上行：只有主控连接能 report；观众发来的任何消息一律丢弃。
 *  - 后加入的观众立即收到 lastSnapshot，不会黑屏等待。
 *
 * 配置：edge-broadcast.json 只读取 broadcastPort；设备/地址表由主控前端负责。
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'edge-broadcast.json');
const DEFAULT_CONFIG = { broadcastPort: 8082 };

function loadConfig() {
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...user };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const config = loadConfig();

class Relay {
  constructor() {
    this.deviceId = null;
    this.mode = null;
    this.lastSnapshot = null;
    /** 当前主控连接；只有它能上报，观众连接不持有此引用 */
    this.controller = null;
    this.leaveTimer = null;
    this.viewers = new Set();
  }

  start() {
    const wss = new WebSocket.Server({ port: config.broadcastPort });
    console.log(`[relay] 状态中继启动 :${config.broadcastPort}（不连接 PLC）`);
    wss.on('connection', (ws) => {
      this.viewers.add(ws);
      // 后加入的智能电视 / 手机 / 学生机浏览器立刻拿到当前画面
      if (this.lastSnapshot) ws.send(JSON.stringify(this.lastSnapshot));

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'report') {
          // 第一个上报者成为主控；同一教室只认一台主控
          if (this.controller && this.controller !== ws && this.controller.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'rejected', error: '已有主控在演示' }));
            return;
          }
          this.controller = ws;
          if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
          this.deviceId = msg.deviceId ?? null;
          this.mode = msg.mode ?? null;
          this.publish(this.snapshot(msg.vars || {}, { error: undefined }));
          return;
        }

        if (msg.type === 'leave' && this.controller === ws) {
          this.controller = null;
          this.clearController();
          return;
        }

        // 兼容旧主控的 set-device 帧（只切设备，不带状态）
        if (msg.type === 'set-device' && (!this.controller || this.controller === ws)) {
          this.deviceId = msg.deviceId ?? null;
          this.publish(this.snapshot({}, { error: undefined }));
        }
        // 其它消息（含观众端上行）一律忽略：观众只读
      });

      ws.on('close', () => {
        this.viewers.delete(ws);
        if (this.controller === ws) {
          this.controller = null;
          // 主控刷新页面会短暂断线，给 800ms 宽限避免观众画面闪一下
          this.leaveTimer = setTimeout(() => {
            if (this.controller) return;
            this.clearController();
          }, 800);
        }
      });
    });
    wss.on('error', (err) => console.error('[relay] 服务错误:', err.message));
  }

  clearController() {
    this.deviceId = null;
    this.mode = null;
    this.publish(this.snapshot({}, { error: '主控已离开' }));
  }

  snapshot(vars, extra) {
    return {
      type: 'snapshot',
      deviceId: this.deviceId,
      mode: this.mode,
      ts: Date.now(),
      connected: this.deviceId !== null,
      protocol: this.mode || '主控镜像',
      vars,
      ...extra,
    };
  }

  publish(snapshot) {
    this.lastSnapshot = snapshot;
    const msg = JSON.stringify(snapshot);
    for (const ws of this.viewers) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }
}

new Relay().start();
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
