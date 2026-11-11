/** 龙门场景自带 Canvas / 相机 / OrbitControls，不复用平台默认 PhysicsScene（无物理工件） */
import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function GantrySceneWrapper({
  SceneContent,
  cameraPosition = [1.55, 1.0, 1.95],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      shadows
      camera={{ position: cameraPosition, fov: 42, near: 0.05, far: 60 }}
    >
      <OrbitControls target={[0.45, 0.18, 0.6]} enableDamping dampingFactor={0.1}
        minDistance={0.3} maxDistance={6} maxPolarAngle={Math.PI / 2.05} />
      <SceneContent />
    </Canvas>
  );
}
