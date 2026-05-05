import { useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import type { SensorName } from '../types';
import { SENSORS, CYLINDERS, CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX, SENSOR_RANGE, CYLINDER_POSITIONS } from '../components/scene/shared';

export function usePhysics() {
  const mode = useDeviceStore((state) => state.mode);
  const animationIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const materialVelocityZRef = useRef<number>(0);
  const lastExtensionsRef = useRef<Record<string, number>>({
    feed: -0.22,
    sorting1: -0.22,
    sorting2: -0.22,
  });

  useEffect(() => {
    // 启用物理模拟：手动模式、自动模式、仿真模式和评分模式
    if (mode !== 'manual' && mode !== 'auto' && mode !== 'sim' && mode !== 'scoring') {
      console.log('[物理模拟] 模式为', mode, '，已禁用物理模拟');
      return;
    }

    lastTimeRef.current = performance.now();

    const animate = (time: number) => {
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // 归一化系数（以 60fps 为基准，即 16.67ms 为 1.0）
      const timeScale = deltaTime / 16.666;
      
      // 限制最大 timeScale 防止切换标签页后突变
      const limitedTimeScale = Math.min(timeScale, 3.0);

      const state = useDeviceStore.getState();
      const { material, conveyorRunning, cylinders } = state;

      if (!material.visible) {
        materialVelocityZRef.current = 0;
        // 更新气缸记录
        Object.entries(cylinders).forEach(([name, cyl]) => {
          lastExtensionsRef.current[name] = cyl.currentExtension;
        });
      }

      // 传感器检测 - 独立于传送带运行状态
      if (material.visible) {
        const [currentX, , currentZ] = material.position;
        
        // 只有当物料进入传送带宽度范围内（Z轴）时，才触发传感器检测
        const isInSensorRangeZ = 
          currentZ >= CONVEYOR_Z_MIN && 
          currentZ <= CONVEYOR_Z_MAX;
        
        if (isInSensorRangeZ) {
          // 稍微增大检测范围 (SENSOR_RANGE * 1.2) 防止高速移动跳过
          checkSensors(currentX, material.color, state.setSensor, SENSOR_RANGE * 1.2);
        } else {
          // 不在范围内，重置传感器
          state.setSensor('feed', false);
          state.setSensor('color', false);
          state.setSensor('material', false);
        }
      }

      // 物理运动逻辑
      if (material.visible) {
        let [newX, newY, newZ] = material.position;
        let mvz = materialVelocityZRef.current;

        // 1. 传送带带动 X 轴
        if (conveyorRunning) {
          const isOnConveyor = newZ >= CONVEYOR_Z_MIN && newZ <= CONVEYOR_Z_MAX;
          if (isOnConveyor) {
            newX += CONVEYOR_SPEED * limitedTimeScale;
          }
        }

        // 2. 惯性带动 Z 轴 (摩擦力模拟)
        newZ += mvz * limitedTimeScale;
        mvz *= Math.pow(0.92, limitedTimeScale); // 阻尼也随时间缩放
        if (Math.abs(mvz) < 0.0005) mvz = 0;

        // 3. 气缸碰撞检测
        Object.entries(CYLINDERS).forEach(([name, cylinderX]) => {
          const distance = Math.abs(newX - cylinderX);

          // 如果物料在气缸前方范围内
          if (distance < 0.25) { // 稍微扩大判定区
            const cylinder = cylinders[name as keyof typeof cylinders];
            if (cylinder) {
              const [, , cz] = CYLINDER_POSITIONS[name as keyof typeof cylinders];
              const prevExt = lastExtensionsRef.current[name] ?? cylinder.currentExtension;
              const deltaExt = cylinder.currentExtension - prevExt;
              
              // 气缸推板的世界Z坐标
              const surfaceOffset = 0.72;
              const plateSurfaceZ = cz - (cylinder.currentExtension + surfaceOffset);
              const plateVelocityZ = -deltaExt; // 气缸向 -Z 方向伸出

              // 碰撞判断
              if (plateSurfaceZ < newZ + 0.075) {
                // 发生碰撞，物料被推着走
                let pushZ = plateSurfaceZ - 0.075;
                
                if (name === 'feed') {
                  pushZ = Math.max(0, pushZ);
                  mvz = 0;
                } else {
                  if (plateVelocityZ < 0) {
                    mvz = plateVelocityZ / limitedTimeScale; // 转换为单位速度
                  }
                }
                
                newZ = pushZ;
              }
              
              // 更新记录
              lastExtensionsRef.current[name] = cylinder.currentExtension;
            }
          }
        });

        // 4. 边界检查
        let shouldClear = false;
        
        if (newX > CONVEYOR_END_X) shouldClear = true;
        
        // Z 轴掉落 (分拣推离传送带范围)
        // 适当调高阈值（从 -0.1 改为 +0.05），确保当前 0.33 行程能触发掉落
        if (newZ < CONVEYOR_Z_MIN + 0.05) shouldClear = true;

        if (shouldClear) {
          state.clearMaterial();
          state.setSensor('feed', false);
          state.setSensor('color', false);
          state.setSensor('material', false);
          materialVelocityZRef.current = 0;
        } else {
          state.updateMaterialPosition([newX, newY, newZ]);
          materialVelocityZRef.current = mvz;
        }
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [mode]);

  return null;
}

function checkSensors(
  materialX: number,
  materialColor: string,
  setSensor: (name: SensorName, active: boolean) => void,
  dynamicRange: number = SENSOR_RANGE
) {
  Object.entries(SENSORS).forEach(([name, sensorX]) => {
    const inRange = Math.abs(materialX - sensorX) < dynamicRange;
    
    let triggered: boolean;
    if (name === 'color') {
      triggered = inRange && materialColor === 'black';
    } else {
      triggered = inRange;
    }
    
    setSensor(name as SensorName, triggered);
  });
}