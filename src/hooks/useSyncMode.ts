import { useState, useCallback, useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import { mqttService } from '../services/mqtt';
import type { MqttMessage } from '../services/mqtt';

// 校准步骤
export type CalibrateStep = 
  | 'IDLE'           // 等待连接
  | 'CONNECTING'     // 连接中
  | 'CONNECTED'      // 已连接，等待校准
  | 'CALIBRATING'    // 校准中
  | 'CALIBRATED'     // 校准完成
  | 'SYNCING';       // 同步运行中

// 校准阶段
export type CalibratePhase = 
  | 'WAIT_MATERIAL'  // 等待放入物料
  | 'DETECT_FEED'    // 等待上料传感器
  | 'DETECT_COLOR'   // 等待色标传感器
  | 'DETECT_MATERIAL'// 等待物料传感器
  | 'SORTING'        // 等待分拣动作
  | 'COMPLETE';      // 本轮完成

// 校准轮次
export type CalibrateRound = 1 | 2;

interface MqttConfig {
  host: string;
  port: number;
  topic: string;
}

// 校准数据
export interface CalibrationData {
  // 第1轮：上料→色标的时间间隔（毫秒）
  phase1Time: number | null;
  // 第2轮：色标→物料传感器的时间间隔（毫秒）
  phase2Time: number | null;
  // 时间点记录
  t1: number | null;  // 上料传感器触发时间
  t2: number | null;  // 色标传感器触发时间
  t3: number | null;  // 物料传感器触发时间
}

// 物料颜色
export type MaterialColor = 'black' | 'blue' | 'unknown';

export function useSyncMode() {
  const mode = useDeviceStore((state) => state.mode);
  const setSensor = useDeviceStore((state) => state.setSensor);
  const extendCylinder = useDeviceStore((state) => state.extendCylinder);
  const retractCylinder = useDeviceStore((state) => state.retractCylinder);
  const startConveyor = useDeviceStore((state) => state.startConveyor);
  const stopConveyor = useDeviceStore((state) => state.stopConveyor);
  const sensors = useDeviceStore((state) => state.sensors);
  
  const [step, setStep] = useState<CalibrateStep>('IDLE');
  const [phase, setPhase] = useState<CalibratePhase>('WAIT_MATERIAL');
  const [round, setRound] = useState<CalibrateRound>(1);
  const [currentMaterialColor, setCurrentMaterialColor] = useState<MaterialColor>('unknown');
  const [mqttConfig, setMqttConfig] = useState<MqttConfig>({
    host: 'broker.emqx.io',
    port: 1883,
    topic: 'digital-twin/default',
  });
  const [calibration, setCalibration] = useState<CalibrationData>({
    phase1Time: null,
    phase2Time: null,
    t1: null,
    t2: null,
    t3: null,
  });

  // 用于跟踪上一轮传感器状态，检测上升沿
  const prevSensorsRef = useRef(sensors);

  // 处理校准阶段的传感器信号
  useEffect(() => {
    if (step !== 'CALIBRATING') return;

    const prevSensors = prevSensorsRef.current;
    const now = Date.now();

    // 第1轮校准：黑色物料
    if (round === 1) {
      // 检测上料传感器上升沿
      if (phase === 'DETECT_FEED' && sensors.feed && !prevSensors.feed) {
        console.log('[校准] 第1轮：上料传感器触发 T1=', now);
        setCalibration(prev => ({ ...prev, t1: now }));
        setPhase('DETECT_COLOR');
      }
      // 检测色标传感器上升沿（黑色物料会触发色标）
      else if (phase === 'DETECT_COLOR' && sensors.color && !prevSensors.color) {
        const t1 = calibration.t1 || now;
        const phase1Time = now - t1;
        console.log('[校准] 第1轮：色标传感器触发 T2=', now, 'Δt1=', phase1Time);
        setCalibration(prev => ({ ...prev, t2: now, phase1Time }));
        setCurrentMaterialColor('black');
        setPhase('SORTING');
      }
      // 检测分拣1气缸动作（假设通过气缸状态判断）
      else if (phase === 'SORTING') {
        // 等待一段时间后进入下一轮
        const timer = setTimeout(() => {
          console.log('[校准] 第1轮完成');
          setPhase('COMPLETE');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
    // 第2轮校准：蓝色物料
    else if (round === 2) {
      // 蓝色物料不会触发色标传感器，所以跳过色标检测
      // 直接检测物料传感器
      if (phase === 'DETECT_MATERIAL' && sensors.material && !prevSensors.material) {
        // 使用第1轮记录的t2（色标传感器位置时间）
        if (!calibration.t2) {
          console.error('[校准] 第2轮：缺少第1轮的t2数据，请重新校准');
          return;
        }
        const phase2Time = now - calibration.t2;
        console.log('[校准] 第2轮：物料传感器触发 T3=', now, 'Δt2=', phase2Time);
        setCalibration(prev => ({ ...prev, t3: now, phase2Time }));
        setCurrentMaterialColor('blue');
        setPhase('SORTING');
      }
      else if (phase === 'SORTING') {
        const timer = setTimeout(() => {
          console.log('[校准] 第2轮完成，校准成功！');
          setStep('CALIBRATED');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }

    prevSensorsRef.current = sensors;
  }, [step, phase, round, sensors, calibration.t1, calibration.t2]);

  // 处理MQTT消息
  const handleMqttMessage = useCallback((topic: string, message: MqttMessage) => {
    console.log('MQTT Message:', topic, message);
    
    // 同步模式下处理消息
    if (step === 'SYNCING') {
      if (message.type === 'sensor') {
        const validSensorNames = ['feed', 'color', 'material'] as const;
        const name = message.name as string;
        if (validSensorNames.includes(name as typeof validSensorNames[number])) {
          setSensor(name as typeof validSensorNames[number], message.value as boolean);
        }
      } else if (message.type === 'cylinder') {
        const validCylinderNames = ['feed', 'sorting1', 'sorting2'] as const;
        const name = message.name as string;
        if (validCylinderNames.includes(name as typeof validCylinderNames[number])) {
          if (message.value as boolean) {
            extendCylinder(name as typeof validCylinderNames[number]);
          } else {
            retractCylinder(name as typeof validCylinderNames[number]);
          }
        }
      } else if (message.type === 'conveyor') {
        if (message.value as boolean) {
          startConveyor();
        } else {
          stopConveyor();
        }
      } else if (message.type === 'material') {
        // 同步模式下处理物料生成消息
        if (message.value === true || message.value === 1 || message.value === 'spawn') {
          const color = typeof message.value === 'string' && message.value.includes('black') ? 'black' : 'blue';
          useDeviceStore.getState().spawnSyncMaterial(color);
        } else if (message.value === false || message.value === 0 || message.value === 'clear') {
          useDeviceStore.getState().clearSyncMaterial();
        }
      }
    }
  }, [step, setSensor, extendCylinder, retractCylinder, startConveyor, stopConveyor]);

  // 连接MQTT
  const connect = useCallback((host: string, port: number, topic: string) => {
    setStep('CONNECTING');
    setMqttConfig({ host, port, topic });
    
    mqttService.connect(
      { host, port, topic },
      {
        onConnect: () => {
          setStep('CONNECTED');
        },
        onDisconnect: () => {
          setStep('IDLE');
        },
        onError: (error) => {
          console.error('MQTT Connection Error:', error);
          setStep('IDLE');
        },
        onMessage: handleMqttMessage,
      }
    );
  }, [handleMqttMessage]);

  // 开始校准
  const startCalibrate = useCallback(() => {
    setStep('CALIBRATING');
    setRound(1);
    setPhase('WAIT_MATERIAL');
    setCalibration({
      phase1Time: null,
      phase2Time: null,
      t1: null,
      t2: null,
      t3: null,
    });
    setCurrentMaterialColor('unknown');
  }, []);

  // 放入物料（用户确认已放入物料）
  const placeMaterial = useCallback(() => {
    if (round === 1) {
      setPhase('DETECT_FEED');
    } else {
      // 第2轮，蓝色物料不触发色标，直接等待物料传感器
      setPhase('DETECT_MATERIAL');
      setCurrentMaterialColor('blue');
    }
  }, [round]);

  // 进入下一轮校准
  const nextRound = useCallback(() => {
    setRound(2);
    setPhase('WAIT_MATERIAL');
    setCurrentMaterialColor('unknown');
  }, []);

  // 重新校准
  const resetCalibrate = useCallback(() => {
    setRound(1);
    setPhase('WAIT_MATERIAL');
    setCalibration({
      phase1Time: null,
      phase2Time: null,
      t1: null,
      t2: null,
      t3: null,
    });
    setCurrentMaterialColor('unknown');
  }, []);

  // 进入同步模式
  const startSync = useCallback(() => {
    setStep('SYNCING');
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    mqttService.disconnect();
    setStep('IDLE');
    setPhase('WAIT_MATERIAL');
    setRound(1);
    setCalibration({
      phase1Time: null,
      phase2Time: null,
      t1: null,
      t2: null,
      t3: null,
    });
    setCurrentMaterialColor('unknown');
  }, []);

  // 当模式切换时断开连接
  useEffect(() => {
    if (mode !== 'sync') {
      mqttService.disconnect();
      setStep('IDLE');
      setPhase('WAIT_MATERIAL');
      setRound(1);
    }
  }, [mode]);

  return {
    step,
    phase,
    round,
    currentMaterialColor,
    mqttConfig,
    calibration,
    connect,
    startCalibrate,
    placeMaterial,
    nextRound,
    resetCalibrate,
    startSync,
    disconnect,
  };
}
