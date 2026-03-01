import { useState, useCallback } from 'react';
import { useDeviceStore } from '../stores';

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
  | 'COMPLETE';      // 本轮完成

interface MqttConfig {
  host: string;
  port: number;
  topic: string;
}

interface CalibrationData {
  speed: number | null;
  phase1Time: number | null;  // 上料到色标的时间
  phase2Time: number | null;  // 色标到物料的时间
}

export function useSyncMode() {
  const mode = useDeviceStore((state) => state.mode);
  
  const [step, setStep] = useState<CalibrateStep>('IDLE');
  const [phase, setPhase] = useState<CalibratePhase>('WAIT_MATERIAL');
  const [mqttConfig, setMqttConfig] = useState<MqttConfig>({
    host: 'broker.emqx.io',
    port: 1883,
    topic: 'digital-twin/default',
  });
  const [calibration, setCalibration] = useState<CalibrationData>({
    speed: null,
    phase1Time: null,
    phase2Time: null,
  });

  // 连接MQTT
  const connect = useCallback((host: string, port: number, topic: string) => {
    setStep('CONNECTING');
    setMqttConfig({ host, port, topic });
    
    // TODO: 实际MQTT连接逻辑
    // 模拟连接成功
    setTimeout(() => {
      setStep('CONNECTED');
    }, 1000);
  }, []);

  // 开始校准
  const startCalibrate = useCallback(() => {
    setStep('CALIBRATING');
    setPhase('WAIT_MATERIAL');
    // TODO: 实际校准逻辑
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    setStep('IDLE');
    setPhase('WAIT_MATERIAL');
    setCalibration({
      speed: null,
      phase1Time: null,
      phase2Time: null,
    });
    // TODO: 断开MQTT连接
  }, []);

  // 当模式切换时重置状态
  const resetSyncMode = useCallback(() => {
    if (mode !== 'sync') {
      setStep('IDLE');
      setPhase('WAIT_MATERIAL');
    }
  }, [mode]);

  return {
    step,
    phase,
    mqttConfig,
    calibration,
    connect,
    startCalibrate,
    disconnect,
    resetSyncMode,
  };
}
