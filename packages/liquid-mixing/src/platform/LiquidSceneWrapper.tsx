/** 液体混装场景容器：自带 Canvas / 相机 / OrbitControls，不复用平台默认 PhysicsScene */
import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LIQUID_VISUAL } from '../constants/liquidConstants';
import { useLiquidViewStore } from '../stores/useLiquidViewStore';
import { LiquidViewSwitcher } from './LiquidViewSwitcher';

export function LiquidSceneWrapper({
  SceneContent,
  cameraPosition = LIQUID_VISUAL.SCENE_CAMERA,
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  // 展台是近景：放开 OrbitControls 缩放下限，否则相机被推远看不清小件
  const activeStage = useLiquidViewStore((s) => s.activeStage);
  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows
        camera={{ position: cameraPosition, fov: 40, near: 0.02, far: 60 }}
      >
        <color attach="background" args={[LIQUID_VISUAL.SCENE_BACKGROUND]} />
        {/* makeDefault：LiquidCameraRig 从 useThree().controls 拿实例做机位阻尼过渡 */}
        <OrbitControls makeDefault target={LIQUID_VISUAL.SCENE_TARGET} enableDamping
          dampingFactor={0.1} minDistance={activeStage ? 0.06 : 0.3} maxDistance={6}
          maxPolarAngle={Math.PI / 2.05} />
        <SceneContent />
      </Canvas>
      <LiquidViewSwitcher />
    </>
  );
}
