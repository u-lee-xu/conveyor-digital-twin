/** 场景容器：自带 Canvas / 相机 / OrbitControls，不复用平台默认 PhysicsScene */
import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime, renderPixelRatio } from '@digital-twin/shared';
import { MOTOR_VISUAL } from '../constants/motorConstants';
import { useMotorViewStore } from '../stores/useMotorViewStore';
import { MotorViewSwitcher } from './MotorViewSwitcher';

export function MotorSceneWrapper({
  SceneContent,
  cameraPosition = MOTOR_VISUAL.SCENE_CAMERA,
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  const activeStage = useMotorViewStore((s) => s.activeStage);
  const isViewer = isViewerRuntime();
  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows={!isViewer}
        dpr={renderPixelRatio(isViewer)}
        camera={{ position: cameraPosition, fov: 40, near: 0.02, far: 60 }}
      >
        <color attach="background" args={[MOTOR_VISUAL.SCENE_BACKGROUND]} />
        <OrbitControls makeDefault target={MOTOR_VISUAL.SCENE_TARGET} enableDamping
          dampingFactor={0.1} minDistance={activeStage ? 0.06 : 0.3} maxDistance={7}
          maxPolarAngle={Math.PI / 2.05} />
        <Suspense fallback={null}><SceneContent /></Suspense>
      </Canvas>
      <MotorViewSwitcher />
    </>
  );
}
