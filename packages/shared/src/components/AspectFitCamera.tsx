import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { aspectFitScale, fitMaxDistance } from '../styles/aspectFit';

/** OrbitControls 实例在 R3F state 里是宽松类型，这里只用到这几个可变字段 */
type ControlsLike = {
  target: { x: number; y: number; z: number };
  update: () => void;
  maxDistance?: number;
};

type CameraLike = {
  position: {
    x: number; y: number; z: number;
    set: (x: number, y: number, z: number) => void;
  };
};

/**
 * 对 hook 返回对象的写入拆成普通纯函数：react-hooks/immutability 不允许
 * 直接改 useThree() 返回的 controls，但传给函数后由函数内部写是允许的
 * （与项目里 dampCameraToward 的做法一致）。
 */
function applyAspectFit(
  camera: CameraLike,
  controls: ControlsLike,
  ratio: number,
  maxDistance: number,
): void {
  controls.maxDistance = maxDistance;
  if (Math.abs(ratio - 1) < 1e-6) return;
  const t = controls.target;
  camera.position.set(
    t.x + (camera.position.x - t.x) * ratio,
    t.y + (camera.position.y - t.y) * ratio,
    t.z + (camera.position.z - t.z) * ratio,
  );
  controls.update();
}

/**
 * 通用相机宽高比补偿，给没有自定义 CameraRig 的 PhysicsScene 场景使用。
 *
 * 按视口尺寸变化时「增量」缩放相机到目标点的距离，因此用户手动拖拽/缩放
 * 之后旋转屏幕不会被重置回初始机位。配药场景由自己的 CameraRig 在阻尼目标
 * 里用同一个 aspectFitScale() 做补偿，两者共用同一数学来源。
 */
export function AspectFitCamera({ maxDistance = 20 }: { maxDistance?: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const applied = useRef(1);

  useEffect(() => {
    if (!controls) return;
    const k = aspectFitScale(width, height);
    const ratio = k / applied.current;
    applied.current = k;
    applyAspectFit(camera, controls, ratio, fitMaxDistance(maxDistance, width, height));
  }, [camera, controls, width, height, maxDistance]);

  return null;
}
