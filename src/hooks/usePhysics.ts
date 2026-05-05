import { useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import type { SensorName } from '../types';
import { SENSORS, CYLINDERS, CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX, SENSOR_RANGE, CYLINDER_POSITIONS } from '../components/scene/shared';

export function usePhysics() {
  const mode = useDeviceStore((state) => state.mode);
  const animationIdRef = useRef<number>(0);
  const materialVelocityZRef = useRef<number>(0);
  const lastExtensionsRef = useRef<Record<string, number>>({
    feed: -0.22,
    sorting1: -0.22,
    sorting2: -0.22,
  });

  useEffect(() => {
    // 启用物理模拟：手动模式、自动模式和仿真模式
    if (mode !== 'manual' && mode !== 'auto' && mode !== 'sim') {
      console.log('[物理模拟] 模式为', mode, '，已禁用物理模拟');
      return;
    }

    const animate = () => {
      const state = useDeviceStore.getState();
      const { material, conveyorRunning, cylinders } = state;

      if (!material.visible) {
        materialVelocityZRef.current = 0;
        // 更新气缸记录，防止下次物料出现时产生巨大的速度突变
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
          checkSensors(currentX, material.color, state.setSensor);
        } else {
          // 不在范围内，重置传感器（重要：防止物料被推走后传感器仍然触发）
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
            newX += CONVEYOR_SPEED;
          }
        }

        // 2. 惯性带动 Z 轴 (摩擦力模拟)
        newZ += mvz;
        mvz *= 0.92; // 阻尼系数
        if (Math.abs(mvz) < 0.0005) mvz = 0;

        // 3. 气缸碰撞检测
        Object.entries(CYLINDERS).forEach(([name, cylinderX]) => {
          const distance = Math.abs(newX - cylinderX);

          // 如果物料在气缸前方范围内
          if (distance < 0.2) {
            const cylinder = cylinders[name as keyof typeof cylinders];
            if (cylinder) {
              const [, , cz] = CYLINDER_POSITIONS[name as keyof typeof cylinders];
              const prevExt = lastExtensionsRef.current[name] ?? cylinder.currentExtension;
              const deltaExt = cylinder.currentExtension - prevExt;
              
              // 气缸推板的世界Z坐标
              const surfaceOffset = 0.72;
              const plateSurfaceZ = cz - (cylinder.currentExtension + surfaceOffset);
              const plateVelocityZ = -deltaExt; // 气缸向 -Z 方向伸出

              // 碰撞判断：推板 Z 坐标小于物料边缘 Z 坐标 (mz + 0.075)
              if (plateSurfaceZ < newZ + 0.075) {
                // 发生碰撞，物料被推着走
                let pushZ = plateSurfaceZ - 0.075;
                
                if (name === 'feed') {
                  // 1. 上料气缸：强制停止在中轴线 (0)
                  pushZ = Math.max(0, pushZ);
                  mvz = 0; // 上料不产生惯性，确保停在中心
                } else {
                  // 2. 分拣气缸：同步速度，产生惯性
                  if (plateVelocityZ < 0) {
                    mvz = plateVelocityZ;
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
        
        // X 轴超出末端
        if (newX > CONVEYOR_END_X) {
          shouldClear = true;
        }
        
        // Z 轴掉落 (分拣推离传送带范围)
        if (newZ < CONVEYOR_Z_MIN - 0.1) {
          shouldClear = true;
        }

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

    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [mode]); // 只依赖 mode，其他状态在 animate 内通过 getState() 获取

  return null;
}

// 检查传感器触发
// 规则：
//   上料传感器、物料传感器：检出所有颜色物料
//   色标传感器：只检出黑色物料
function checkSensors(
  materialX: number,
  materialColor: string,
  setSensor: (name: SensorName, active: boolean) => void
) {
  Object.entries(SENSORS).forEach(([name, sensorX]) => {
    const inRange = Math.abs(materialX - sensorX) < SENSOR_RANGE;
    
    let triggered: boolean;
    if (name === 'color') {
      // 色标传感器只对黑色物料响应
      triggered = inRange && materialColor === 'black';
    } else {
      // 上料传感器和物料传感器检出所有颜色
      triggered = inRange;
    }
    
    setSensor(name as SensorName, triggered);
  });
}