import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeviceStore } from '../stores';

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

// 场景常量
const SENSORS = {
  feed: -1.3,
  color: -0.2,
  material: 0.9,
};

const CYLINDERS = {
  feed: -1.3,
  sorting1: -0.2,
  sorting2: 0.9,
};

const CONVEYOR_SPEED = 0.012;
const SENSOR_RANGE = 0.2;

export function useDemoMode() {
  const mode = useDeviceStore((state) => state.mode);
  const material = useDeviceStore((state) => state.material);
  const setSensor = useDeviceStore((state) => state.setSensor);
  const updateMaterialPosition = useDeviceStore((state) => state.updateMaterialPosition);
  const clearMaterial = useDeviceStore((state) => state.clearMaterial);
  const startConveyor = useDeviceStore((state) => state.startConveyor);
  const stopConveyor = useDeviceStore((state) => state.stopConveyor);
  const extendCylinder = useDeviceStore((state) => state.extendCylinder);
  const retractCylinder = useDeviceStore((state) => state.retractCylinder);

  // 使用useState而不是useRef，以便触发UI更新
  const [demoState, setDemoState] = useState<DemoState>('IDLE');
  const isRunningRef = useRef(false);
  const materialColorRef = useRef<'blue' | 'black'>('blue');

  // 状态转换延迟
  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }, []);

  // 检测传感器
  const checkSensors = useCallback((materialX: number) => {
    Object.entries(SENSORS).forEach(([name, sensorX]) => {
      const distance = Math.abs(materialX - sensorX);
      const isTriggered = distance < SENSOR_RANGE;
      setSensor(name as keyof typeof SENSORS, isTriggered);
    });
  }, [setSensor]);

  // 等待物料到达指定位置
  const waitForMaterialPosition = useCallback((targetX: number): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        const currentMaterial = useDeviceStore.getState().material;
        if (currentMaterial.visible && currentMaterial.position[0] >= targetX) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  // 推出物料动画
  const pushMaterial = useCallback(async () => {
    const push = () => {
      const currentMaterial = useDeviceStore.getState().material;
      if (currentMaterial.visible) {
        const [x, y, z] = currentMaterial.position;
        const newZ = z + 0.05;
        
        if (newZ > 1.5) {
          clearMaterial();
        } else {
          updateMaterialPosition([x, y, newZ]);
          requestAnimationFrame(push);
        }
      }
    };
    push();
    await delay(500);
  }, [clearMaterial, updateMaterialPosition, delay]);

  // 启动演示循环
  const startDemo = useCallback(async () => {
    if (useDeviceStore.getState().mode !== 'auto' || isRunningRef.current) return;
    
    isRunningRef.current = true;
    
    // 生成随机颜色物料
    const color = Math.random() > 0.5 ? 'blue' : 'black';
    materialColorRef.current = color;
    
    setDemoState('SPAWN');
    useDeviceStore.setState({
      material: {
        visible: true,
        color,
        position: [-1.3, 1.06, 0.6],
      },
    });
    
    await delay(500);
    
    // 上料气缸推出
    setDemoState('FEEDING');
    extendCylinder('feed');
    await delay(800);
    
    // 上料气缸缩回
    setDemoState('FEED_RETRACT');
    retractCylinder('feed');
    await delay(500);
    
    // 启动传送带
    setDemoState('TRANSIT');
    startConveyor();
    
    // 传送带动画循环
    const animateTransit = () => {
      const currentMaterial = useDeviceStore.getState().material;
      if (currentMaterial.visible && useDeviceStore.getState().mode === 'auto') {
        const [x, y, z] = currentMaterial.position;
        const newX = x + CONVEYOR_SPEED;
        
        // 检测传感器
        checkSensors(newX);
        
        // 更新位置
        if (newX < SENSORS.material + 0.3) {
          updateMaterialPosition([newX, y, z]);
          requestAnimationFrame(animateTransit);
        }
      }
    };
    animateTransit();
    
    // 等待物料到达色标传感器位置
    await waitForMaterialPosition(SENSORS.color - 0.1);
    
    // 色标传感器检测颜色
    // 黑色物料触发色标传感器，蓝色不触发
    const isBlack = materialColorRef.current === 'black';
    setSensor('color', isBlack);
    await delay(300);
    setSensor('color', false);
    
    // 根据颜色选择分拣气缸
    if (isBlack) {
      // 黑色：分拣1推出
      await waitForMaterialPosition(CYLINDERS.sorting1);
      setDemoState('SORTING1');
      stopConveyor();
      extendCylinder('sorting1');
      await delay(600);
      
      // 推出物料
      await pushMaterial();
      
      // 缩回气缸
      setDemoState('SORTING1_RETRACT');
      retractCylinder('sorting1');
      await delay(500);
    } else {
      // 蓝色：继续传送到分拣2
      await waitForMaterialPosition(CYLINDERS.sorting2);
      setDemoState('SORTING2');
      stopConveyor();
      extendCylinder('sorting2');
      await delay(600);
      
      // 推出物料
      await pushMaterial();
      
      // 缩回气缸
      setDemoState('SORTING2_RETRACT');
      retractCylinder('sorting2');
      await delay(500);
    }
    
    // 完成一个循环
    setDemoState('COMPLETE');
    clearMaterial();
    
    // 重置传感器
    setSensor('feed', false);
    setSensor('color', false);
    setSensor('material', false);
    
    await delay(1000);
    
    // 重新开始
    setDemoState('IDLE');
    isRunningRef.current = false;
  }, [extendCylinder, retractCylinder, startConveyor, stopConveyor, setSensor, clearMaterial, checkSensors, updateMaterialPosition, waitForMaterialPosition, pushMaterial, delay]);

  // 当模式切换时启动/停止演示
  useEffect(() => {
    if (mode !== 'auto') {
      // 非演示模式，停止状态机
      setDemoState('IDLE');
      isRunningRef.current = false;
      return;
    }

    // 自动循环
    const runLoop = async () => {
      while (useDeviceStore.getState().mode === 'auto') {
        await startDemo();
        await delay(2000); // 等待2秒后开始下一轮
      }
    };

    runLoop();
  }, [mode, startDemo, delay]);

  return {
    state: demoState,
    startDemo,
  };
}
