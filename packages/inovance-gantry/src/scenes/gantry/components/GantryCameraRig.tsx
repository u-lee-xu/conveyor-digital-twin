/**
 * 机位阻尼过渡：与传送带 / 配药场景同款「切换后跑一次，到位即停」。
 * 展台用 PART_STAGES 的专用近景相机；整机用 VIEW_PRESETS。
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { useGantryViewStore } from '../../../stores/useGantryViewStore';
import { GANTRY_VIEW_PRESETS, GANTRY_PART_STAGES, type GantryViewKey, type GantryPartKind } from '../../../constants/gantryConstants';

interface Goal {
  camera: [number, number, number];
  target: [number, number, number];
  fov: number;
}

function resolveGantryViewGoal(view: GantryViewKey, stage: GantryPartKind | null): Goal {
  if (stage) {
    const s = GANTRY_PART_STAGES[stage];
    return { camera: s.camera, target: s.target, fov: s.fov };
  }
  const v = GANTRY_VIEW_PRESETS[view] ?? GANTRY_VIEW_PRESETS.overview;
  return { camera: v.camera, target: v.target, fov: v.fov };
}

export function GantryCameraRig() {
  const activeView = useGantryViewStore((s) => s.activeView);
  const activeStage = useGantryViewStore((s) => s.activeStage);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  const goalRef = useRef<Goal | null>(null);

  useEffect(() => {
    if (!controls) return;
    goalRef.current = resolveGantryViewGoal(activeView, activeStage);
  }, [activeView, activeStage, controls]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-5 * Math.min(dt, 0.05));
    const camGoal = new Vector3(...goal.camera);
    const targetGoal = new Vector3(...goal.target);
    camera.position.lerp(camGoal, alpha);
    controls.target.lerp(targetGoal, alpha);
    // three.js 相机本就是可变对象，fov 阻尼需要原地写回
    // eslint-disable-next-line react-hooks/immutability
    camera.fov += (goal.fov - camera.fov) * alpha;
    camera.updateProjectionMatrix();
    controls.update();
    if (camera.position.distanceTo(camGoal) < 0.003 && controls.target.distanceTo(targetGoal) < 0.003) {
      goalRef.current = null;
    }
  });

  return null;
}
