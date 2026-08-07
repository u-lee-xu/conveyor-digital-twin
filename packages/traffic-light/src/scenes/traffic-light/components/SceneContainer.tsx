import { type ReactNode } from 'react';

interface SceneContainerProps {
  children: ReactNode;
}

/** 交通灯场景容器（静态场景，无需物理引擎） */
export function SceneContainer({ children }: SceneContainerProps) {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <group position={[0, 0, 0]} scale={1}>
        {children}
      </group>
    </>
  );
}
