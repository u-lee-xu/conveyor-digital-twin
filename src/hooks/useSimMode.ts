import { useState, useCallback, useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import type { CylinderName } from '../types';
import { MODBUS_ADDRESSES } from '../services/modbus';
import { modbusService as globalModbus } from '../services/modbus-websocket';
import { CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT, CYLINDER_LIMIT_ZONE } from '../components/scene/shared';

export type SimStep = 'DISCONNECTED' | 'CONNECTED' | 'RUNNING' | 'ERROR';

export const useSimMode = () => {
  const spawnMaterial = useDeviceStore((s) => s.spawnMaterial);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const mode = useDeviceStore((s) => s.mode);

  const [step, setStep] = useState<SimStep>('DISCONNECTED');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const statsRef = useRef({
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
  });
  const [stats, setStats] = useState({
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
  });
  const [controlSignals, setControlSignals] = useState({
    start: false,
    stop: false,
    reset: false,
    feedCylinderValve: false,
    sorting1CylinderValve: false,
    sorting2CylinderValve: false,
    conveyor: false,
  });

  useEffect(() => {
    if (mode !== 'sim') {
      setStep('DISCONNECTED');
      setIsSimulationRunning(false);
      return;
    }

    setStep(isConnected ? 'CONNECTED' : 'DISCONNECTED');
  }, [isConnected, mode]);

  const publishAllFeedback = useCallback(async () => {
    if (mode !== 'sim' || !isConnected) return;

    try {
      const { sensors, cylinders } = useDeviceStore.getState();

      const feedExt = cylinders.feed.currentExtension;
      const s1Ext = cylinders.sorting1.currentExtension;
      const s2Ext = cylinders.sorting2.currentExtension;

      const feedAtExtend = feedExt >= CYLINDER_EXTEND_POS_FEED - CYLINDER_LIMIT_ZONE;
      const feedAtRetract = feedExt <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const s1AtExtend = s1Ext >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
      const s1AtRetract = s1Ext <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const s2AtExtend = s2Ext >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
      const s2AtRetract = s2Ext <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;

      const result = await globalModbus.writeFeedbackBatch({
        magneticExtend: { feed: feedAtExtend, sort1: s1AtExtend, sort2: s2AtExtend },
        magneticRetract: { feed: feedAtRetract, sort1: s1AtRetract, sort2: s2AtRetract },
        sensors: {
          feed: sensors.feed,
          color: sensors.color,
          material: sensors.material,
        },
      });

      if (result.success) {
        statsRef.current.writeCount += 9;
      } else {
        statsRef.current.errorCount++;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '反馈写入失败');
        statsRef.current.errorCount++;
    }
  }, [isConnected, mode]);

  const onSimulationStart = useCallback(async (signal: boolean) => {
    if (mode !== 'sim' || !isConnected) return;
    setIsSimulationRunning(true);
    setControlSignals(prev => ({ ...prev, start: signal }));
    try {
      await globalModbus.writeCoil(MODBUS_ADDRESSES.START, signal);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '启动信号写入失败');
    }
  }, [isConnected, mode]);

  const onSimulationReset = useCallback(async (signal: boolean) => {
    if (mode !== 'sim' || !isConnected) return;
    setControlSignals(prev => ({ ...prev, reset: signal }));
    try {
      await globalModbus.writeCoil(MODBUS_ADDRESSES.RESET, signal);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '复位信号写入失败');
    }
    if (signal) {
      setIsSimulationRunning(false);
    }
  }, [isConnected, mode]);

  const onSimulationStop = useCallback(async (signal: boolean) => {
    if (mode !== 'sim' || !isConnected) return;
    setControlSignals(prev => ({ ...prev, stop: signal }));
    try {
      await globalModbus.writeCoil(11, signal);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '停止信号写入失败');
    }
    if (signal) {
      setIsSimulationRunning(false);
    }
  }, [isConnected, mode]);

  useEffect(() => {
    if (mode !== 'sim' || !isConnected) return;

    let polling = false;
    let stopped = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const { isScoringRunning } = useDeviceStore.getState();
        if (isScoringRunning) return;

        const result = await globalModbus.readCoils(0, 104);
        if (!result.success || !result.values) return;

        const v = result.values;
        const { isRecording, addTraceEntry } = useDeviceStore.getState();
        if (isRecording) {
          addTraceEntry(v);
        }

        const startVal = v[MODBUS_ADDRESSES.START] ?? false;
        const stopVal = v[11] ?? false;
        const resetVal = v[MODBUS_ADDRESSES.RESET] ?? false;
        const feedValve = v[MODBUS_ADDRESSES.FEED_CYLINDER_VALVE] ?? false;
        const s1Valve = v[MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE] ?? false;
        const s2Valve = v[MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE] ?? false;
        const conveyorVal = v[MODBUS_ADDRESSES.CONVEYOR] ?? false;

        setControlSignals(prev => {
          if (
            prev.start === startVal &&
            prev.stop === stopVal &&
            prev.reset === resetVal &&
            prev.feedCylinderValve === feedValve &&
            prev.sorting1CylinderValve === s1Valve &&
            prev.sorting2CylinderValve === s2Valve &&
            prev.conveyor === conveyorVal
          ) return prev;
          return {
            start: startVal,
            stop: stopVal,
            reset: resetVal,
            feedCylinderValve: feedValve,
            sorting1CylinderValve: s1Valve,
            sorting2CylinderValve: s2Valve,
            conveyor: conveyorVal,
          };
        });

        const { conveyorRunning, startConveyor, stopConveyor, extendCylinder, retractCylinder, cylinders: curCylinders } = useDeviceStore.getState();

        if (conveyorVal) {
          if (!conveyorRunning) startConveyor();
        } else if (conveyorRunning) {
          stopConveyor();
        }

        if (feedValve !== curCylinders.feed.extended) {
          if (feedValve) extendCylinder('feed'); else retractCylinder('feed');
        }
        if (s1Valve !== curCylinders.sorting1.extended) {
          if (s1Valve) extendCylinder('sorting1'); else retractCylinder('sorting1');
        }
        if (s2Valve !== curCylinders.sorting2.extended) {
          if (s2Valve) extendCylinder('sorting2'); else retractCylinder('sorting2');
        }

        statsRef.current.readCount++;
      } catch {
        statsRef.current.errorCount++;
      } finally {
        polling = false;
      }
    };

    const loop = () => {
      if (stopped) return;
      poll();
      setTimeout(loop, 100);
    };
    loop();

    return () => { stopped = true; };
  }, [isConnected, mode]);

  useEffect(() => {
    if (mode !== 'sim' || !isConnected) return;
    const syncInterval = setInterval(() => {
      setStats({ ...statsRef.current });
    }, 1000);
    return () => clearInterval(syncInterval);
  }, [isConnected, mode]);

  useEffect(() => {
    if (mode !== 'sim' || !isConnected) return;
    let publishing = false;
    const interval = setInterval(async () => {
      if (publishing) return;
      publishing = true;
      try {
        await publishAllFeedback();
      } finally {
        publishing = false;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isConnected, mode, publishAllFeedback]);

  const onSpawnMaterial = useCallback(() => {
    if (mode === 'sim' && isConnected) {
      spawnMaterial();
    }
  }, [isConnected, mode, spawnMaterial]);

  const onInitialize = useCallback(async () => {
    if (mode !== 'sim' || !isConnected) return;

    const { extendCylinder } = useDeviceStore.getState();

    const colors: Array<'blue' | 'black'> = ['blue', 'black'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomX = -1.0 + Math.random() * 2.0;

    useDeviceStore.setState({
      material: {
        visible: true,
        color: randomColor,
        position: [randomX, 1.06, 0],
        onConveyor: true,
        conveyorDelay: 0,
      },
    });

    const cylinderNames: CylinderName[] = ['feed', 'sorting1', 'sorting2'];
    const count = 1 + Math.floor(Math.random() * 3);
    const shuffled = cylinderNames.sort(() => Math.random() - 0.5);
    const toExtend = shuffled.slice(0, count);

    for (const name of toExtend) {
      extendCylinder(name);
    }

    try {
      await globalModbus.writeCoil(MODBUS_ADDRESSES.FEED_CYLINDER_VALVE, toExtend.includes('feed'));
      await globalModbus.writeCoil(MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE, toExtend.includes('sorting1'));
      await globalModbus.writeCoil(MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE, toExtend.includes('sorting2'));
    } catch {}

    setControlSignals(prev => ({
      ...prev,
      feedCylinderValve: toExtend.includes('feed'),
      sorting1CylinderValve: toExtend.includes('sorting1'),
      sorting2CylinderValve: toExtend.includes('sorting2'),
    }));
  }, [isConnected, mode]);

  return {
    step,
    isSimulationRunning,
    errorMessage,
    stats,
    controlSignals,
    publishAllFeedback,
    onSimulationStart,
    onSimulationStop,
    onSimulationReset,
    onSpawnMaterial,
    onInitialize,
  };
};
