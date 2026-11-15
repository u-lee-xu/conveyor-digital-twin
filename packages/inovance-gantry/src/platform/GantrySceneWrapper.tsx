/** 龙门场景容器：自带 Canvas / 相机 / OrbitControls，不复用平台默认 PhysicsScene */
import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime, renderPixelRatio } from '@digital-twin/shared';
import { GANTRY_VISUAL, GANTRY_SCENE_CAMERA, GANTRY_SCENE_TARGET } from '../constants/gantryConstants';
import { useGantryViewStore } from '../stores/useGantryViewStore';
import { GantryViewSwitcher } from './GantryViewSwitcher';

export function GantrySceneWrapper({
  SceneContent,
  cameraPosition = GANTRY_SCENE_CAMERA,
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  // 展台是近景：把 OrbitControls 的缩放下限放开，否则相机被推远看不清小件
  const activeStage = useGantryViewStore((s) => s.activeStage);
  // 观众只读大屏：关阴影、锁 dpr=1，避免高 DPR 电视满帧渲染
  const isViewer = isViewerRuntime();

  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows={!isViewer}
        dpr={renderPixelRatio(isViewer)}
        camera={{ position: cameraPosition, fov: 40, near: 0.02, far: 60 }}
      >
        <color attach="background" args={[GANTRY_VISUAL.SCENE_BACKGROUND]} />
        {/* makeDefault：CameraRig 从 useThree().controls 拿到实例做机位阻尼过渡 */}
        <OrbitControls makeDefault target={GANTRY_SCENE_TARGET} enableDamping dampingFactor={0.1}
          minDistance={activeStage ? 0.06 : 0.3} maxDistance={6} maxPolarAngle={Math.PI / 2.05} />
        <Suspense fallback={null}><SceneContent /></Suspense>
      </Canvas>
      <GantryViewSwitcher />
    </>
  );
}
