import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function PneumaticSceneWrapper({
  SceneContent,
  cameraPosition = [3.5, 3.5, 3.5],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      shadows
      camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 100 }}
    >
      <OrbitControls
        target={[0, 1.2, 0.15]}
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2}
      />
      <SceneContent />
    </Canvas>
  );
}
