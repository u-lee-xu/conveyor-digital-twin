/**
 * 煤料智能分拣 - PLC WebSocket 通信服务
 * 通过 WebSocket 代理网关(端口8081)与 PLC 通信，支持 Modbus TCP / Siemens S7 / 三菱 MC 三种协议
 */

export type ProtocolType = 'modbus' | 's7' | 'mitsubishi';

export interface PlcConfig {
  host: string;
  port: number;
  protocol: ProtocolType;
  rack?: number;
  slot?: number;
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

const WS_URL = 'ws://localhost:8081';

import { MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS, MITSUBISHI_WRITE_VARS } from '../scenes/coal-sorting/constants';

/**
 * 煤料分拣 IO 变量名 → 协议地址映射（随 connect 消息下发网关，
 * 网关按此表把变量名翻译为 Modbus 线圈 / S7 M 地址 / 三菱 X/Y 地址）
 */

const CONNECT_VARIABLES = {
  modbus: MODBUS_READ_VARS,
  s7: S7_VARS,
  mitsubishi: { ...MITSUBISHI_READ_VARS, ...MITSUBISHI_WRITE_VARS },
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
  private reconnectAttempts = 0;
  private consecutiveErrors = 0;
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
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.heartbeatFailCount = 0;
  }

  constructor() { this._connectWS(); }

  private _connectWS() {
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
          this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connectWS(); }, 5000);
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
      const variables = CONNECT_VARIABLES[config.protocol];
      if (config.protocol === 's7') {
        const result = await this._sendRaw({
          type: 'connect', protocol: 's7', host: config.host,
          port: config.port || 102, rack: config.rack || 0, slot: config.slot || 1,
          variables,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      } else if (config.protocol === 'mitsubishi') {
        const result = await this._sendRaw({
          type: 'connect', protocol: 'mitsubishi', host: config.host, port: config.port ?? 0,
          variables,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      } else {
        const result = await this._sendRaw({
          type: 'connect', protocol: 'modbus', host: config.host, port: config.port || 502,
          variables,
        });
        if (result.success) { this.recordSuccess(); this.startHeartbeat(); }
        return { success: !!result.success, error: result.error as string | undefined };
      }
    } catch (e) {
      this.recordError();
      return { success: false, error: (e as Error).message };
    }
  }

  async connect(config: PlcConfig): Promise<PlcResult> {
    this._protocol = config.protocol;
    this._lastConfig = config;

    if (!this._connected) {
      this._connectWS();
      await new Promise<void>((resolve) => {
        const check = () => { if (this._connected || !this.reconnecting) resolve(); else setTimeout(check, 100); };
        setTimeout(check, 100);
      });
      if (!this._connected) return { success: false, error: 'WebSocket代理连接失败(端口8081)' };
    }

    return this._sendConnect(config);
  }

  async disconnect(): Promise<PlcResult> {
    this.stopHeartbeat();
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
