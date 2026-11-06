import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useConveyorViewStore } from '../../stores';
import { dampCameraToward, resolveViewGoal, type ControlsLike, type Goal } from './cameraGoals';

/**
 * 机位阻尼过渡：与自动配药 CameraRig 同款「只在切换后跑一次，到位即停」，
 * 之后用户拖拽 / 缩放不会被拉回。挂在场景内容里，独立 App 与平台壳共用。
 */
export function CameraRig() {
  const activeView = useConveyorViewStore((s) => s.activeView);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const goalRef = useRef<Goal | null>(null);

  useEffect(() => {
    if (!controls) return;
    goalRef.current = resolveViewGoal(activeView);
  }, [activeView, controls]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-5 * Math.min(dt, 0.05));
    if (dampCameraToward(camera, controls, goal, alpha)) goalRef.current = null;
  });

  return null;
}
