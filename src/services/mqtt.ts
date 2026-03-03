// @ts-ignore
import mqtt from 'mqtt';

// MQTT服务配置
export interface MqttConfig {
  host: string;
  port: number;
  topic: string;
  username?: string;
  password?: string;
}

// 有效的消息类型
const VALID_MESSAGE_TYPES = ['sensor', 'cylinder', 'conveyor', 'material', 'control', 'feedback', 'magnetic'] as const;
type MessageType = typeof VALID_MESSAGE_TYPES[number];

// 有效的设备名称
const VALID_SENSOR_NAMES = ['feed', 'color', 'material'] as const;
const VALID_CYLINDER_NAMES = ['feed', 'sorting1', 'sorting2'] as const;
const VALID_CONVEYOR_NAMES = ['main'] as const;

// MQTT消息类型（用于发布）
export interface MqttMessage {
  type: MessageType;
  name: string;
  value: boolean | number | string;
  timestamp: number;
}

// 验证后的MQTT消息（用于接收，已验证安全）
export interface ValidatedMqttMessage {
  type: MessageType;
  name: string;
  value: boolean | number | string;
  timestamp: number;
}

// MQTT回调类型
interface MqttCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  onMessage: (topic: string, message: ValidatedMqttMessage) => void;
}

// 生成随机clientId
function generateClientId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return `digital-twin-${Array.from(array, b => b.toString(16).padStart(2, '0')).join('')}`;
}

// 验证主机名格式
function validateHost(host: string): boolean {
  // 只允许域名和IP地址
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const localhostRegex = /^localhost$/;
  
  if (localhostRegex.test(host)) return true;
  if (ipRegex.test(host)) {
    // 验证IP地址范围
    const parts = host.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
  }
  return hostnameRegex.test(host);
}

// 验证端口范围
function validatePort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

// 验证主题格式
function validateTopic(topic: string): boolean {
  // MQTT主题规则：不含通配符+#，长度限制
  if (topic.length > 65535) return false;
  if (topic.includes('#') || topic.includes('+')) return false;
  if (topic.includes('\0')) return false;
  // 只允许字母、数字、下划线、斜杠、连字符
  return /^[a-zA-Z0-9_/-]+$/.test(topic);
}

// 验证消息内容
function validateMessage(raw: unknown): ValidatedMqttMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  
  const obj = raw as Record<string, unknown>;
  
  // 验证type字段
  if (typeof obj.type !== 'string' || !VALID_MESSAGE_TYPES.includes(obj.type as MessageType)) {
    return null;
  }
  const type = obj.type as MessageType;
  
  // 验证name字段
  if (typeof obj.name !== 'string' || obj.name.length > 128) {
    return null;
  }
  const name = obj.name;
  
  // 根据type验证name是否有效
  if (type === 'sensor' && !VALID_SENSOR_NAMES.includes(name as typeof VALID_SENSOR_NAMES[number])) {
    return null;
  }
  if ((type === 'cylinder' || type === 'control' || type === 'magnetic') && 
      !VALID_CYLINDER_NAMES.includes(name as typeof VALID_CYLINDER_NAMES[number])) {
    return null;
  }
  if (type === 'conveyor' && !VALID_CONVEYOR_NAMES.includes(name as typeof VALID_CONVEYOR_NAMES[number])) {
    return null;
  }
  
  // 验证value字段
  const value = obj.value;
  if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }
  // 字符串值限制长度
  if (typeof value === 'string' && value.length > 256) {
    return null;
  }
  // 数字值范围限制
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  
  // 验证timestamp字段
  if (typeof obj.timestamp !== 'number' || !Number.isFinite(obj.timestamp)) {
    return null;
  }
  // timestamp应该是合理的时间戳（过去1小时到未来5分钟）
  const now = Date.now();
  if (obj.timestamp < now - 3600000 || obj.timestamp > now + 300000) {
    return null;
  }
  
  return {
    type,
    name,
    value,
    timestamp: obj.timestamp,
  };
}

class MqttService {
  private client: any = null;
  private config: MqttConfig | null = null;
  private callbacks: MqttCallbacks | null = null;
  private isConnected: boolean = false;

  // 验证并清理配置
  validateConfig(config: MqttConfig): { valid: boolean; error?: string } {
    if (!validateHost(config.host)) {
      return { valid: false, error: '无效的服务器地址' };
    }
    if (!validatePort(config.port)) {
      return { valid: false, error: '无效的端口号' };
    }
    if (!validateTopic(config.topic)) {
      return { valid: false, error: '无效的主题格式' };
    }
    return { valid: true };
  }

  // 连接MQTT服务器
  connect(config: MqttConfig, callbacks: MqttCallbacks): void {
    // 验证配置
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      callbacks.onError(new Error(validation.error || '配置验证失败'));
      return;
    }
    
    this.config = config;
    this.callbacks = callbacks;

    // 强制使用WSS加密连接（生产环境）
    // 对于公共MQTT服务器，使用WS端口映射
    const wsPort = config.port === 1883 ? 8083 : config.port === 8883 ? 8084 : config.port;
    // 优先使用WSS，除非是localhost
    const protocol = config.host === 'localhost' ? 'ws' : 'wss';
    const url = `${protocol}://${config.host}:${wsPort}/mqtt`;

    console.log('MQTT connecting to:', url.replace(/\/\/.*@/, '//***@'));

    try {
      const options: Record<string, unknown> = {
        clientId: generateClientId(),
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
      };
      
      // 添加认证信息（如果提供）
      if (config.username) {
        options.username = config.username;
      }
      if (config.password) {
        options.password = config.password;
      }
      
      this.client = mqtt.connect(url, options);
      this.setupEventHandlers();
    } catch (error) {
      callbacks.onError(error as Error);
    }
  }

  // 设置事件处理器
  private setupEventHandlers(): void {
    if (!this.client || !this.callbacks) return;

    this.client.on('connect', () => {
      console.log('MQTT Connected');
      this.isConnected = true;
      
      // 订阅主题
      if (this.config) {
        this.client?.subscribe(`${this.config.topic}/#`, (err: Error | null) => {
          if (err) {
            console.error('Subscribe error:', err);
          }
        });
      }
      
      this.callbacks?.onConnect();
    });

    this.client.on('disconnect', () => {
      console.log('MQTT Disconnected');
      this.isConnected = false;
      this.callbacks?.onDisconnect();
    });

    this.client.on('error', (error: Error) => {
      console.error('MQTT Error:', error);
      this.callbacks?.onError(error);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      try {
        // 限制消息大小（最大64KB）
        if (payload.length > 65536) {
          console.warn('Message too large, ignored');
          return;
        }
        
        const raw = JSON.parse(payload.toString());
        const validated = validateMessage(raw);
        
        if (validated) {
          this.callbacks?.onMessage(topic, validated);
        } else {
          console.warn('Invalid message format, ignored:', topic);
        }
      } catch (error) {
        console.error('Parse message error:', error);
      }
    });
  }

  // 断开连接
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.isConnected = false;
    }
  }

  // 发布消息
  publish(subTopic: string, message: MqttMessage): void {
    if (!this.client || !this.config || !this.isConnected) {
      console.warn('MQTT not connected');
      return;
    }

    // 验证subTopic
    if (!validateTopic(subTopic)) {
      console.warn('Invalid subTopic:', subTopic);
      return;
    }

    const topic = `${this.config.topic}/${subTopic}`;
    const payload = JSON.stringify(message);
    
    // 限制发布消息大小
    if (payload.length > 65536) {
      console.warn('Message too large to publish');
      return;
    }
    
    this.client.publish(topic, payload);
  }

  // 发布传感器状态
  publishSensor(name: string, active: boolean): void {
    this.publish('sensors', {
      type: 'sensor',
      name,
      value: active,
      timestamp: Date.now(),
    });
  }

  // 发布气缸状态
  publishCylinder(name: string, extended: boolean): void {
    this.publish('cylinders', {
      type: 'cylinder',
      name,
      value: extended,
      timestamp: Date.now(),
    });
  }

  // 发布传送带状态
  publishConveyor(running: boolean): void {
    this.publish('conveyor', {
      type: 'conveyor',
      name: 'main',
      value: running,
      timestamp: Date.now(),
    });
  }

  // 发布物料状态
  publishMaterial(visible: boolean, color: string): void {
    this.publish('material', {
      type: 'material',
      name: 'current',
      value: visible ? color : 'none',
      timestamp: Date.now(),
    });
  }

  // 获取连接状态
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// 单例实例
export const mqttService = new MqttService();
