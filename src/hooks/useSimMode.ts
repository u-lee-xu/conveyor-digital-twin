import { useState, useCallback, useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import { mqttService } from '../services/mqtt';
import type { ValidatedMqttMessage } from '../services/mqtt';

// 仿真模式步骤
export type SimStep = 
  | 'IDLE'           // 等待连接
  | 'CONNECTING'     // 连接中
  | 'CONNECTED'      // 已连接，运行中
  | 'ERROR';         // 连接错误

interface MqttConfig {
  host: string;
  port: number;
  topic: string;
}

export function useSimMode() {
  const mode = useDeviceStore((state) => state.mode);
  const extendCylinder = useDeviceStore((state) => state.extendCylinder);
  const retractCylinder = useDeviceStore((state) => state.retractCylinder);
  const startConveyor = useDeviceStore((state) => state.startConveyor);
  const stopConveyor = useDeviceStore((state) => state.stopConveyor);
  const clearMaterial = useDeviceStore((state) => state.clearMaterial);
  const sensors = useDeviceStore((state) => state.sensors);
  const cylinders = useDeviceStore((state) => state.cylinders);
  const conveyorRunning = useDeviceStore((state) => state.conveyorRunning);
  
  const [step, setStep] = useState<SimStep>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mqttConfig, setMqttConfig] = useState<MqttConfig>({
    host: 'broker.emqx.io',
    port: 1883,
    topic: 'digital-twin/sim',
  });
  
  // 统计数据
  const [stats, setStats] = useState({
    messagesReceived: 0,
    messagesSent: 0,
    controlSignals: 0,
    feedbackSignals: 0,
  });

  // 上一次的反馈状态，用于检测变化
  const lastFeedbackRef = useRef({
    sensors: { feed: false, color: false, material: false },
    cylinders: { feed: false, sorting1: false, sorting2: false },
    conveyorRunning: false,
  });
  
  // 保存最新的发布函数引用，避免闭包陷阱
  const publishAllFeedbackRef = useRef<() => void>(() => {});


  // 更新 ref
  useEffect(() => {
    publishAllFeedbackRef.current = publishAllFeedback;
  });

  // 发布反馈信号给PLC
  const publishFeedback = useCallback((subTopic: string, value: boolean | number | string) => {
    // 使用 getState() 获取最新状态，避免闭包陷阱
    const currentStep = useDeviceStore.getState().mode === 'sim' ? 'CONNECTED' : 'IDLE';
    if (currentStep !== 'CONNECTED') return;
    
    const message: ValidatedMqttMessage = {
      type: 'feedback',
      name: subTopic,
      value,
      timestamp: Date.now(),
    };
    
    mqttService.publish(`feedback/${subTopic}`, message);
    setStats(prev => ({ 
      ...prev, 
      messagesSent: prev.messagesSent + 1,
      feedbackSignals: prev.feedbackSignals + 1 
    }));
  }, []);

  // 发布所有传感器和设备状态
  const publishAllFeedback = useCallback(() => {
    // 使用 getState() 获取最新状态
    const state = useDeviceStore.getState();
    
    // 传感器状态
    publishFeedback('sensor_feed', state.sensors.feed);
    publishFeedback('sensor_color', state.sensors.color);
    publishFeedback('sensor_material', state.sensors.material);
    
    // 磁性开关状态（基于气缸位置）
    publishFeedback('magnetic_feed_extend', state.cylinders.feed.extended);
    publishFeedback('magnetic_feed_retract', !state.cylinders.feed.extended);
    publishFeedback('magnetic_sorting1_extend', state.cylinders.sorting1.extended);
    publishFeedback('magnetic_sorting1_retract', !state.cylinders.sorting1.extended);
    publishFeedback('magnetic_sorting2_extend', state.cylinders.sorting2.extended);
    publishFeedback('magnetic_sorting2_retract', !state.cylinders.sorting2.extended);
    
    // 传送带状态
    publishFeedback('conveyor_running', state.conveyorRunning);
  }, [publishFeedback]);

  // 检测状态变化并发布反馈
  useEffect(() => {
    if (step !== 'CONNECTED') return;
    
    const last = lastFeedbackRef.current;
    
    // 检测传感器变化
    if (last.sensors.feed !== sensors.feed) {
      publishFeedback('sensor_feed', sensors.feed);
    }
    if (last.sensors.color !== sensors.color) {
      publishFeedback('sensor_color', sensors.color);
    }
    if (last.sensors.material !== sensors.material) {
      publishFeedback('sensor_material', sensors.material);
    }
    
    // 检测气缸变化（磁性开关）
    if (last.cylinders.feed !== cylinders.feed.extended) {
      publishFeedback('magnetic_feed_extend', cylinders.feed.extended);
      publishFeedback('magnetic_feed_retract', !cylinders.feed.extended);
    }
    if (last.cylinders.sorting1 !== cylinders.sorting1.extended) {
      publishFeedback('magnetic_sorting1_extend', cylinders.sorting1.extended);
      publishFeedback('magnetic_sorting1_retract', !cylinders.sorting1.extended);
    }
    if (last.cylinders.sorting2 !== cylinders.sorting2.extended) {
      publishFeedback('magnetic_sorting2_extend', cylinders.sorting2.extended);
      publishFeedback('magnetic_sorting2_retract', !cylinders.sorting2.extended);
    }
    
    // 检测传送带变化
    if (last.conveyorRunning !== conveyorRunning) {
      publishFeedback('conveyor_running', conveyorRunning);
    }
    
    // 更新上次状态
    lastFeedbackRef.current = {
      sensors: { ...sensors },
      cylinders: { 
        feed: cylinders.feed.extended, 
        sorting1: cylinders.sorting1.extended, 
        sorting2: cylinders.sorting2.extended 
      },
      conveyorRunning,
    };
  }, [step, sensors, cylinders, conveyorRunning, publishFeedback]);

  // 处理MQTT控制消息
  const handleMqttMessage = useCallback((topic: string, message: ValidatedMqttMessage) => {
    console.log('[仿真模式] 收到控制信号:', topic, message);
    
    setStats(prev => ({ 
      ...prev, 
      messagesReceived: prev.messagesReceived + 1,
      controlSignals: prev.controlSignals + 1 
    }));
    
    // 处理控制信号
    if (message.type === 'control' || message.type === 'cylinder') {
      const validNames = ['feed', 'sorting1', 'sorting2'] as const;
      const name = message.name as string;
      if (!validNames.includes(name as typeof validNames[number])) {
        console.warn('[仿真模式] 无效的气缸名称:', name);
        return;
      }
      const cylinderName = name as typeof validNames[number];
      if (message.value === true || message.value === 1 || message.value === 'extend') {
        extendCylinder(cylinderName);
      } else {
        retractCylinder(cylinderName);
      }
    } else if (message.type === 'conveyor') {
      if (message.value === true || message.value === 1 || message.value === 'start') {
        startConveyor();
      } else {
        stopConveyor();
      }
    } else if (message.type === 'material') {
      if (message.value === true || message.value === 1 || message.value === 'spawn') {
        // 可以指定颜色
        const color = typeof message.value === 'string' && message.value.includes('black') ? 'black' : 'blue';
        useDeviceStore.setState({
          material: {
            visible: true,
            color,
            position: [-1.3, 1.06, 0.6],
            onConveyor: false,
            conveyorDelay: 0,
          },
        });
      } else if (message.value === false || message.value === 0 || message.value === 'clear') {
        clearMaterial();
      }
    }
  }, [extendCylinder, retractCylinder, startConveyor, stopConveyor, clearMaterial]);

  // 连接MQTT
  const connect = useCallback((host: string, port: number, topic: string) => {
    setStep('CONNECTING');
    setErrorMessage(null);
    setMqttConfig({ host, port, topic });
    
    mqttService.connect(
      { host, port, topic },
      {
        onConnect: () => {
          console.log('[仿真模式] MQTT连接成功');
          setStep('CONNECTED');
          // 连接成功后发布初始状态，使用 ref 避免闭包陷阱
          setTimeout(() => publishAllFeedbackRef.current(), 500);
        },
        onDisconnect: () => {
          console.log('[仿真模式] MQTT断开连接');
          setStep('IDLE');
        },
        onError: (error) => {
          console.error('[仿真模式] MQTT连接错误:', error);
          setStep('ERROR');
          setErrorMessage(error.message || '连接失败');
        },
        onMessage: handleMqttMessage,
      }
    );
  }, [handleMqttMessage]);

  // 断开连接
  const disconnect = useCallback(() => {
    mqttService.disconnect();
    setStep('IDLE');
    setErrorMessage(null);
    setStats({
      messagesReceived: 0,
      messagesSent: 0,
      controlSignals: 0,
      feedbackSignals: 0,
    });
  }, []);

  // 模式切换时断开连接
  useEffect(() => {
    if (mode !== 'sim') {
      mqttService.disconnect();
      setStep('IDLE');
    }
  }, [mode]);

  return {
    step,
    errorMessage,
    mqttConfig,
    stats,
    sensors,
    cylinders,
    conveyorRunning,
    connect,
    disconnect,
    publishAllFeedback,
  };
}
