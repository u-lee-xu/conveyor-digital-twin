import { useEffect, useRef, useCallback } from 'react';
import { useDeviceStore } from '../stores';
import { SENSORS } from '../components/scene/shared';
import type { MaterialColor } from '../types';

interface CalibrationTimes {
  phase1Time: number | null;  // 上料→分拣1的时间（毫秒）
  phase2Time: number | null;  // 分拣1→分拣2的时间（毫秒）
}

interface UseSyncPhysicsOptions {
  enabled: boolean;
  calibration: CalibrationTimes;
}

export function useSyncPhysics(options: UseSyncPhysicsOptions) {
  const { enabled, calibration } = options;
  const animationIdRef = useRef<number>(0);
  
  // 用于检测上升沿
  const prevFeedSensorRef = useRef(false);
  const prevColorSensorRef = useRef(false);

  // 同步模式下的物料动画
  const animateSyncMaterial = useCallback(() => {
    const state = useDeviceStore.getState();
    const { syncMaterial } = state;
    
    if (!syncMaterial.visible || !syncMaterial.startTime) return;
    
    const now = Date.now();
    const elapsed = now - syncMaterial.startTime;
    
    const phase1Time = calibration.phase1Time || 2000;  // 默认2秒
    const phase2Time = calibration.phase2Time || 2000;
    
    // 位置计算：根据时间比例
    const feedX = SENSORS.feed;      // -1.3
    const colorX = SENSORS.color;    // -0.2
    const materialX = SENSORS.material; // 0.9
    
    let newX: number;
    let newPhase: 0 | 1 | 2 = syncMaterial.phase;
    
    if (elapsed < phase1Time) {
      // 第1段动画：上料位置 → 分拣1位置
      const progress = elapsed / phase1Time;
      newX = feedX + (colorX - feedX) * progress;
      newPhase = 1;
    } else if (elapsed < phase1Time + phase2Time) {
      // 第2段动画：分拣1位置 → 分拣2位置
      const progress = (elapsed - phase1Time) / phase2Time;
      newX = colorX + (materialX - colorX) * progress;
      newPhase = 2;
    } else {
      // 超时，清除物料
      state.clearSyncMaterial();
      return;
    }
    
    // 更新位置
    const [_, y, z] = syncMaterial.position;
    state.updateSyncMaterial({
      position: [newX, y, z],
      phase: newPhase,
    });
  }, [calibration]);

  // 检测色标传感器判断物料颜色
  const handleColorDetection = useCallback(() => {
    const state = useDeviceStore.getState();
    const { syncMaterial, sensors } = state;
    
    if (!syncMaterial.visible || syncMaterial.detectedColor) return;
    
    // 色标传感器上升沿 → 黑色物料
    if (sensors.color && !prevColorSensorRef.current) {
      console.log('[同步模式] 色标传感器触发，检测到黑色物料');
      state.updateSyncMaterial({ detectedColor: 'black' });
      
      // 触发分拣1
      setTimeout(() => {
        useDeviceStore.getState().extendCylinder('sorting1');
        setTimeout(() => {
          useDeviceStore.getState().retractCylinder('sorting1');
          // 记录检测结果
          useDeviceStore.getState().addDetectionRecord({
            timestamp: Date.now(),
            color: 'black',
            sortedBy: 'sorting1',
          });
          // 清除物料
          useDeviceStore.getState().clearSyncMaterial();
        }, 500);
      }, 200);
    }
    
    prevColorSensorRef.current = sensors.color;
  }, []);

  // 检测物料传感器（蓝色物料到达分拣2位置）
  const handleMaterialDetection = useCallback(() => {
    const state = useDeviceStore.getState();
    const { syncMaterial, sensors } = state;
    
    if (!syncMaterial.visible) return;
    // 只处理已判定为蓝色且在第2阶段的物料
    if (syncMaterial.detectedColor !== 'blue' || syncMaterial.phase !== 2) return;
    
    // 物料传感器上升沿
    if (sensors.material && !prevFeedSensorRef.current) {
      console.log('[同步模式] 物料传感器触发，蓝色物料到达分拣2');
      
      // 触发分拣2
      setTimeout(() => {
        useDeviceStore.getState().extendCylinder('sorting2');
        setTimeout(() => {
          useDeviceStore.getState().retractCylinder('sorting2');
          // 记录检测结果
          useDeviceStore.getState().addDetectionRecord({
            timestamp: Date.now(),
            color: 'blue',
            sortedBy: 'sorting2',
          });
          // 清除物料
          useDeviceStore.getState().clearSyncMaterial();
        }, 500);
      }, 200);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    
    const animate = () => {
      // 物料位置动画
      animateSyncMaterial();
      
      // 颜色检测
      handleColorDetection();
      
      // 分拣2检测
      handleMaterialDetection();
      
      // 更新前一帧传感器状态
      const state = useDeviceStore.getState();
      prevFeedSensorRef.current = state.sensors.feed;
      prevColorSensorRef.current = state.sensors.color;
      
      animationIdRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [enabled, animateSyncMaterial, handleColorDetection, handleMaterialDetection]);

  // 处理上料传感器触发（创建新物料）
  const handleFeedSensorTrigger = useCallback((color: MaterialColor = 'blue') => {
    const state = useDeviceStore.getState();
    
    // 如果已有物料，不创建新的
    if (state.syncMaterial.visible) return;
    
    console.log('[同步模式] 上料传感器触发，创建物料，颜色:', color);
    state.spawnSyncMaterial(color);
  }, []);

  // 处理色标传感器未触发（判定蓝色）
  const handleColorSensorNotTriggered = useCallback(() => {
    const state = useDeviceStore.getState();
    const { syncMaterial, sensors } = state;
    
    // 物料在第1阶段，到达分拣1位置附近，但色标未触发
    if (syncMaterial.visible && syncMaterial.phase === 1 && !syncMaterial.detectedColor) {
      const materialX = syncMaterial.position[0];
      const colorSensorX = SENSORS.color;
      
      // 物料已过色标传感器位置，但色标未触发 → 蓝色物料
      if (materialX > colorSensorX + 0.1 && !sensors.color) {
        console.log('[同步模式] 色标传感器未触发，判定为蓝色物料');
        state.updateSyncMaterial({ detectedColor: 'blue' });
      }
    }
  }, []);

  return {
    handleFeedSensorTrigger,
    handleColorSensorNotTriggered,
  };
}
