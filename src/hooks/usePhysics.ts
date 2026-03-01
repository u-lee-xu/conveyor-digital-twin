import { useEffect, useRef } from 'react';
import { useDeviceStore } from '../stores';
import type { SensorName } from '../types';
import { SENSORS, CYLINDERS, CONVEYOR_SPEED, CONVEYOR_END_X, SENSOR_RANGE } from '../components/scene/shared';

export function usePhysics() {
  const mode = useDeviceStore((state) => state.mode);
  const animationIdRef = useRef<number>(0);

  useEffect(() => {
    // 只在手动模式下启用物理模拟
    if (mode !== 'manual') return;

    const animate = () => {
      const state = useDeviceStore.getState();
      const { material, conveyorRunning, cylinders } = state;

      // 物料跟随传送带运动
      if (material.visible && conveyorRunning) {
        const [currentX, currentY, currentZ] = material.position;
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

          // 传感器检测
          checkSensors(newX, state.setSensor);
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
            if (cylinder?.extended) {
              // 气缸推出物料 - 将物料沿 Z 轴移动
              const [x, y, z] = material.position;
              const newZ = z + 0.02; // 推出速度

              if (newZ > 1.5) {
                // 物料被推出，清除
                state.clearMaterial();
              } else {
                // 推动物料
                state.updateMaterialPosition([x, y, newZ]);
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