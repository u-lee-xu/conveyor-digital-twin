import type { ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function TrafficSceneWrapper({
  SceneContent,
  cameraPosition = [7.3, 6.1, 7.3],
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
        target={[0, 0.8, 0]}
        enableDamping
        dampingFactor={0.1}
        minDistance={1.2}
        maxDistance={18}
        maxPolarAngle={Math.PI / 2.1}
      />
      <SceneContent />
    </Canvas>
  );
}
