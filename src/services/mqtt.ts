// @ts-ignore
import mqtt from 'mqtt';

// MQTT服务配置
interface MqttConfig {
  host: string;
  port: number;
  topic: string;
}

// MQTT消息类型
export interface MqttMessage {
  type: 'sensor' | 'cylinder' | 'conveyor' | 'material';
  name: string;
  value: boolean | number | string;
  timestamp: number;
}

// MQTT回调类型
interface MqttCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  onMessage: (topic: string, message: MqttMessage) => void;
}

class MqttService {
  private client: any = null;
  private config: MqttConfig | null = null;
  private callbacks: MqttCallbacks | null = null;
  private isConnected: boolean = false;

  // 连接MQTT服务器
  connect(config: MqttConfig, callbacks: MqttCallbacks): void {
    this.config = config;
    this.callbacks = callbacks;

    // 浏览器环境使用WebSocket连接
    // WebSocket端口映射：TCP 1883 -> WS 8083, TCP 8883 -> WSS 8084
    const wsPort = config.port === 1883 ? 8083 : config.port === 8883 ? 8084 : config.port;
    const protocol = config.port === 8883 ? 'wss' : 'ws';
    const url = `${protocol}://${config.host}:${wsPort}/mqtt`;

    console.log('MQTT connecting to:', url);

    try {
      this.client = mqtt.connect(url, {
        clientId: `digital-twin-${Date.now()}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
      });

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
        const message = JSON.parse(payload.toString()) as MqttMessage;
        this.callbacks?.onMessage(topic, message);
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

    const topic = `${this.config.topic}/${subTopic}`;
    this.client.publish(topic, JSON.stringify(message));
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
