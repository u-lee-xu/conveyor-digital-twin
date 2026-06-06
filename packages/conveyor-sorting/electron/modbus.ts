import ModbusRTU from 'modbus-serial';

// Modbus地址定义
export const MODBUS_ADDRESSES = {
  // 线圈（Coil）- 写入传感器信号
  SENSOR_FEED: 0,      // 上料传感器
  SENSOR_COLOR: 1,     // 色标传感器
  SENSOR_MATERIAL: 2,  // 物料传感器

  // 离散输入（Discrete Input）- 读取控制信号
  CYLINDER_FEED_EXTEND: 0,        // 上料气缸伸出
  CYLINDER_FEED_RETRACT: 1,       // 上料气缸缩回
  CYLINDER_SORTING1_EXTEND: 2,    // 分拣1气缸伸出
  CYLINDER_SORTING1_RETRACT: 3,   // 分拣1气缸缩回
  CYLINDER_SORTING2_EXTEND: 4,    // 分拣2气缸伸出
  CYLINDER_SORTING2_RETRACT: 5,   // 分拣2气缸缩回
  CONVEYOR_RUN: 6,                // 传送带运行
  MATERIAL_SPAWN: 7,               // 物料生成
} as const;

// Modbus服务类
export class ModbusService {
  private client: ModbusRTU;
  private host: string = '';
  private port: number = 502;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private unitId: number = 1;

  constructor() {
    this.client = new ModbusRTU();
  }

  /**
   * 连接到ModbusTCP服务器
   */
  async connect(host: string, port: number): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    this.host = host;
    this.port = port;

    try {
      await this.client.connectTCP(host, { port });
      this.connected = true;
      console.log(`ModbusTCP连接成功: ${host}:${port}`);
    } catch (error) {
      this.connected = false;
      console.error('ModbusTCP连接失败:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connected) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('断开Modbus连接时出错:', error);
      }
      this.connected = false;
      console.log('ModbusTCP连接已断开');
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取主机地址
   */
  getHost(): string {
    return this.host;
  }

  /**
   * 获取端口
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 写入线圈（传感器信号）
   * @param address 线圈地址
   * @param value 值（true/false）
   */
  async writeCoil(address: number, value: boolean): Promise<void> {
    if (!this.connected) {
      throw new Error('Modbus未连接');
    }

    try {
      await this.client.writeCoil(this.unitId, address, value);
      console.log(`写入线圈 [${address}] = ${value}`);
    } catch (error) {
      console.error(`写入线圈失败 [${address}]:`, error);
      throw error;
    }
  }

  /**
   * 读取离散输入（控制信号）
   * @param address 起始地址
   * @param length 读取长度
   */
  async readDiscreteInputs(address: number, length: number): Promise<boolean[]> {
    if (!this.connected) {
      throw new Error('Modbus未连接');
    }

    try {
      const data = await this.client.readDiscreteInputs(this.unitId, address, length);
      const values = data.data.map((v: boolean) => v);
      console.log(`读取离散输入 [${address}]:`, values);
      return values;
    } catch (error) {
      console.error(`读取离散输入失败 [${address}]:`, error);
      throw error;
    }
  }

  /**
   * 读取线圈（气缸状态反馈）
   * @param address 起始地址
   * @param length 读取长度
   */
  async readCoils(address: number, length: number): Promise<boolean[]> {
    if (!this.connected) {
      throw new Error('Modbus未连接');
    }

    try {
      const data = await this.client.readCoils(this.unitId, address, length);
      const values = data.data.map((v: boolean) => v);
      console.log(`读取线圈 [${address}]:`, values);
      return values;
    } catch (error) {
      console.error(`读取线圈失败 [${address}]:`, error);
      throw error;
    }
  }

  /**
   * 写入多个线圈
   * @param address 起始地址
   * @param values 值数组
   */
  async writeCoils(address: number, values: boolean[]): Promise<void> {
    if (!this.connected) {
      throw new Error('Modbus未连接');
    }

    try {
      await this.client.writeCoils(this.unitId, address, values);
      console.log(`写入多个线圈 [${address}]:`, values);
    } catch (error) {
      console.error(`写入多个线圈失败 [${address}]:`, error);
      throw error;
    }
  }

  /**
   * 设置从站ID
   */
  setUnitId(unitId: number): void {
    this.unitId = unitId;
  }
}

/**
 * 创建Modbus服务实例
 */
export function createModbusService(): ModbusService {
  return new ModbusService();
}