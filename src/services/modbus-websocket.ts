/**
 * ================================================
 * 文件名: modbus-websocket.ts
 * 功能: 数字孪生传送带分拣系统 - PLC通信服务
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: 浏览器WebSocket API
 * - 被依赖: useSimMode.ts, useScoring.ts
 * - 数据流向: WebSocket代理服务器 -> 本服务 -> 设备状态更新
 *             传感器/磁性开关状态 -> 本服务 -> WebSocket代理服务器 -> PLC
 * 
 * 【功能说明】
 * 本服务类实现通过WebSocket与PLC代理服务器通信，桥接前端与PLC：
 * 1. 自动连接到本地WebSocket服务器（端口8081）
 * 2. 支持 Modbus TCP 和 Siemens S7 两种协议
 * 3. 批量写入传感器和磁性开关反馈
 * 4. 自动重连机制（断开后5秒重试）
 * 
 * 【通信架构】
 * 前端 <-> WebSocket(8081) <-> Node.js代理 <-> PLC(ModbusTCP:502 或 S7:102)
 */

export const MODBUS_ADDRESSES = {
  START: 0,
  RESET: 1,
  STOP: 11,
  FEED_CYLINDER_VALVE: 100,
  SORTING1_CYLINDER_VALVE: 101,
  SORTING2_CYLINDER_VALVE: 102,
  CONVEYOR: 103,
  SIGNAL_TOWER_RED: 104,
  SIGNAL_TOWER_GREEN: 105,
  SIGNAL_TOWER_YELLOW: 106,
  SENSOR_FEED: 8,
  SENSOR_COLOR: 9,
  SENSOR_MATERIAL: 10,
  MAGNETIC_FEED_RETRACT: 2,
  MAGNETIC_FEED_EXTEND: 3,
  MAGNETIC_SORTING1_RETRACT: 4,
  MAGNETIC_SORTING1_EXTEND: 5,
  MAGNETIC_SORTING2_RETRACT: 6,
  MAGNETIC_SORTING2_EXTEND: 7,
} as const;

export const S7_VARIABLES = {
  START: 'M10.0',
  RESET: 'M10.1',
  STOP: 'M21.0',
  FEED_CYLINDER_VALVE: 'M100.0',
  SORTING1_CYLINDER_VALVE: 'M101.0',
  SORTING2_CYLINDER_VALVE: 'M102.0',
  CONVEYOR: 'M103.0',
  SIGNAL_TOWER_RED: 'M104.0',
  SIGNAL_TOWER_GREEN: 'M105.0',
  SIGNAL_TOWER_YELLOW: 'M106.0',
  MAGNETIC_FEED_RETRACT: 'M12.0',
  MAGNETIC_FEED_EXTEND: 'M12.1',
  MAGNETIC_SORTING1_RETRACT: 'M14.0',
  MAGNETIC_SORTING1_EXTEND: 'M14.1',
  MAGNETIC_SORTING2_RETRACT: 'M16.0',
  MAGNETIC_SORTING2_EXTEND: 'M16.1',
  SENSOR_FEED: 'M18.0',
  SENSOR_COLOR: 'M19.0',
  SENSOR_MATERIAL: 'M20.0',
} as const;

export type ProtocolType = 'modbus' | 's7';

export interface ModbusConfig {
  host: string;
  port: number;
  protocol?: ProtocolType;
  rack?: number;
  slot?: number;
}

export interface ModbusStatus {
  connected: boolean;
  host: string;
  port: number;
  protocol: ProtocolType;
}

export interface ModbusResult {
  success: boolean;
  error?: string;
}

export interface ModbusReadResult {
  success: boolean;
  values?: boolean[];
  error?: string;
}

type WSMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

export class ModbusService {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private currentProtocol: ProtocolType = 'modbus';
  private messageHandlers: Map<string, (result: any) => void> = new Map();
  private messageId: number = 0;
  private onPlcDisconnected: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailCount: number = 0;
  private reconnecting: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private consecutiveErrors: number = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 20;
  private static readonly MAX_CONSECUTIVE_ERRORS = 5;
  private static readonly MAX_PENDING_MESSAGES = 50;

  setOnPlcDisconnected(callback: (() => void) | null) {
    this.onPlcDisconnected = callback;
  }

  private recordError() {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= ModbusService.MAX_CONSECUTIVE_ERRORS) {
      console.warn(`[Modbus] 连续 ${this.consecutiveErrors} 次通信失败，判定PLC断连`);
      this.consecutiveErrors = 0;
      this.stopHeartbeat();
      this.onPlcDisconnected?.();
    }
  }

  private recordSuccess() {
    this.consecutiveErrors = 0;
  }

  private clearAllMessageHandlers() {
    const error = new Error('WebSocket连接已断开');
    this.messageHandlers.forEach(handler => {
      try {
        handler({ success: false, error: error.message });
      } catch {
        // 忽略处理消息时的错误
      }
    });
    this.messageHandlers.clear();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatFailCount = 0;
    const interval = this.currentProtocol === 's7' ? 5000 : 3000;
    const maxFails = this.currentProtocol === 's7' ? 2 : 3;
    this.heartbeatTimer = setInterval(async () => {
      try {
        let result;
        if (this.currentProtocol === 's7') {
          result = await this.readVarsS7(['START']);
        } else {
          result = await this.readCoilsWithoutRecord(0, 1);
        }
        if (result.success) {
          this.heartbeatFailCount = 0;
        } else {
          this.heartbeatFailCount++;
        }
      } catch {
        this.heartbeatFailCount++;
      }
      if (this.heartbeatFailCount >= maxFails) {
        console.warn('[心跳检测] PLC 连续', this.heartbeatFailCount, '次无响应，判定断连');
        this.stopHeartbeat();
        this.onPlcDisconnected?.();
      }
    }, interval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatFailCount = 0;
  }

  constructor() {
    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (this.reconnecting) {
      return;
    }
    
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
      this.ws = new WebSocket('ws://localhost:8081');
      
      this.ws.onopen = () => {
        console.log('WebSocket已连接');
        this.connected = true;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handler = this.messageHandlers.get(data.id);
          if (handler) {
            handler(data);
            this.messageHandlers.delete(data.id);
          }
        } catch (error) {
          console.error('处理WebSocket消息时出错:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket已断开');
        this.connected = false;
        this.reconnecting = false;
        this.reconnectAttempts++;
        this.clearAllMessageHandlers();
        if (this.reconnectAttempts <= ModbusService.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
          }, 5000);
        } else {
          console.warn('[WebSocket] 达到最大重连次数，停止重连');
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };
    } catch (error) {
      console.error('创建WebSocket连接时出错:', error);
      this.reconnecting = false;
      this.reconnectAttempts++;
      if (this.reconnectAttempts <= ModbusService.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connectWebSocket();
        }, 5000);
      }
    }
  }

  private sendMessage(message: WSMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.messageHandlers.size >= ModbusService.MAX_PENDING_MESSAGES) {
        reject(new Error('请求队列已满，请稍后重试'));
        return;
      }
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (message.type === 'get-status') {
            resolve({ success: false, connected: false, error: 'WebSocket未连接' });
            return;
        }
        reject(new Error('WebSocket未连接'));
        return;
      }

      const id = `msg_${Date.now()}_${this.messageId++}`;
      const fullMessage = { ...message, id };

      const timeoutMs = this.currentProtocol === 's7' ? 8000 : 5000;
      const timeout = setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('请求超时'));
        }
      }, timeoutMs);

      this.messageHandlers.set(id, (result) => {
        clearTimeout(timeout);
        this.messageHandlers.delete(id);
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || '操作失败'));
        }
      });

      this.ws!.send(JSON.stringify(fullMessage));
    });
  }

  isAvailable(): boolean {
    return this.connected;
  }

  getProtocol(): ProtocolType {
    return this.currentProtocol;
  }

  async connect(config: ModbusConfig): Promise<ModbusResult> {
    const protocol = config.protocol || 'modbus';
    this.currentProtocol = protocol;
    
    try {
      if (protocol === 's7') {
        const result = await this.sendMessage({
          type: 'connect',
          protocol: 's7',
          host: config.host,
          port: config.port || 102,
          rack: config.rack || 0,
          slot: config.slot || 1,
          variables: S7_VARIABLES,
        });
        if (result.success) {
          this.consecutiveErrors = 0;
          this.startHeartbeat();
        }
        return { success: result.success, error: result.error };
      } else {
        const result = await this.sendMessage({
          type: 'connect',
          host: config.host,
          port: config.port || 502,
        });
        if (result.success) {
          this.consecutiveErrors = 0;
          this.startHeartbeat();
        }
        return { success: result.success, error: result.error };
      }
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async disconnect(): Promise<ModbusResult> {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    try {
      const result = await this.sendMessage({
        type: 'disconnect',
      });
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('断开连接失败:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  async writeCoils(address: number, values: boolean[]): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return { success: false, error: '当前使用S7协议，请使用writeVar方法' };
    }
    try {
      const result = await this.sendMessage({
        type: 'write-coils',
        address,
        values,
      });
      this.recordSuccess();
      return { success: result.success, error: result.error };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async writeFeedbackBatchModbus(values: {
    magneticExtend: { feed: boolean, sort1: boolean, sort2: boolean },
    magneticRetract: { feed: boolean, sort1: boolean, sort2: boolean },
    sensors: { feed: boolean, color: boolean, material: boolean }
  }): Promise<ModbusResult> {
    const data = [
      values.magneticRetract.feed,
      values.magneticExtend.feed,
      values.magneticRetract.sort1,
      values.magneticExtend.sort1,
      values.magneticRetract.sort2,
      values.magneticExtend.sort2,
      values.sensors.feed,
      values.sensors.color,
      values.sensors.material
    ];
    return this.writeCoils(2, data);
  }

  async writeFeedbackBatchS7(values: {
    magneticExtend: { feed: boolean, sort1: boolean, sort2: boolean },
    magneticRetract: { feed: boolean, sort1: boolean, sort2: boolean },
    sensors: { feed: boolean, color: boolean, material: boolean }
  }): Promise<ModbusResult> {
    const names = [
      'MAGNETIC_FEED_RETRACT', 'MAGNETIC_FEED_EXTEND',
      'MAGNETIC_SORTING1_RETRACT', 'MAGNETIC_SORTING1_EXTEND',
      'MAGNETIC_SORTING2_RETRACT', 'MAGNETIC_SORTING2_EXTEND',
      'SENSOR_FEED', 'SENSOR_COLOR', 'SENSOR_MATERIAL'
    ];
    const vals = [
      values.magneticRetract.feed,
      values.magneticExtend.feed,
      values.magneticRetract.sort1,
      values.magneticExtend.sort1,
      values.magneticRetract.sort2,
      values.magneticExtend.sort2,
      values.sensors.feed,
      values.sensors.color,
      values.sensors.material
    ];
    return this.writeVarsS7(names, vals);
  }

  async writeFeedbackBatch(values: {
    magneticExtend: { feed: boolean, sort1: boolean, sort2: boolean },
    magneticRetract: { feed: boolean, sort1: boolean, sort2: boolean },
    sensors: { feed: boolean, color: boolean, material: boolean }
  }): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return this.writeFeedbackBatchS7(values);
    } else {
      return this.writeFeedbackBatchModbus(values);
    }
  }

  async writeCoil(address: number, value: boolean): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return { success: false, error: '请使用writeVar方法' };
    }
    try {
      const result = await this.sendMessage({
        type: 'write-coil',
        address,
        value,
      });
      this.recordSuccess();
      return { success: result.success, error: result.error };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async writeVarS7(name: string, value: boolean): Promise<ModbusResult> {
    try {
      const result = await this.sendMessage({
        type: 'write-var',
        name,
        value,
      });
      this.recordSuccess();
      return { success: result.success, error: result.error };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async writeVarsS7(names: string[], values: boolean[]): Promise<ModbusResult> {
    try {
      const result = await this.sendMessage({
        type: 'write-vars',
        names,
        values,
      });
      this.recordSuccess();
      return { success: result.success, error: result.error };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async readCoils(address: number, length: number): Promise<ModbusReadResult> {
    if (this.currentProtocol === 's7') {
      return { success: false, error: '请使用readVarsS7方法' };
    }
    try {
      const result = await this.sendMessage({
        type: 'read-coils',
        address,
        length,
      });
      this.recordSuccess();
      return {
        success: result.success,
        values: result.values,
        error: result.error,
      };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async readVarsS7(varNames: string[]): Promise<{ success: boolean; values?: Record<string, boolean>; error?: string }> {
    try {
      const result = await this.sendMessage({
        type: 'read-vars',
        names: varNames,
      });
      this.recordSuccess();
      return {
        success: result.success,
        values: result.values,
        error: result.error,
      };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  private async readCoilsWithoutRecord(address: number, length: number): Promise<ModbusReadResult> {
    try {
      const result = await this.sendMessage({
        type: 'read-coils',
        address,
        length,
      });
      return {
        success: result.success,
        values: result.values,
        error: result.error,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getStatus(): Promise<ModbusStatus> {
    try {
      const result = await this.sendMessage({
        type: 'get-status',
      });
      return {
        connected: result.connected || false,
        host: result.host || '',
        port: result.port || 0,
        protocol: result.protocol || this.currentProtocol,
      };
    } catch (error) {
      console.error('获取状态失败:', error);
      return { connected: false, host: '', port: 0, protocol: this.currentProtocol };
    }
  }

  async writeFeedSensor(active: boolean): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return this.writeVarS7('SENSOR_FEED', active);
    }
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_FEED, active);
  }

  async writeColorSensor(active: boolean): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return this.writeVarS7('SENSOR_COLOR', active);
    }
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_COLOR, active);
  }

  async writeMaterialSensor(active: boolean): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      return this.writeVarS7('SENSOR_MATERIAL', active);
    }
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_MATERIAL, active);
  }

  async writeMagneticSwitch(name: 'feed' | 'sorting1' | 'sorting2', extended: boolean): Promise<ModbusResult> {
    if (!this.connected) {
      return { success: false, error: '未连接' };
    }

    if (this.currentProtocol === 's7') {
      const varMap = {
        feed: { extend: 'MAGNETIC_FEED_EXTEND', retract: 'MAGNETIC_FEED_RETRACT' },
        sorting1: { extend: 'MAGNETIC_SORTING1_EXTEND', retract: 'MAGNETIC_SORTING1_RETRACT' },
        sorting2: { extend: 'MAGNETIC_SORTING2_EXTEND', retract: 'MAGNETIC_SORTING2_RETRACT' },
      };
      const vars = varMap[name];
      try {
        await Promise.all([
          this.writeVarS7(vars.extend, extended),
          this.writeVarS7(vars.retract, !extended),
        ]);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }

    const addressMap = {
      feed: {
        extend: MODBUS_ADDRESSES.MAGNETIC_FEED_EXTEND,
        retract: MODBUS_ADDRESSES.MAGNETIC_FEED_RETRACT,
      },
      sorting1: {
        extend: MODBUS_ADDRESSES.MAGNETIC_SORTING1_EXTEND,
        retract: MODBUS_ADDRESSES.MAGNETIC_SORTING1_RETRACT,
      },
      sorting2: {
        extend: MODBUS_ADDRESSES.MAGNETIC_SORTING2_EXTEND,
        retract: MODBUS_ADDRESSES.MAGNETIC_SORTING2_RETRACT,
      },
    };

    const addresses = addressMap[name];
    
    try {
      await Promise.all([
        this.writeCoil(addresses.extend, extended),
        this.writeCoil(addresses.retract, !extended),
      ]);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async readAllControlSignals(): Promise<ModbusReadResult> {
    try {
      if (this.currentProtocol === 's7') {
        const varNames = [
          'START', 'RESET',
          'MAGNETIC_FEED_RETRACT', 'MAGNETIC_FEED_EXTEND',
          'MAGNETIC_SORTING1_RETRACT', 'MAGNETIC_SORTING1_EXTEND',
          'MAGNETIC_SORTING2_RETRACT', 'MAGNETIC_SORTING2_EXTEND',
          'SENSOR_FEED', 'SENSOR_COLOR', 'SENSOR_MATERIAL',
          'STOP',
          'FEED_CYLINDER_VALVE', 'SORTING1_CYLINDER_VALVE', 'SORTING2_CYLINDER_VALVE',
          'CONVEYOR', 'SIGNAL_TOWER_RED', 'SIGNAL_TOWER_GREEN', 'SIGNAL_TOWER_YELLOW'
        ];
        const result = await this.readVarsS7(varNames);
        if (result.success && result.values) {
          const values = new Array(107).fill(false);
          const v = result.values;
          values[MODBUS_ADDRESSES.START] = !!v['START'];
          values[MODBUS_ADDRESSES.RESET] = !!v['RESET'];
          values[MODBUS_ADDRESSES.MAGNETIC_FEED_RETRACT] = !!v['MAGNETIC_FEED_RETRACT'];
          values[MODBUS_ADDRESSES.MAGNETIC_FEED_EXTEND] = !!v['MAGNETIC_FEED_EXTEND'];
          values[MODBUS_ADDRESSES.MAGNETIC_SORTING1_RETRACT] = !!v['MAGNETIC_SORTING1_RETRACT'];
          values[MODBUS_ADDRESSES.MAGNETIC_SORTING1_EXTEND] = !!v['MAGNETIC_SORTING1_EXTEND'];
          values[MODBUS_ADDRESSES.MAGNETIC_SORTING2_RETRACT] = !!v['MAGNETIC_SORTING2_RETRACT'];
          values[MODBUS_ADDRESSES.MAGNETIC_SORTING2_EXTEND] = !!v['MAGNETIC_SORTING2_EXTEND'];
          values[MODBUS_ADDRESSES.SENSOR_FEED] = !!v['SENSOR_FEED'];
          values[MODBUS_ADDRESSES.SENSOR_COLOR] = !!v['SENSOR_COLOR'];
          values[MODBUS_ADDRESSES.SENSOR_MATERIAL] = !!v['SENSOR_MATERIAL'];
          values[MODBUS_ADDRESSES.STOP] = !!v['STOP'];
          values[MODBUS_ADDRESSES.FEED_CYLINDER_VALVE] = !!v['FEED_CYLINDER_VALVE'];
          values[MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE] = !!v['SORTING1_CYLINDER_VALVE'];
          values[MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE] = !!v['SORTING2_CYLINDER_VALVE'];
          values[MODBUS_ADDRESSES.CONVEYOR] = !!v['CONVEYOR'];
          values[MODBUS_ADDRESSES.SIGNAL_TOWER_RED] = !!v['SIGNAL_TOWER_RED'];
          values[MODBUS_ADDRESSES.SIGNAL_TOWER_GREEN] = !!v['SIGNAL_TOWER_GREEN'];
          values[MODBUS_ADDRESSES.SIGNAL_TOWER_YELLOW] = !!v['SIGNAL_TOWER_YELLOW'];
          return { success: true, values };
        }
        console.warn('[S7] readAllControlSignals 失败:', result.error);
        return { success: false, error: result.error };
      } else {
        const result = await this.readCoils(0, 107);
        if (result.success && result.values) {
          return { success: true, values: result.values };
        }
        return { success: false, error: result.error || '批量读取失败' };
      }
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  async writeSignal(address: number, value: boolean): Promise<ModbusResult> {
    if (this.currentProtocol === 's7') {
      const addressToVarName: Record<number, string> = {
        [MODBUS_ADDRESSES.START]: 'START',
        [MODBUS_ADDRESSES.RESET]: 'RESET',
        [MODBUS_ADDRESSES.STOP]: 'STOP',
        [MODBUS_ADDRESSES.FEED_CYLINDER_VALVE]: 'FEED_CYLINDER_VALVE',
        [MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE]: 'SORTING1_CYLINDER_VALVE',
        [MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE]: 'SORTING2_CYLINDER_VALVE',
        [MODBUS_ADDRESSES.CONVEYOR]: 'CONVEYOR',
        [MODBUS_ADDRESSES.SIGNAL_TOWER_RED]: 'SIGNAL_TOWER_RED',
        [MODBUS_ADDRESSES.SIGNAL_TOWER_GREEN]: 'SIGNAL_TOWER_GREEN',
        [MODBUS_ADDRESSES.SIGNAL_TOWER_YELLOW]: 'SIGNAL_TOWER_YELLOW',
      };
      const varName = addressToVarName[address];
      if (!varName) {
        return { success: false, error: `S7: 地址 ${address} 无映射` };
      }
      return this.writeVarS7(varName, value);
    } else {
      return this.writeCoil(address, value);
    }
  }
}

export const modbusService = new ModbusService();
