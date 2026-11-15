/**
 * 自动配药系统 - PLC WebSocket 通信服务
 * 通过 WebSocket 代理网关(端口8081)与 PLC 通信，支持 Modbus TCP / Siemens S7 / 三菱 MC 三种协议
 */

export type ProtocolType = 'modbus' | 's7' | 'mitsubishi';

export interface PlcConfig {
  host: string;
  port: number;
  protocol: ProtocolType;
  rack?: number;
  slot?: number;
  /** 三菱连接目标：仿真档 X/Y、实体 FX3U/FX5U 档 M 区；随 _lastConfig 一起重放，重连不丢档 */
  profile?: MitsubishiProfile;
}

export interface PlcStatus {
  connected: boolean;
  host: string;
  port: number;
  protocol: ProtocolType;
}

export interface PlcResult {
  success: boolean;
  error?: string;
}

export interface PlcReadResult {
  success: boolean;
  values?: boolean[];
  error?: string;
}

type WSMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};


import { plcWsUrl, canOpenPlcChannel } from '@digital-twin/shared';

/** WebSocket 端点统一由 shared 推导：同源 /ws/plc 代理，file:// 回退本机 */
const WS_URL = plcWsUrl();

import {
  MODBUS_READ_VARS, S7_VARS, ENCODER_DINT,
  mitsubishiBoolVarsFor, type MitsubishiProfile,
} from '../scenes/auto-dispensing/constants';

/**
 * 自动配药布尔 IO 变量名 → 协议地址映射（随 connect 消息下发网关，
 * 网关按此表把变量名翻译为 Modbus 线圈 / S7 M 地址 / 三菱软元件名）。
 * 三菱表随连接目标档位变化，必须在 _sendConnect 里调用时现算；
 * 模块级常量在 import 期求值，感知不到用户切换档位。
 */
const CONNECT_VARIABLES = {
  modbus: MODBUS_READ_VARS,
  s7: S7_VARS,
};

/**
 * 32 位 DINT 数值变量表：与布尔 IO 表完全分离，随 connect 一并下发网关。
 * 位置只走数据寄存器，不占任何线圈 / 输入点；增量式编码器 A/B 相接 X0/X1、
 * 高速计数器 C0 的映射由 PLC 程序负责，三菱侧默认只读 D 寄存器，S7 读 MD120。
 */
const CONNECT_WORDS = {
  ENCODER_PULSES: {
    type: 'dint32',
    wordOrder: ENCODER_DINT.WORD_ORDER,
    modbus: { address: ENCODER_DINT.MODBUS_ADDRESS, words: ENCODER_DINT.WORDS },
    s7: { address: ENCODER_DINT.S7_ADDRESS, words: ENCODER_DINT.WORDS },
    mitsubishi: { address: ENCODER_DINT.MITSUBISHI_ADDRESS, words: ENCODER_DINT.WORDS },
  },
};

export class PlcWebSocketService {
  private ws: WebSocket | null = null;
  private _connected = false;
  private _protocol: ProtocolType = 'modbus';
  private _lastConfig: PlcConfig | null = null;
  private messageHandlers = new Map<string, (result: unknown) => void>();
  private messageId = 0;
  private onDisconnected: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailCount = 0;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private consecutiveErrors = 0;
  /** 主动断开后禁止僵尸重连；下次显式 connect() 会重新置 false */
  private _disposed = false;
  /** 心跳 async 回调的 in-flight 守卫，慢响应时不并发叠加 */
  private heartbeatRunning = false;
  private static readonly MAX_RECONNECT_ATTEMPTS = 20;
  private static readonly MAX_CONSECUTIVE_ERRORS = 20;
  private static readonly MAX_PENDING = 50;

  get connected() { return this._connected; }
  get protocol() { return this._protocol; }

  setOnDisconnected(cb: (() => void) | null) { this.onDisconnected = cb; }

  private recordError() {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= PlcWebSocketService.MAX_CONSECUTIVE_ERRORS) {
      console.warn(`[PLC] 连续 ${this.consecutiveErrors} 次通信失败，判定PLC断连`);
      this.consecutiveErrors = 0;
      this.stopHeartbeat();
      this.onDisconnected?.();
    }
  }

  private recordSuccess() { this.consecutiveErrors = 0; }

  private clearHandlers() {
    this.messageHandlers.forEach((h) => {
      try { h({ success: false, error: 'WebSocket连接已断开' }); } catch { /* 处理器自身异常忽略 */ }
    });
    this.messageHandlers.clear();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // 三菱 MX 协议通过轮询本身监控连接，无需独立心跳
    if (this._protocol === 'mitsubishi') return;
    this.heartbeatFailCount = 0;
    const interval = this._protocol === 's7' ? 5000 : 3000;
    const maxFails = this._protocol === 's7' ? 2 : 3;
    this.heartbeatTimer = setInterval(async () => {
      if (this.heartbeatRunning) return;
      this.heartbeatRunning = true;
      try {
        try {
          const result = this._protocol === 'modbus'
            ? await this._sendRaw({ type: 'read-coils', address: 0, length: 1 })
            : await this._sendRaw({ type: 'read-vars', names: ['BUTTON_START'] });
          if (result.success) { this.heartbeatFailCount = 0; } else { this.heartbeatFailCount++; }
        } catch { this.heartbeatFailCount++; }
        if (this.heartbeatFailCount >= maxFails) {
          console.warn('[PLC心跳] 连续无响应，判定断连');
          this.stopHeartbeat();
          this.onDisconnected?.();
        }
      } finally {
        this.heartbeatRunning = false;
      }
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.heartbeatFailCount = 0;
  }

  /** 惰性连接：import 本模块不再自动建 WebSocket，只有显式 connect() 才建链 */

  private _connectWS() {
    // 主动断开后不允许旧 socket 的关闭事件拉起僵尸重连
    if (this._disposed) return;
    // 观众端只读镜像：绝不建立 PLC 控制通道（主控是唯一 PLC 客户端）
    if (!canOpenPlcChannel()) return;
    if (this.reconnecting) return;
    this.reconnecting = true;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(WS_URL);
      this.ws.onopen = () => {
        if (this._disposed) { this.ws?.close(); return; }
        console.log('[PLC WS] 已连接');
        this._connected = true;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        // WebSocket 重连后自动重连 PLC
        if (this._lastConfig) {
          console.log('[PLC WS] 自动重连PLC...');
          this._sendConnect(this._lastConfig).catch((e) => {
            console.warn('[PLC WS] 自动重连PLC失败:', e);
          });
        }
      };
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handler = this.messageHandlers.get(data.id);
          if (handler) { handler(data); this.messageHandlers.delete(data.id); }
        } catch (e) { console.error('[PLC WS] 解析消息出错:', e); }
      };
      this.ws.onclose = () => {
        console.log('[PLC WS] 断开');
        this._connected = false;
        this.reconnecting = false;
        this.reconnectAttempts++;
        this.stopHeartbeat();
        this.clearHandlers();
        if (this.reconnectAttempts <= PlcWebSocketService.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this._disposed) this._connectWS();
          }, 5000);
        } else {
          console.warn('[PLC WS] 达到最大重连次数');
        }
      };
      this.ws.onerror = (e) => { console.error('[PLC WS] 错误:', e); };
    } catch (e) {
      console.error('[PLC WS] 创建连接出错:', e);
      this.reconnecting = false;
      this.reconnectAttempts++;
    }
  }

  private _sendRaw(message: WSMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.messageHandlers.size >= PlcWebSocketService.MAX_PENDING) {
        reject(new Error('请求队列已满'));
        return;
      }
      if (!this._connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (message.type === 'get-status') {
          resolve({ success: false, connected: false, error: '未连接' });
          return;
        }
        reject(new Error('WebSocket未连接'));
        return;
      }

      const id = `plc_${Date.now()}_${this.messageId++}`;
      const fullMessage = { ...message, id };
      // 三菱MX需要更长超时（PS+COM开销大）
      const timeoutMs = this._protocol === 'mitsubishi' ? 15000 : (this._protocol === 's7' ? 10000 : 5000);

      const timeout = setTimeout(() => {
        if (this.messageHandlers.has(id)) { this.messageHandlers.delete(id); reject(new Error('请求超时')); }
      }, timeoutMs);

      this.messageHandlers.set(id, (result: unknown) => {
        clearTimeout(timeout);
        this.messageHandlers.delete(id);
        const r = result as Record<string, unknown>;
        if (r.success) { resolve(r); }
        else { reject(new Error((r.error as string) || '操作失败')); }
      });

      this.ws!.send(JSON.stringify(fullMessage));
    });
  }

  private async _sendConnect(config: PlcConfig): Promise<PlcResult> {
    try {
      const variables = config.protocol === 'mitsubishi'
        ? mitsubishiBoolVarsFor(config.profile ?? 'simulator')
        : CONNECT_VARIABLES[config.protocol];
      if (config.protocol === 's7') {
        const result = await this._sendRaw({
          type: 'connect', protocol: 's7', host: config.host,
          port: config.port || 102, rack: config.rack || 0, slot: config.slot || 1,
          variables,
          wordVariables: CONNECT_WORDS,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      } else if (config.protocol === 'mitsubishi') {
        const result = await this._sendRaw({
          type: 'connect', protocol: 'mitsubishi', host: config.host, port: config.port ?? 0,
          variables,
          wordVariables: CONNECT_WORDS,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      } else {
        const result = await this._sendRaw({
          type: 'connect', protocol: 'modbus', host: config.host, port: config.port || 502,
          variables,
          wordVariables: CONNECT_WORDS,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      }
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  /** 等待 WS 就绪，带 30s 上限；主动断开或超时立即返回，不让连接面板永久挂起 */
  private _waitForConnection(timeoutMs = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        this.waitTimer = null;
        if (this._connected) { resolve(true); return; }
        // 创建 WS 失败 / onclose 已触发时 reconnecting 会归 false，无需白等超时
        if (!this.reconnecting && Date.now() - started > 500) { resolve(false); return; }
        if (this._disposed || Date.now() - started >= timeoutMs) { resolve(false); return; }
        this.waitTimer = setTimeout(check, 100);
      };
      check();
    });
  }

  async connect(config: PlcConfig): Promise<PlcResult> {
    // 观众端只读镜像：连面板都不该进这条链路，更不该等 30s 连接超时
    if (!canOpenPlcChannel()) return { success: false, error: '观众端只读，不建立 PLC 通道' };
    this._disposed = false;
    this._protocol = config.protocol;

    if (!this._connected) {
      // 首次建链时 onopen 不应拿旧配置自动重连，否则会与本次握手重复发 connect 帧
      this._lastConfig = null;
      this._connectWS();
      const ready = await this._waitForConnection();
      if (!ready || !this._connected) {
        return { success: false, error: 'WebSocket代理连接失败或超时(端口8081)' };
      }
    }

    const result = await this._sendConnect(config);
    // 只有握手成功才记住配置，供 WS 意外断开后 onopen 自动重连 PLC
    if (result.success) this._lastConfig = config;
    return result;
  }

  async disconnect(): Promise<PlcResult> {
    this._disposed = true;
    this.stopHeartbeat();
    if (this.waitTimer) { clearTimeout(this.waitTimer); this.waitTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this._connected = false;
    this.clearHandlers();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    return { success: true };
  }

  async readCoils(address: number, length: number): Promise<PlcReadResult> {
    try {
      const result = await this._sendRaw({ type: 'read-coils', address, length });
      this.recordSuccess();
      return { success: true, values: result.values as boolean[] | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async readVars(names: string[]): Promise<{ success: boolean; values?: Record<string, boolean>; error?: string }> {
    try {
      const result = await this._sendRaw({ type: 'read-vars', names });
      this.recordSuccess();
      return { success: true, values: result.values as Record<string, boolean> | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async writeCoil(address: number, value: boolean): Promise<PlcResult> {
    try {
      const result = await this._sendRaw({ type: 'write-coil', address, value });
      this.recordSuccess();
      return { success: true, error: result.error as string | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async writeCoils(address: number, values: boolean[]): Promise<PlcResult> {
    try {
      const result = await this._sendRaw({ type: 'write-coils', address, values });
      this.recordSuccess();
      return { success: true, error: result.error as string | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async writeVar(name: string, value: boolean): Promise<PlcResult> {
    try {
      const result = await this._sendRaw({ type: 'write-var', name, value });
      this.recordSuccess();
      return { success: true, error: result.error as string | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async writeVars(names: string[], values: boolean[]): Promise<PlcResult> {
    try {
      const result = await this._sendRaw({ type: 'write-vars', names, values });
      this.recordSuccess();
      return { success: true, error: result.error as string | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  /** 读 32 位 DINT 数值变量（位置寄存器专用通道，与布尔 IO 完全分离） */
  async readWords(names: string[]): Promise<{ success: boolean; values?: Record<string, number>; error?: string }> {
    try {
      const result = await this._sendRaw({ type: 'read-words', names });
      this.recordSuccess();
      return { success: true, values: result.values as Record<string, number> | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  /** 写一个 32 位 DINT 数值变量 */
  async writeWord(name: string, value: number): Promise<PlcResult> {
    return this.writeWords([name], [value]);
  }

  /** 批量写 32 位 DINT 数值变量 */
  async writeWords(names: string[], values: number[]): Promise<PlcResult> {
    try {
      const result = await this._sendRaw({ type: 'write-words', names, values });
      this.recordSuccess();
      return { success: true, error: result.error as string | undefined };
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async getStatus(): Promise<PlcStatus> {
    try {
      const result = await this._sendRaw({ type: 'get-status' });
      return {
        connected: !!result.connected,
        host: (result.host as string) || '',
        port: (result.port as number) || 0,
        protocol: (result.protocol as ProtocolType) || this._protocol,
      };
    } catch {
      return { connected: false, host: '', port: 0, protocol: this._protocol };
    }
  }
}

export const plcService = new PlcWebSocketService();