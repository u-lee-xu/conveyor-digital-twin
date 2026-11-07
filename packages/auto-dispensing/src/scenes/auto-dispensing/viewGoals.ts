import * as THREE from 'three';
import {
  VIEW_PRESETS, PART_STAGES, MIRROR_VIEW_SHIFT, MIRROR_LOCAL_VIEW_SHIFT,
  MIRROR_ORIGIN_VIEW, type Vec3,
} from './constants';

/** 视野较窄的局部特写：镜像时只需小幅平移，否则远端部件会被推出画面 */
const LOCAL_VIEW_KEYS = new Set(['drive', 'feed', 'dump', 'shaftEnd']);

export interface Goal {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/** OrbitControls 实例在 R3F state 里是宽松类型，这里只用到 target / update */
export type ControlsLike = { target: THREE.Vector3; update: () => void };

export interface ViewTuples {
  camera: Vec3;
  target: Vec3;
  fov: number;
}

/**
 * 把「当前视图状态」解析成相机参数。
 * 镜像布局下整机在场景层做了 X 负缩放，机位也要跟着镜像；
 * 额外平移 MIRROR_VIEW_SHIFT 是为了让设备继续避开左侧固定面板，
 * 而「起点在近处」改用右前方专用机位，保证起点端真的离观察者更近。
 */
export function resolveViewTuples(view: string, stage: string | null, mirrored: boolean): ViewTuples {
  if (stage && PART_STAGES[stage]) {
    const p = PART_STAGES[stage];
    return { camera: [...p.camera] as Vec3, target: [...p.target] as Vec3, fov: p.fov };
  }
  if (mirrored && view === 'origin') {
    const p = MIRROR_ORIGIN_VIEW;
    return { camera: [...p.camera] as Vec3, target: [...p.target] as Vec3, fov: p.fov };
  }
  const p = VIEW_PRESETS[view] ?? VIEW_PRESETS.overview;
  const shift = LOCAL_VIEW_KEYS.has(view) ? MIRROR_LOCAL_VIEW_SHIFT : MIRROR_VIEW_SHIFT;
  return {
    camera: mirrored
      ? [-p.camera[0] + shift, p.camera[1], p.camera[2]]
      : [...p.camera] as Vec3,
    target: mirrored
      ? [-p.target[0] + shift, p.target[1], p.target[2]]
      : [...p.target] as Vec3,
    fov: p.fov,
  };
}

export function resolveViewGoal(view: string, stage: string | null, mirrored: boolean): Goal {
  const t = resolveViewTuples(view, stage, mirrored);
  return {
    pos: new THREE.Vector3(...t.camera),
    target: new THREE.Vector3(...t.target),
    fov: t.fov,
  };
}

/**
 * 一帧的相机阻尼逼近，返回是否已到达目标。
 * 抽成普通函数是为了不在 React 渲染期直接写 hook 返回的对象：
 * three.js 的 Camera / OrbitControls 本来就是渲染循环里的可变对象。
 */
export function dampCameraToward(
  camera: THREE.Camera,
  controls: ControlsLike,
  goal: Goal,
  alpha: number,
): boolean {
  const cam = camera as THREE.PerspectiveCamera;
  camera.position.lerp(goal.pos, alpha);
  controls.target.lerp(goal.target, alpha);
  if (typeof cam.fov === 'number') {
    cam.fov += (goal.fov - cam.fov) * alpha;
    cam.updateProjectionMatrix();
  }
  controls.update();

  const done = camera.position.distanceTo(goal.pos) < 0.006
    && controls.target.distanceTo(goal.target) < 0.006
    && (typeof cam.fov !== 'number' || Math.abs(cam.fov - goal.fov) < 0.05);
  if (done) {
    camera.position.copy(goal.pos);
    controls.target.copy(goal.target);
    if (typeof cam.fov === 'number') {
      cam.fov = goal.fov;
      cam.updateProjectionMatrix();
    }
    controls.update();
  }
  return done;
}
