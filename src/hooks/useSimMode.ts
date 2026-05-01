import { useState, useCallback, useEffect } from 'react';
import { useDeviceStore } from '../stores';
import { MODBUS_ADDRESSES, MODBUS_CONFIG, useModbusService } from '../services/modbus';
import type { ModbusStatus } from '../services/modbus-websocket';

export type SimStep = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RUNNING' | 'ERROR';

export const useSimMode = () => {
  const { 
    conveyorRunning, 
    cylinders, 
    sensors,
    spawnMaterial,
    startConveyor,
    stopConveyor,
    extendCylinder,
    retractCylinder,
  } = useDeviceStore();

  const modbusService = useModbusService({
    host: MODBUS_CONFIG.host,
    port: MODBUS_CONFIG.port,
    unitId: MODBUS_CONFIG.unitId,
  });

  const [step, setStep] = useState<SimStep>('DISCONNECTED');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [modbusStatus, setModbusStatus] = useState<ModbusStatus>({
    connected: false,
    host: '',
    port: 0,
  });
  const [stats, setStats] = useState({
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
  });
  const [controlSignals, setControlSignals] = useState({
    start: false,
    reset: false,
    feedCylinderValve: false,
    sorting1CylinderValve: false,
    sorting2CylinderValve: false,
    conveyor: false,
  });

  const connect = useCallback(async () => {
    if (step === 'CONNECTING') return;

    setStep('CONNECTING');
    setErrorMessage('');

    try {
      const result = await modbusService.connect();
      if (result.success) {
        setStep('CONNECTED');
        console.log('[仿真模式] 连接成功');
      } else {
        throw new Error(result.error || '连接失败');
      }
    } catch (error) {
      setStep('ERROR');
      setErrorMessage(error instanceof Error ? error.message : '连接失败');
      console.error('[仿真模式] 连接失败:', error);
    }
  }, [modbusService, step]);

  const disconnect = useCallback(async () => {
    try {
      await modbusService.disconnect();
      setStep('DISCONNECTED');
      setIsSimulationRunning(false);
      console.log('[仿真模式] 已断开连接');
    } catch (error) {
      console.error('[仿真模式] 断开连接失败:', error);
    }
  }, [modbusService]);

  const publishAllFeedback = useCallback(async () => {
    if (step !== 'CONNECTED') return;

    try {
      const feedbacks = [
        { address: MODBUS_ADDRESSES.SENSOR_FEED, value: sensors.feed },
        { address: MODBUS_ADDRESSES.SENSOR_COLOR, value: sensors.color },
        { address: MODBUS_ADDRESSES.SENSOR_MATERIAL, value: sensors.material },
        { address: MODBUS_ADDRESSES.MAGNETIC_FEED_RETRACT, value: !cylinders.feed.extended },
        { address: MODBUS_ADDRESSES.MAGNETIC_FEED_EXTEND, value: cylinders.feed.extended },
        { address: MODBUS_ADDRESSES.MAGNETIC_SORTING1_RETRACT, value: !cylinders.sorting1.extended },
        { address: MODBUS_ADDRESSES.MAGNETIC_SORTING1_EXTEND, value: cylinders.sorting1.extended },
        { address: MODBUS_ADDRESSES.MAGNETIC_SORTING2_RETRACT, value: !cylinders.sorting2.extended },
        { address: MODBUS_ADDRESSES.MAGNETIC_SORTING2_EXTEND, value: cylinders.sorting2.extended },
      ];

      for (const feedback of feedbacks) {
        await modbusService.writeCoil(feedback.address, feedback.value);
      }

      setStats(prev => ({ ...prev, writeCount: prev.writeCount + feedbacks.length }));
    } catch (error) {
      console.error('[仿真模式] 发布反馈失败:', error);
      setStats(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
    }
  }, [step, sensors, cylinders, modbusService]);

  const onSimulationStart = useCallback(async (signal: boolean) => {
    if (step === 'CONNECTED') {
      setIsSimulationRunning(true);
      setControlSignals(prev => ({ ...prev, start: signal }));
      try {
        await modbusService.writeCoil(MODBUS_ADDRESSES.START, signal);
      } catch {
        console.error('写入启动信号失败');
      }
    }
  }, [step, modbusService]);

  const onSimulationReset = useCallback(async (signal: boolean) => {
    if (step === 'CONNECTED') {
      setControlSignals(prev => ({ ...prev, reset: signal }));
      try {
        await modbusService.writeCoil(MODBUS_ADDRESSES.RESET, signal);
      } catch {
        console.error('写入复位信号失败');
      }
      if (signal) {
        setIsSimulationRunning(false);
      }
    }
  }, [step, modbusService]);

  // 轮询控制信号
  useEffect(() => {
    if (step !== 'CONNECTED' || !isSimulationRunning) return;

    const poll = async () => {
      try {
        const start = await modbusService.readCoil(MODBUS_ADDRESSES.START);
        const reset = await modbusService.readCoil(MODBUS_ADDRESSES.RESET);
        const feedValve = await modbusService.readCoil(MODBUS_ADDRESSES.FEED_CYLINDER_VALVE);
        const sorting1Valve = await modbusService.readCoil(MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE);
        const sorting2Valve = await modbusService.readCoil(MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE);
        const conveyor = await modbusService.readCoil(MODBUS_ADDRESSES.CONVEYOR);

        setControlSignals({
          start: start === 1,
          reset: reset === 1,
          feedCylinderValve: feedValve === 1,
          sorting1CylinderValve: sorting1Valve === 1,
          sorting2CylinderValve: sorting2Valve === 1,
          conveyor: conveyor === 1,
        });

        // 同步到设备状态
        if (conveyor === 1) {
            if (!conveyorRunning) startConveyor();
        } else {
            if (conveyorRunning) stopConveyor();
        }

        if (feedValve === 1) extendCylinder('feed'); else retractCylinder('feed');
        if (sorting1Valve === 1) extendCylinder('sorting1'); else retractCylinder('sorting1');
        if (sorting2Valve === 1) extendCylinder('sorting2'); else retractCylinder('sorting2');

        setStats(prev => ({ ...prev, readCount: prev.readCount + 6 }));
      } catch (error) {
        console.error('[仿真模式] 轮询失败:', error);
        setStats(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }
    };

    const interval = setInterval(poll, 200);
    return () => clearInterval(interval);
  }, [step, isSimulationRunning, modbusService, conveyorRunning, startConveyor, stopConveyor, extendCylinder, retractCylinder]);

  useEffect(() => {
    if (isSimulationRunning && step === 'CONNECTED') {
      const interval = setInterval(() => {
        publishAllFeedback();
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isSimulationRunning, step, publishAllFeedback]);

  const onSpawnMaterial = useCallback(() => {
    if (step === 'CONNECTED') {
      spawnMaterial();
    }
  }, [step, spawnMaterial]);

  // 定期更新连接状态
  useEffect(() => {
    const updateStatus = async () => {
      try {
        const status = await modbusService.getStatus();
        setModbusStatus(status);
      } catch (e) {
        setModbusStatus({ connected: false, host: '', port: 0 });
      }
    };
    
    const timer = setInterval(updateStatus, 1000);
    updateStatus();
    return () => clearInterval(timer);
  }, [modbusService]);

  return {
    step,
    errorMessage,
    modbusConfig: MODBUS_CONFIG,
    modbusStatus,
    stats,
    controlSignals,
    connect,
    disconnect,
    publishAllFeedback,
    onSimulationStart,
    onSimulationReset,
    onSpawnMaterial,
  };
};