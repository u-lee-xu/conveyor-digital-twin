import { useState, useCallback, useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import { MODBUS_ADDRESSES, MODBUS_CONFIG, useModbusService } from '../services/modbus';
import { modbusService as globalModbus } from '../services/modbus-websocket';
import { CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT, CYLINDER_LIMIT_ZONE } from '../components/scene/shared';
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

  // 用 useRef 稳定 modbusService 引用，防止每次渲染都创建新对象导致定时器失效
  const modbusServiceRef = useRef(useModbusService({
    host: MODBUS_CONFIG.host,
    port: MODBUS_CONFIG.port,
    unitId: MODBUS_CONFIG.unitId,
  }));
  const modbusService = modbusServiceRef.current;

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
  }, [step]);

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
      // 获取最新状态
      const { sensors, cylinders } = useDeviceStore.getState();
      
      // 基于实际活塞杆位置（currentExtension）计算限位开关状态
      // 行程中两个限位均为OFF，只有到达行程末端区域才触发ON
      const feedExt  = cylinders.feed.currentExtension;
      const s1Ext    = cylinders.sorting1.currentExtension;
      const s2Ext    = cylinders.sorting2.currentExtension;

      const feedAtExtend  = feedExt >= CYLINDER_EXTEND_POS_FEED - CYLINDER_LIMIT_ZONE;
      const feedAtRetract = feedExt <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const s1AtExtend    = s1Ext  >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
      const s1AtRetract   = s1Ext  <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const s2AtExtend    = s2Ext  >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
      const s2AtRetract   = s2Ext  <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;

      await globalModbus.writeFeedbackBatch({
        magneticExtend:  { feed: feedAtExtend,  sort1: s1AtExtend,  sort2: s2AtExtend  },
        magneticRetract: { feed: feedAtRetract, sort1: s1AtRetract, sort2: s2AtRetract },
        sensors: {
          feed:     sensors.feed,
          color:    sensors.color,
          material: sensors.material,
        }
      });

      setStats(prev => ({ ...prev, writeCount: prev.writeCount + 9 }));
    } catch (error) {
      console.error('[仿真模式] 发布反馈失败:', error);
      setStats(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
    }
  }, [step]); // 使用全局单例和getState，无需额外依赖

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

  // 只要已连接就持续轮询PLC控制信号（不需要等启动按钮）
  useEffect(() => {
    if (step !== 'CONNECTED') return;

    const poll = async () => {
      try {
        // 单次批量读取所有地址(0-103)，彻底避免多请求并发竞态
        const result = await globalModbus.readCoils(0, 104);
        if (!result.success || !result.values) return;

        const v = result.values; // v[地址] = 该线圈状态

        const startVal    = v[MODBUS_ADDRESSES.START]                   ?? false;
        const resetVal    = v[MODBUS_ADDRESSES.RESET]                   ?? false;
        const feedValve   = v[MODBUS_ADDRESSES.FEED_CYLINDER_VALVE]     ?? false;
        const s1Valve     = v[MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE] ?? false;
        const s2Valve     = v[MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE] ?? false;
        const conveyorVal = v[MODBUS_ADDRESSES.CONVEYOR]                ?? false;

        setControlSignals({
          start: startVal,
          reset: resetVal,
          feedCylinderValve: feedValve,
          sorting1CylinderValve: s1Valve,
          sorting2CylinderValve: s2Valve,
          conveyor: conveyorVal,
        });

        // 通过 getState 获取最新状态，避免闭包依赖导致轮询失效
        const { conveyorRunning, startConveyor, stopConveyor, extendCylinder, retractCylinder } =
          useDeviceStore.getState();

        if (conveyorVal) { if (!conveyorRunning) startConveyor(); }
        else             { if (conveyorRunning)  stopConveyor();  }

        if (feedValve) extendCylinder('feed');    else retractCylinder('feed');
        if (s1Valve)   extendCylinder('sorting1'); else retractCylinder('sorting1');
        if (s2Valve)   extendCylinder('sorting2'); else retractCylinder('sorting2');

        setStats(prev => ({ ...prev, readCount: prev.readCount + 1 }));
      } catch (error) {
        console.error('[仿真模式] 轮询失败:', error);
        setStats(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }
    };

    const interval = setInterval(poll, 200);
    return () => clearInterval(interval);
  }, [step]); // modbusService 和 store action 已通过全局单例/getState 稳定

  // 只要已连接就持续同步反馈（不需要等启动按钮）
  useEffect(() => {
    if (step !== 'CONNECTED') return;

    const interval = setInterval(() => {
      publishAllFeedback();
    }, 200); // 提高频率到200ms，保证实时性

    return () => clearInterval(interval);
  }, [step, publishAllFeedback]);

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
    isSimulationRunning,
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