/** 龙门场景容器：自带 Canvas / 相机 / OrbitControls，不复用平台默认 PhysicsScene */
import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GANTRY_VISUAL } from '../constants/gantryConstants';
import { useGantryViewStore } from '../stores/useGantryViewStore';
import { GantryViewSwitcher } from './GantryViewSwitcher';

export function GantrySceneWrapper({
  SceneContent,
  cameraPosition = [1.9, 1.25, 2.35],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  // 展台是近景：把 OrbitControls 的缩放下限放开，否则相机被推远看不清小件
  const activeStage = useGantryViewStore((s) => s.activeStage);

  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows
        camera={{ position: cameraPosition, fov: 40, near: 0.02, far: 60 }}
      >
        <color attach="background" args={[GANTRY_VISUAL.SCENE_BACKGROUND]} />
        {/* makeDefault：CameraRig 从 useThree().controls 拿到实例做机位阻尼过渡 */}
        <OrbitControls makeDefault target={[0.45, 0.18, 0.6]} enableDamping dampingFactor={0.1}
          minDistance={activeStage ? 0.06 : 0.3} maxDistance={6} maxPolarAngle={Math.PI / 2.05} />
        <SceneContent />
      </Canvas>
      <GantryViewSwitcher />
    </>
  );
}
