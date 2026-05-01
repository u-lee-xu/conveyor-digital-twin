import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeviceStore } from '../stores';
import { SENSORS, CYLINDERS } from '../components/scene/shared';

// 状态机状态
type DemoState = 
  | 'IDLE'           // 待机
  | 'SPAWN'          // 生成物料
  | 'FEEDING'        // 上料气缸推出
  | 'FEED_RETRACT'   // 上料气缸缩回
  | 'TRANSIT'        // 传送带运行
  | 'SORTING1'       // 分拣1气缸推出
  | 'SORTING1_RETRACT' // 分拣1气缸缩回
  | 'SORTING2'       // 分拣2气缸推出
  | 'SORTING2_RETRACT' // 分拣2气缸缩回
  | 'COMPLETE';      // 完成

export function useDemoMode() {
  const mode = useDeviceStore((state) => state.mode);
  const extendCylinder = useDeviceStore((state) => state.extendCylinder);
  const retractCylinder = useDeviceStore((state) => state.retractCylinder);
  const startConveyor = useDeviceStore((state) => state.startConveyor);
  const stopConveyor = useDeviceStore((state) => state.stopConveyor);

  // 使用useState而不是useRef，以便触发UI更新
  const [demoState, setDemoState] = useState<DemoState>('IDLE');
  const isRunningRef = useRef(false);
  const stoppedRef = useRef(false); // 用于停止异步循环
  const materialColorRef = useRef<'blue' | 'black'>('blue');

  // 可中断的延迟函数
  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!stoppedRef.current) {
          resolve();
        }
      }, ms);
      // 存储timeoutId以便清理
      return () => clearTimeout(timeoutId);
    });
  }, []);

  // 等待物料到达指定位置
  const waitForMaterialPosition = useCallback((targetX: number): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        // 检查是否应该停止
        if (stoppedRef.current) {
          resolve();
          return;
        }
        
        const currentMaterial = useDeviceStore.getState().material;
        // 如果物料不可见，也返回（可能已被清除）
        if (!currentMaterial.visible) {
          resolve();
          return;
        }
        
        if (currentMaterial.position[0] >= targetX) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  // 等待物料到达指定Z位置（用于上料完成判断）
  const waitForMaterialZ = useCallback((targetZ: number): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        if (stoppedRef.current) { resolve(); return; }
        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) { resolve(); return; }
        
        // feed方向是减小Z
        if (currentMaterial.position[2] <= targetZ) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  // 等待物料被清除（用于分拣完成判断）
  const waitForMaterialCleared = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        if (stoppedRef.current) { resolve(); return; }
        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  // 启动演示循环
  const startDemo = useCallback(async () => {
    if (useDeviceStore.getState().mode !== 'auto' || isRunningRef.current || stoppedRef.current) return;
    
    isRunningRef.current = true;
    
    // 生成随机颜色物料
    const color = Math.random() > 0.5 ? 'blue' : 'black';
    materialColorRef.current = color;
    
    setDemoState('SPAWN');
    useDeviceStore.getState().spawnMaterial();
    // 强制设置颜色（store的spawnMaterial是随机的，这里为了状态一致性）
    useDeviceStore.setState(state => ({
        material: { ...state.material, color }
    }));
    
    await delay(1000);
    
    // 上料气缸推出
    setDemoState('FEEDING');
    extendCylinder('feed');
    
    // 等待物理引擎将物料推到传送带上（Z=0）
    await waitForMaterialZ(0.05);
    await delay(200);
    
    // 上料气缸缩回
    setDemoState('FEED_RETRACT');
    retractCylinder('feed');
    await delay(500);
    
    // 启动传送带
    setDemoState('TRANSIT');
    startConveyor();
    
    // 判断目标停止位置
    const isBlack = materialColorRef.current === 'black';
    const targetStopX = isBlack ? CYLINDERS.sorting1 : CYLINDERS.sorting2;
    
    // 等待物料到达色标传感器位置附近进行检测（物理引擎会自动触发传感器）
    await waitForMaterialPosition(SENSORS.color - 0.05);
    // 缩短延迟，仅留出极短时间确保传感器触发
    await delay(100); 
    
    // 等待物料到达目标分拣位置
    // 对于分拣1，位置就是 -0.2；对于分拣2，位置是 0.9
    await waitForMaterialPosition(targetStopX);
    
    // 到达位置，停止传送带
    stopConveyor();
    // 稍微等待传送带完全停止
    await delay(100);
    
    // 根据颜色选择分拣气缸
    if (isBlack) {
      // 黑色：分拣1推出
      setDemoState('SORTING1');
      extendCylinder('sorting1');
      
      // 等待物理引擎将物料推离传送带（被清除）
      await waitForMaterialCleared();
      
      // 缩回气缸
      setDemoState('SORTING1_RETRACT');
      retractCylinder('sorting1');
      await delay(500);
    } else {
      // 蓝色：分拣2推出
      setDemoState('SORTING2');
      extendCylinder('sorting2');
      
      // 等待物理引擎将物料推离传送带（被清除）
      await waitForMaterialCleared();
      
      // 缩回气缸
      setDemoState('SORTING2_RETRACT');
      retractCylinder('sorting2');
      await delay(500);
    }
    
    // 完成一个循环
    setDemoState('COMPLETE');
    await delay(1000);
    
    // 重新开始
    setDemoState('IDLE');
    isRunningRef.current = false;
  }, [extendCylinder, retractCylinder, startConveyor, stopConveyor, waitForMaterialPosition, waitForMaterialZ, waitForMaterialCleared, delay]);

  // 当模式切换时启动/停止演示
  useEffect(() => {
    if (mode !== 'auto') {
      // 非演示模式，停止状态机
      stoppedRef.current = true;
      setDemoState('IDLE');
      isRunningRef.current = false;
      return;
    }

    // 重置停止标志
    stoppedRef.current = false;

    // 自动循环
    const runLoop = async () => {
      while (useDeviceStore.getState().mode === 'auto' && !stoppedRef.current) {
        await startDemo();
        if (stoppedRef.current) break;
        await delay(2000); // 等待2秒后开始下一轮
      }
    };

    runLoop();

    // 清理函数
    return () => {
      stoppedRef.current = true;
    };
  }, [mode, startDemo, delay]);

  return {
    state: demoState,
    startDemo,
  };
}
