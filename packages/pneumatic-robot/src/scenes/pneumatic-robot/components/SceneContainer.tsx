import { Physics } from '@react-three/rapier';
import { type ReactNode } from 'react';

interface SceneContainerProps {
  children: ReactNode;
}

export function SceneContainer({ children }: SceneContainerProps) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-3, 4, -3]} intensity={0.4} />
      <group position={[0, 0, 0]} scale={1}>
        <Physics debug={false} colliders={false} gravity={[0, -9.81, 0]}>
          {children}
        </Physics>
      </group>
    </>
  );
}