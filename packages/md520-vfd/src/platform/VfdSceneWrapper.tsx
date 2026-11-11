/**
 * MD520 独立场景容器：自带 Canvas / OrbitControls / 近景相机。
 * 不复用平台默认 PhysicsScene（本场景没有物理工件，也不需要整机地面）。
 */
import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function VfdSceneWrapper({
  SceneContent,
  cameraPosition = [0.95, 0.98, -2.05],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      shadows
      camera={{ position: cameraPosition, fov: 42, near: 0.1, far: 100 }}
    >
      <OrbitControls
        target={[-0.10, 0.34, -0.10]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.35}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2.05}
      />
      <SceneContent />
    </Canvas>
  );
}
