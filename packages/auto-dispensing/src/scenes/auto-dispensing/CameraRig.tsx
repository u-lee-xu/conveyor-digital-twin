import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { aspectFitScale } from '@digital-twin/shared';
import { useAppStore } from '../../stores/useAppStore';
import {
  resolveViewGoal, dampCameraToward,
  type Goal, type ControlsLike,
} from './viewGoals';

/**
 * Canvas 内的相机控制器：只在本 store 的视图状态变化后启动一次阻尼过渡，
 * 到达目标即停止，之后用户拖拽/缩放 OrbitControls 不会被拉回。
 * 独立 App 与平台壳共用（由 DispensingSceneContent 挂载）。
 */
export function CameraRig() {
  const activeView = useAppStore((s) => s.activeView);
  const activeStage = useAppStore((s) => s.activeStage);
  const mirrored = useAppStore((s) => s.mirrored);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const size = useThree((s) => s.size);
  const goalRef = useRef<Goal | null>(null);

  useEffect(() => {
    if (!controls) return;
    const base = resolveViewGoal(activeView, activeStage, mirrored);
    // 机位常量按桌面 16:10 标定；窄屏沿视线拉远，保证横向整机仍完整入画。
    // 补偿放在「阻尼目标」里而不是直接写 camera，切机位 / 转屏都不会互相打架。
    const k = aspectFitScale(size.width, size.height);
    goalRef.current = {
      pos: base.target.clone().add(base.pos.clone().sub(base.target).multiplyScalar(k)),
      target: base.target,
      fov: base.fov,
    };
  }, [activeView, activeStage, mirrored, controls, size.width, size.height]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-5 * Math.min(dt, 0.05));
    if (dampCameraToward(camera, controls, goal, alpha)) goalRef.current = null;
  });

  return null;
}
