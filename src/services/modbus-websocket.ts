// Modbus地址定义（全部使用线圈）
export const MODBUS_ADDRESSES = {
  // 控制信号（PLC输出）- 线圈
  START: 0,                      // 00001 启动 (M0)
  RESET: 1,                      // 00002 复位 (M1)
  FEED_CYLINDER_VALVE: 100,      // 00101 上料气缸伸出阀 (M100)
  SORTING1_CYLINDER_VALVE: 101,  // 00102 推料1气缸伸出阀 (M101)
  SORTING2_CYLINDER_VALVE: 102,  // 00103 推料2气缸伸出阀 (M102)
  CONVEYOR: 103,                 // 00104 传送带 (M103)

  // 传感器反馈（PLC输入）- 线圈
  SENSOR_FEED: 8,                // 00009 上料传感器 (M8)
  SENSOR_COLOR: 9,               // 00010 色标传感器 (M9)
  SENSOR_MATERIAL: 10,           // 00011 物料传感器 (M10)
  MAGNETIC_FEED_RETRACT: 2,      // 00003 上料气缸缩回限位 (M2)
  MAGNETIC_FEED_EXTEND: 3,       // 00004 上料气缸伸出限位 (M3)
  MAGNETIC_SORTING1_RETRACT: 4,  // 00005 推料1气缸缩回限位 (M4)
  MAGNETIC_SORTING1_EXTEND: 5,   // 00006 推料1气缸伸出限位 (M5)
  MAGNETIC_SORTING2_RETRACT: 6,  // 00007 推料2气缸缩回限位 (M6)
  MAGNETIC_SORTING2_EXTEND: 7,   // 00008 推料2气缸伸出限位 (M7)
} as const;

// Modbus配置接口
export interface ModbusConfig {
  host: string;
  port: number;
}

// Modbus连接状态
export interface ModbusStatus {
  connected: boolean;
  host: string;
  port: number;
}

// Modbus操作结果
export interface ModbusResult {
  success: boolean;
  error?: string;
}

// Modbus读取结果
export interface ModbusReadResult {
  success: boolean;
  values?: boolean[];
  error?: string;
}

// WebSocket消息类型
type WSMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

// Modbus服务类（WebSocket版本）
export class ModbusService {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private messageHandlers: Map<string, (result: any) => void> = new Map();
  private messageId: number = 0;

  constructor() {
    // 默认连接到本地WebSocket服务器
    this.connectWebSocket();
  }

  /**
   * 连接WebSocket服务器
   */
  private connectWebSocket() {
    try {
      this.ws = new WebSocket('ws://localhost:8081');
      
      this.ws.onopen = () => {
        console.log('WebSocket已连接');
        this.connected = true;
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
        // 5秒后尝试重新连接
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };
    } catch (error) {
      console.error('创建WebSocket连接时出错:', error);
    }
  }

  /**
   * 发送消息到WebSocket服务器
   */
  private sendMessage(message: WSMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // 对于状态查询等非关键操作，直接返回失败而不是 reject，防止前端崩溃
        if (message.type === 'get-status') {
            resolve({ success: false, connected: false, error: 'WebSocket未连接' });
            return;
        }
        reject(new Error('WebSocket未连接'));
        return;
      }

      const id = `msg_${Date.now()}_${this.messageId++}`;
      const fullMessage = { ...message, id };

      this.messageHandlers.set(id, (result) => {
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || '操作失败'));
        }
      });

      this.ws!.send(JSON.stringify(fullMessage));

      // 设置超时
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('请求超时'));
        }
      }, 10000);
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
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('Modbus连接失败:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<ModbusResult> {
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
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('批量写入线圈失败:', error);
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
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('写入线圈失败:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 写入线圈（传感器反馈信号）
   * 注：在仿真模式下，数字孪生写入传感器状态，让PLC能读取
   */
  async writeSensorFeedback(address: number, value: boolean): Promise<ModbusResult> {
    try {
      console.log(`[写入传感器反馈] 地址${address} 值${value}`);
      const result = await this.sendMessage({
        type: 'write-coil',
        address,
        value,
      });
      console.log(`[写入传感器反馈] 结果:`, result.success, result.error);
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error('写入传感器反馈失败:', error);
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
      return {
        success: result.success,
        values: result.values,
        error: result.error,
      };
    } catch (error) {
      console.error('读取线圈失败:', error);
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
      console.error('批量读取控制信号时发生异常:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}

// 单例实例
export const modbusService = new ModbusService();