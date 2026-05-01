import { useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import type { SensorName } from '../types';
import { SENSORS, CYLINDERS, CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX, SENSOR_RANGE, CYLINDER_POSITIONS } from '../components/scene/shared';

export function usePhysics() {
  const mode = useDeviceStore((state) => state.mode);
  const animationIdRef = useRef<number>(0);

  useEffect(() => {
    // 启用物理模拟：手动模式、自动模式和仿真模式
    if (mode !== 'manual' && mode !== 'auto' && mode !== 'sim') {
      console.log('[物理模拟] 模式为', mode, '，已禁用物理模拟');
      return;
    }

    const animate = () => {
      const state = useDeviceStore.getState();
      const { material, conveyorRunning, cylinders } = state;

      // 传感器检测 - 独立于传送带运行状态
      if (material.visible) {
        const [currentX, , currentZ] = material.position;
        
        // 只有当物料进入传送带宽度范围内（Z轴）时，才触发传感器检测
        const isInSensorRangeZ = 
          currentZ >= CONVEYOR_Z_MIN && 
          currentZ <= CONVEYOR_Z_MAX;
        
        if (isInSensorRangeZ) {
          checkSensors(currentX, state.setSensor);
        } else {
          // 不在范围内，重置传感器（重要：防止物料被推走后传感器仍然触发）
          state.setSensor('feed', false);
          state.setSensor('color', false);
          state.setSensor('material', false);
        }
      }

      // 物料跟随传送带运动
      if (material.visible && conveyorRunning) {
        const [currentX, currentY, currentZ] = material.position;
        
        // 检查物料是否在传送带宽度范围内（Z轴）
        const isOnConveyor = 
          currentZ >= CONVEYOR_Z_MIN && 
          currentZ <= CONVEYOR_Z_MAX;
        
        if (isOnConveyor) {
          const newX = currentX + CONVEYOR_SPEED;

          // 检查是否超出传送带范围
          if (newX > CONVEYOR_END_X) {
            // 物料掉落，清除
            state.clearMaterial();
            // 重置传感器
            state.setSensor('feed', false);
            state.setSensor('color', false);
            state.setSensor('material', false);
          } else {
            state.updateMaterialPosition([newX, currentY, currentZ]);
          }
        }
      }

      // 气缸碰撞检测
      if (material.visible) {
        const materialX = material.position[0];

        // 检查每个气缸
        Object.entries(CYLINDERS).forEach(([name, cylinderX]) => {
          const distance = Math.abs(materialX - cylinderX);

          // 如果物料在气缸前方范围内且气缸正在伸出
          if (distance < 0.2) {
            const cylinder = cylinders[name as keyof typeof cylinders];
            if (cylinder) {
              const [, , cz] = CYLINDER_POSITIONS[name as keyof typeof cylinders];
              const [mx, my, mz] = material.position;
              
              // 气缸推板表面的世界Z坐标
              // 气缸在cz，推杆向负Z方向延伸
              // 推板中心在 localY = currentExtension + 0.6
              // 推板厚度 0.03，表面在 localY = currentExtension + 0.615
              const plateSurfaceZ = cz - (cylinder.currentExtension + 0.615);

              if (name === 'feed') {
                // 上料气缸：物料在 Z=0.6，被推向 Z=0
                // 如果推板表面已经触及或超过物料侧面 (mz + 0.075)
                if (plateSurfaceZ <= mz + 0.075) {
                  const newZ = Math.max(0, plateSurfaceZ - 0.075);
                  state.updateMaterialPosition([mx, my, newZ]);
                }
              } else {
                // 分拣气缸：物料在 Z=0，被推离传送带
                if (plateSurfaceZ <= mz + 0.075) {
                  const newZ = plateSurfaceZ - 0.075;
                  if (newZ < CONVEYOR_Z_MIN - 0.2) {
                    state.clearMaterial();
                    state.setSensor('color', false);
                    state.setSensor('material', false);
                  } else {
                    state.updateMaterialPosition([mx, my, newZ]);
                  }
                }
              }
            }
          }
        });
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [mode]); // 只依赖 mode，其他状态在 animate 内通过 getState() 获取

  return null;
}

// 检查传感器触发
function checkSensors(materialX: number, setSensor: (name: SensorName, active: boolean) => void) {
  Object.entries(SENSORS).forEach(([name, sensorX]) => {
    const distance = Math.abs(materialX - sensorX);
    const isTriggered = distance < SENSOR_RANGE;
    setSensor(name as SensorName, isTriggered);
  });
}