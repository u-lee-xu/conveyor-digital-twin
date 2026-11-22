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
 *  - 主控连接活着但停止上报（后台节流 / 页面卡死）时，由独立保活定时器按静默时长
 *    接管或释放，不再永久占坑（见 CONTROLLER_SILENT_MS / CONTROLLER_RELEASE_MS）。
 *
 * 安全边界（2026-11-10 P0-2）：
 *  - 角色不再由客户端自报。vite 代理按 TCP localAddress + Host 计算 teacher/viewer，
 *    覆写 x-dt-role / x-dt-proxy / x-dt-internal-token；本服务在 verifyClient 复核
 *    一次性 token，再把 role 挂到 ws 上。LAN 观众无法自封 teacher。
 *  - Electron file:// 直连回环时无代理头，按可信本机 teacher 处理。
 *
 * 配置：edge-broadcast.json 只读取 broadcastPort；bridgeUrl / activeDevice / devices
 * 等字段均为历史遗留，运行态不读取。设备/地址表由主控前端负责。
 * 绑定：中继只对本机同源反代开放，不绑回环会让局域网直连并伪造主控上报。
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { verifyInternalRequest } = require('./runtime-role');
const { sameSnapshot, mergeSnapshot, isSnapshotValue } = require('./snapshot-diff');

const CONFIG_PATH = path.join(__dirname, 'edge-broadcast.json');
const DEFAULT_CONFIG = { broadcastPort: 8082 };
/** 安全边界不可配置：不允许从 edge-broadcast.json 放开到 0.0.0.0 */
const BROADCAST_HOST = '127.0.0.1';
/** 主控刷新 / 切模式会短暂断线，统一给 800ms 宽限，避免观众画面闪一下 */
const RELEASE_GRACE_MS = 800;
/** 正常快照远小于 64KB；超长帧直接由 ws 协议层拒绝 */
const MAX_WS_FRAME = 64 * 1024;
/** 观众端积压超过 512KB 视为慢连接，跳过本帧并终止，避免 10Hz 广播把内存堆满 */
const MAX_BUFFERED = 512 * 1024;
const WS_HEARTBEAT_MS = 30000;
/** 静止期仍每 1s 发一帧完整快照：观众端「更新于」时间戳与链路保活，扇出比 10Hz 降 90% */
const SNAPSHOT_KEEPALIVE_MS = 1000;
/**
 * 主控 report 静默判据（P1，2026-11-21 审核）：主控 ws 仍 OPEN、pong 正常，但 report 停了
 * （后台标签节流、页面卡死、脚本异常）时，旧实现只认 close / leave / 心跳半开，于是
 * 第二主控被「已有主控在演示」永久拒绝、观众永远停在最后一帧。改为两级兜底：
 *  - 静默 ≥ CONTROLLER_SILENT_MS：允许新主控接管，旧连接降级为普通连接（不影响它自己的本地操作）；
 *  - 静默 ≥ CONTROLLER_RELEASE_MS：按主控离场释放，走与 leave 相同的清场广播。
 * 主控正常是 10Hz 上报，即使被后台节流到 1s 一次也远小于这两个阈值。
 */
const CONTROLLER_SILENT_MS = Number(process.env.DT_RELAY_SILENT_MS) || 15000;
const CONTROLLER_RELEASE_MS = Number(process.env.DT_RELAY_RELEASE_MS) || 120000;
/** 与网关侧同源的键名黑名单，防止 report 帧写入对象原型 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 只收合法键名与 boolean / 有限 number；delta 帧额外允许 null 作为删除标记。
 * 非对象（字符串 / 数组）一律当空帧，避免 Object.entries 把字符拆成数字键。
 */
function sanitizeVars(raw, allowDelete) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (UNSAFE_KEYS.has(k)) continue;
    if (allowDelete && v === null) { out[k] = null; continue; }
    if (isSnapshotValue(v)) out[k] = v;
  }
  return out;
}

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
    this.wss = null;
    this.heartbeat = null;
    /** 完整快照镜像：主控只发变化键，合并后才扇出，观众端协议保持完整 vars 不变 */
    this.vars = {};
    this.lastPublishAt = 0;
    /** 最近一次主控 report 的时间戳；静默判据的唯一依据 */
    this.lastReportAt = 0;
    /** 独立保活定时器：不依赖 report 分支，主控在线时始终 1Hz 扇出 */
    this.keepaliveTimer = null;
  }

  start() {
    const wss = new WebSocket.Server({
      port: config.broadcastPort,
      host: BROADCAST_HOST,
      maxPayload: MAX_WS_FRAME,
      perMessageDeflate: false,
      verifyClient: (info) => {
        const verdict = verifyInternalRequest(info.req, { allowViewer: true });
        if (!verdict.ok) console.warn(`[relay] 拒绝越权接入 (${verdict.reason})`);
        return verdict.ok;
      },
    });
    this.wss = wss;
    console.log(`[relay] 状态中继启动 ${BROADCAST_HOST}:${config.broadcastPort}（仅本机可达，不连接 PLC）`);
    /** 半开连接检测：断电/WiFi 掉线不发 FIN 时，30s 内清出 viewers，避免广播风暴 */
    this.heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.isAlive === false) { ws.terminate(); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch { ws.terminate(); }
      }
    }, WS_HEARTBEAT_MS);
    this.heartbeat.unref?.();
    /**
     * 独立保活：旧实现只在 report 分支里扇出，主控一静默中继就完全不发声。
     * 这里每秒检查一次，主控在线时保活扇出、静默超限时释放占坑。
     */
    this.keepaliveTimer = setInterval(() => this.tick(), SNAPSHOT_KEEPALIVE_MS);
    this.keepaliveTimer.unref?.();
    wss.on('connection', (ws, req) => {
      const verdict = verifyInternalRequest(req, { allowViewer: true });
      ws.role = verdict.role;
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      // 单连接 error 必须有监听，否则协议错误/超长帧会以未捕获异常打死中继
      ws.on('error', (err) => console.warn('[relay] 连接异常:', err && err.message ? err.message : err));
      // 只有观众进订阅集合：主控不需要接收自己 10Hz 上报的快照回环
      if (ws.role === 'viewer') this.viewers.add(ws);
      // 后加入的智能电视 / 手机 / 学生机浏览器立刻拿到当前画面
      if (this.lastSnapshot && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED) {
        ws.send(JSON.stringify(this.lastSnapshot));
      }

      ws.on('message', (raw) => {
        let msg;
        if (raw && typeof raw.length === 'number' && raw.length > MAX_WS_FRAME) return;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        // 观众完全只读：任何上行帧（含伪造 report / leave / set-device）都直接丢弃
        if (ws.role !== 'teacher') return;

        if (msg.type === 'report') {
          // 第一个上报者成为主控；同一教室只认一台主控
          if (this.controller && this.controller !== ws && this.controller.readyState === WebSocket.OPEN) {
            const silent = Date.now() - this.lastReportAt;
            if (silent < CONTROLLER_SILENT_MS) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'rejected', error: '已有主控在演示' }));
              }
              return;
            }
            // 旧主控连接还开着但已停止上报：直接交接，否则第二主控会被永久拒绝
            console.warn(`[relay] 主控静默 ${Math.round(silent / 1000)}s，交接给新的上报连接`);
            this.controller = null;
          }
          const incoming = sanitizeVars(msg.vars, msg.delta === true);
          const deviceChanged = this.deviceId !== (msg.deviceId ?? null);
          const modeChanged = this.mode !== (msg.mode ?? null);
          this.controller = ws;
          this.lastReportAt = Date.now();
          this.cancelRelease();
          this.deviceId = msg.deviceId ?? null;
          this.mode = msg.mode ?? null;
          // 旧主控 / 安全自检 / 切设备 / 切模式：不带 delta 的全量帧无条件广播，行为与旧版一致
          if (msg.delta !== true) {
            // incoming 已按「合法键名 + boolean/有限 number」清洗，全量帧直接替换
            this.vars = incoming;
            this.publish(this.snapshot(this.vars, { error: undefined }));
            return;
          }
          // 新主控差分帧：先合并成完整镜像，静止期只按 1s 保活扇出
          const merged = mergeSnapshot(this.vars, incoming);
          const changed = !sameSnapshot(merged, this.vars) || deviceChanged || modeChanged;
          this.vars = merged;
          if (!changed && Date.now() - this.lastPublishAt < SNAPSHOT_KEEPALIVE_MS) return;
          this.publish(this.snapshot(this.vars, { error: undefined }));
          return;
        }

        if (msg.type === 'leave' && this.controller === ws) {
          // 与 close 共用宽限：切模式时先 leave 再断线，观众不应立刻卸载场景
          this.scheduleRelease(ws);
          return;
        }

        // 兼容旧主控的 set-device 帧（只切设备，不带状态）
        if (msg.type === 'set-device' && (!this.controller || this.controller === ws)) {
          this.deviceId = msg.deviceId ?? null;
          this.mode = null; // 旧主控切设备时不应短暂沿用上一设备的模式
          this.vars = {};
          this.publish(this.snapshot(this.vars, { error: undefined }));
        }
      });

      ws.on('close', () => {
        this.viewers.delete(ws);
        if (this.controller === ws) this.scheduleRelease(ws);
      });
    });
    wss.on('error', (err) => console.error('[relay] 服务错误:', err.message));
  }

  cancelRelease() {
    if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
  }

  scheduleRelease(ws) {
    if (this.controller !== ws) return;
    this.controller = null;
    this.cancelRelease();
    this.leaveTimer = setTimeout(() => {
      this.leaveTimer = null;
      if (this.controller) return;
      this.clearController();
    }, RELEASE_GRACE_MS);
  }

  clearController() {
    this.deviceId = null;
    this.mode = null;
    this.vars = {};
    this.lastPublishAt = 0; // 不依赖 publish 的副作用重置保活窗口
    this.lastReportAt = 0;
    this.publish(this.snapshot(this.vars, { error: '主控已离开' }));
  }

  /**
   * 每秒一次的独立巡检：主控在线就保活扇出，静默超限就释放占坑。
   * 与 close / leave 的关系：close 与 leave 仍走 800ms 宽限，这里只处理「连接活着但不再上报」。
   */
  tick() {
    const controller = this.controller;
    if (!controller || controller.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    const silent = now - this.lastReportAt;
    if (silent >= CONTROLLER_RELEASE_MS) {
      console.warn(`[relay] 主控 ${Math.round(silent / 1000)}s 未上报，按离场清场`);
      this.scheduleRelease(controller);
      return;
    }
    // 静默中的主控不再刷新时间戳：观众端「更新于」必须如实反映停更，而不是被保活伪装成在线
    if (silent < CONTROLLER_SILENT_MS && now - this.lastPublishAt >= SNAPSHOT_KEEPALIVE_MS) {
      this.publish(this.snapshot(this.vars, { error: undefined }));
    }
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
    this.lastPublishAt = Date.now();
    const msg = JSON.stringify(snapshot);
    for (const ws of this.viewers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      // 慢连接跳过本帧而不是无限排队；积压过多直接终止，由客户端重连
      if (ws.bufferedAmount > MAX_BUFFERED) {
        ws.terminate();
        this.viewers.delete(ws);
        continue;
      }
      ws.send(msg);
    }
  }

  shutdown() {
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
    if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
    if (this.wss) {
      for (const ws of this.wss.clients) {
        try { ws.terminate(); } catch {}
      }
      this.wss.close();
    }
  }
}

const relay = new Relay();
relay.start();
process.on('SIGTERM', () => { relay.shutdown(); process.exit(0); });
process.on('SIGINT', () => { relay.shutdown(); process.exit(0); });
process.on('unhandledRejection', (reason) => {
  console.error('[relay] 未处理的 Promise 拒绝:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[relay] 未捕获异常，中继退出:', err);
  try { relay.shutdown(); } catch {}
  process.exit(1);
});
