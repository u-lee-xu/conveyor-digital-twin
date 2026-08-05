import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { ComponentType } from 'react';

function PhysicsGround() {
  return (
    <RigidBody type="fixed" position={[0, -0.01, 0]} colliders={false}>
      <CuboidCollider args={[10, 0.01, 10]} collisionGroups={(0x0001 << 16) | 0x0003} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={0x334155} roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}

interface PhysicsSceneProps {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}

export const PhysicsScene: React.FC<PhysicsSceneProps> = ({ 
  SceneContent, 
  cameraPosition = [0, 5, 8] 
}) => {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b' }}>
      <Canvas
        frameloop={isHidden ? 'never' : 'always'}
        camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(1);
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.8, 0]} debug={false} timeStep={1 / 30}>
            <ambientLight intensity={2.0} />
            <directionalLight position={[5, 10, 7]} intensity={1.5} />
            <PhysicsGround />
            <SceneContent />
          </Physics>
        </Suspense>
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={20}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
};
