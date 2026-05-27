/**
 * ================================================
 * 文件名: modbus-websocket.ts
 * 功能: 数字孪生传送带分拣系统 - Modbus WebSocket服务
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: 浏览器WebSocket API
 * - 被依赖: useSimMode.ts, useScoring.ts
 * - 数据流向: WebSocket代理服务器 -> 本服务 -> 设备状态更新
 *             传感器/磁性开关状态 -> 本服务 -> WebSocket代理服务器 -> PLC
 * 
 * 【功能说明】
 * 本服务类实现通过WebSocket与Modbus代理服务器通信，桥接前端与PLC：
 * 1. 自动连接到本地WebSocket服务器（端口8081）
 * 2. 支持Modbus线圈读写操作
 * 3. 批量写入传感器和磁性开关反馈
 * 4. 自动重连机制（断开后5秒重试）
 * 
 * 【通信架构】
 * 前端 <-> WebSocket(8081) <-> Node.js代理 <-> PLC(ModbusTCP:502)
 */

/**
 * Modbus地址定义（全部使用线圈）
 * 
 * 地址映射表：
 * - 控制信号（PLC输出 -> 数字孪生输入）: 地址 0-1, 100-103
 * - 反馈信号（数字孪生输出 -> PLC输入）: 地址 2-10
 */
export const MODBUS_ADDRESSES = {
  // ============================================
  // 控制信号（PLC输出）- 线圈
  // ============================================
  START: 0,                      // 00001 启动信号 (M0)
  RESET: 1,                      // 00002 复位信号 (M1)
  FEED_CYLINDER_VALVE: 100,      // 00101 上料气缸伸出阀 (M100)
  SORTING1_CYLINDER_VALVE: 101,  // 00102 分拣气缸1伸出阀 (M101)
  SORTING2_CYLINDER_VALVE: 102,  // 00103 分拣气缸2伸出阀 (M102)
  CONVEYOR: 103,                 // 00104 传送带控制 (M103)

  // ============================================
  // 传感器反馈（数字孪生输出 -> PLC输入）- 线圈
  // ============================================
  SENSOR_FEED: 8,                // 00009 上料传感器 (M8)
  SENSOR_COLOR: 9,               // 00010 色标传感器 (M9)
  SENSOR_MATERIAL: 10,           // 00011 物料传感器 (M10)
  MAGNETIC_FEED_RETRACT: 2,      // 00003 上料气缸缩回限位 (M2)
  MAGNETIC_FEED_EXTEND: 3,       // 00004 上料气缸伸出限位 (M3)
  MAGNETIC_SORTING1_RETRACT: 4,  // 00005 分拣气缸1缩回限位 (M4)
  MAGNETIC_SORTING1_EXTEND: 5,   // 00006 分拣气缸1伸出限位 (M5)
  MAGNETIC_SORTING2_RETRACT: 6,  // 00007 分拣气缸2缩回限位 (M6)
  MAGNETIC_SORTING2_EXTEND: 7,   // 00008 分拣气缸2伸出限位 (M7)
} as const;

/**
 * Modbus配置接口
 */
export interface ModbusConfig {
  host: string;
  port: number;
}

/**
 * Modbus连接状态接口
 */
export interface ModbusStatus {
  connected: boolean;
  host: string;
  port: number;
}

/**
 * Modbus操作结果接口
 */
export interface ModbusResult {
  success: boolean;
  error?: string;
}

/**
 * Modbus读取结果接口
 */
export interface ModbusReadResult {
  success: boolean;
  values?: boolean[];
  error?: string;
}

/**
 * WebSocket消息类型
 */
type WSMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

/**
 * Modbus服务类（WebSocket版本）
 * 通过WebSocket与Node.js代理服务器通信，实现与PLC的ModbusTCP通信
 */
export class ModbusService {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private messageHandlers: Map<string, (result: any) => void> = new Map();
  private messageId: number = 0;
  private onPlcDisconnected: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailCount: number = 0;
  private reconnecting: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private consecutiveErrors: number = 0;
  private static readonly HEARTBEAT_INTERVAL = 3000;
  private static readonly HEARTBEAT_MAX_FAILS = 3;
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
      } catch {}
    });
    this.messageHandlers.clear();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatFailCount = 0;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const result = await this.readCoilsWithoutRecord(0, 1);
        if (result.success) {
          this.heartbeatFailCount = 0;
        } else {
          this.heartbeatFailCount++;
        }
      } catch {
        this.heartbeatFailCount++;
      }
      if (this.heartbeatFailCount >= ModbusService.HEARTBEAT_MAX_FAILS) {
        console.warn('[心跳检测] PLC 连续', this.heartbeatFailCount, '次无响应，判定断连');
        this.stopHeartbeat();
        this.onPlcDisconnected?.();
      }
    }, ModbusService.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatFailCount = 0;
  }

  constructor() {
    // 默认连接到本地WebSocket服务器
    this.connectWebSocket();
  }

  /**
   * 连接WebSocket服务器
   */
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

  /**
   * 发送消息到WebSocket服务器
   */
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

      const timeout = setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('请求超时'));
        }
      }, 5000);

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

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.connected;
  }

  /**
   * 连接到ModbusTCP服务器
   */
  async connect(host: string, port: number): Promise<ModbusResult> {
    try {
      const result = await this.sendMessage({
        type: 'connect',
        host,
        port,
      });
      if (result.success) {
        this.consecutiveErrors = 0;
        this.startHeartbeat();
      }
      return { success: result.success, error: result.error };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 断开连接
   */
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
      console.error('Modbus断开失败:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 写入多个线圈（批量反馈）
   */
  async writeCoils(address: number, values: boolean[]): Promise<ModbusResult> {
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

  /**
   * 批量写入反馈信号（地址 2 到 10）
   */
  async writeFeedbackBatch(values: {
    magneticExtend: { feed: boolean, sort1: boolean, sort2: boolean },
    magneticRetract: { feed: boolean, sort1: boolean, sort2: boolean },
    sensors: { feed: boolean, color: boolean, material: boolean }
  }): Promise<ModbusResult> {
    // 构造连续地址 2-10 的布尔数组
    // 地址: 2,       3,       4,        5,        6,        7,        8,   9,   10
    const data = [
      values.magneticRetract.feed,  // 2: 上料缩回限位
      values.magneticExtend.feed,   // 3: 上料伸出限位
      values.magneticRetract.sort1, // 4: 分拣1缩回限位
      values.magneticExtend.sort1,  // 5: 分拣1伸出限位
      values.magneticRetract.sort2, // 6: 分拣2缩回限位
      values.magneticExtend.sort2,  // 7: 分拣2伸出限位
      values.sensors.feed,          // 8: 上料传感器
      values.sensors.color,         // 9: 色标传感器
      values.sensors.material       // 10: 物料传感器
    ];
    
    return this.writeCoils(2, data);
  }

  /**
   * 写入线圈（传感器信号）
   */
  async writeCoil(address: number, value: boolean): Promise<ModbusResult> {
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

  /**
   * 写入线圈（传感器反馈信号）
   * 注：在仿真模式下，数字孪生写入传感器状态，让PLC能读取
   */
  async writeSensorFeedback(address: number, value: boolean): Promise<ModbusResult> {
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

  /**
   * 读取线圈（气缸状态反馈）
   */
  async readCoils(address: number, length: number): Promise<ModbusReadResult> {
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

  /**
   * 获取连接状态
   */
  async getStatus(): Promise<ModbusStatus> {
    try {
      const result = await this.sendMessage({
        type: 'get-status',
      });
      return {
        connected: result.connected || false,
        host: result.host || '',
        port: result.port || 0,
      };
    } catch (error) {
      console.error('获取Modbus状态失败:', error);
      return { connected: false, host: '', port: 0 };
    }
  }

  /**
   * 写入上料传感器状态
   */
  async writeFeedSensor(active: boolean): Promise<ModbusResult> {
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_FEED, active);
  }

  /**
   * 写入色标传感器状态
   */
  async writeColorSensor(active: boolean): Promise<ModbusResult> {
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_COLOR, active);
  }

  /**
   * 写入物料传感器状态
   */
  async writeMaterialSensor(active: boolean): Promise<ModbusResult> {
    return this.writeCoil(MODBUS_ADDRESSES.SENSOR_MATERIAL, active);
  }

  /**
   * 写入磁性开关状态
   */
  async writeMagneticSwitch(name: 'feed' | 'sorting1' | 'sorting2', extended: boolean): Promise<ModbusResult> {
    if (!this.connected) {
      return { success: false, error: '未连接' };
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
    
    // 写入伸出限位和缩回限位
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

  /**
   * 读取所有控制信号（从线圈）- 使用批量读取大幅提升性能
   */
  async readAllControlSignals(): Promise<ModbusReadResult> {
    try {
      // 批量读取地址 0 到 103 (覆盖所有控制信号、传感器和磁性开关)
      // M0-M10 对应 0-10, M100-M103 对应 100-103
      // 读取长度为 104 即可覆盖所有区间
      const result = await this.readCoils(0, 104);

      if (result.success && result.values) {
        // 直接返回完整的布尔数组，地址即为索引
        return { success: true, values: result.values };
      }
      return { success: false, error: result.error || '批量读取失败' };
    } catch (error) {
      this.recordError();
      return { success: false, error: (error as Error).message };
    }
  }
}

// 单例实例
export const modbusService = new ModbusService();