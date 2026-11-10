import * as THREE from 'three';
import { VIEW_PRESETS, PART_STAGES, isPartStage, type ConveyorViewKey } from './constants';

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

/**
 * 展台优先短路：一旦选中部件，整机机位 view 不再参与取景，
 * 与自动配药 resolveViewTuples(view, stage, mirrored) 的优先级一致。
 */
export function resolveViewGoal(key: ConveyorViewKey, stage: string | null = null): Goal {
  if (isPartStage(stage)) {
    const p = PART_STAGES[stage];
    return {
      position: new THREE.Vector3(p.camera[0], p.camera[1], p.camera[2]),
      target: new THREE.Vector3(p.target[0], p.target[1], p.target[2]),
      fov: p.fov,
    };
  }
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
