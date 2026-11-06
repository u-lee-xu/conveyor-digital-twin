import * as THREE from 'three';
import { VIEW_PRESETS, type ConveyorViewKey } from './constants';

/**
 * 机位目标解析与阻尼插值（纯函数，不碰 React hook）。
 * 与自动配药 viewGoals.ts 同一思路：CameraRig 只负责把 hook 拿到的
 * camera / controls 传进来，避免在组件里直接修改 hook 返回值
 * （react-hooks/immutability 会拦截 camera.fov += ... 这类写法）。
 */
export interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

export interface Goal {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export function resolveViewGoal(key: ConveyorViewKey): Goal {
  const v = VIEW_PRESETS[key];
  return {
    position: new THREE.Vector3(v.camera[0], v.camera[1], v.camera[2]),
    target: new THREE.Vector3(v.target[0], v.target[1], v.target[2]),
    fov: v.fov,
  };
}

/** 返回 true 表示已到位，调用方应清空目标、把控制权交还 OrbitControls */
export function dampCameraToward(
  camera: THREE.PerspectiveCamera,
  controls: ControlsLike,
  goal: Goal,
  alpha: number,
): boolean {
  camera.position.lerp(goal.position, alpha);
  controls.target.lerp(goal.target, alpha);
  camera.fov += (goal.fov - camera.fov) * alpha;
  camera.updateProjectionMatrix();
  controls.update();

  const done = camera.position.distanceTo(goal.position) < 0.004
    && controls.target.distanceTo(goal.target) < 0.004
    && Math.abs(camera.fov - goal.fov) < 0.05;
  if (!done) return false;

  camera.position.copy(goal.position);
  controls.target.copy(goal.target);
  camera.fov = goal.fov;
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}
