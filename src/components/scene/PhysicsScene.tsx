import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { useDeviceStore } from '../../stores';
import { SENSORS, CONVEYOR_END_X, CONVEYOR_Z_MIN } from './shared';

/**
 * 传送带组件（物理版）
 */
function PhysicsConveyorBelt({ position }: { position: [number, number, number] }) {
  const conveyorRunning = useDeviceStore((state) => state.conveyorRunning);

  return (
    <group position={position}>
      {/* 传送带物理体 - 固定刚体 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow>
          <boxGeometry args={[4, 0.2, 1]} />
          <meshStandardMaterial color={conveyorRunning ? '#333' : '#111'} />
        </mesh>
      </RigidBody>
      {/* 传送带外观装饰 */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[4.1, 0.05, 1.05]} />
        <meshStandardMaterial color="#444" wireframe />
      </mesh>
    </group>
  );
}

/**
 * 传感器组件（物理版）
 */
function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const setSensor = useDeviceStore((state) => state.setSensor);
  const [active, setActive] = useState(false);
  const material = useDeviceStore((state) => state.material);

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
        <meshStandardMaterial
          color={active ? '#00ff00' : '#ff0000'}
          emissive={active ? '#00ff00' : '#000000'}
        />
      </mesh>
      {/* 传感器碰撞体 */}
      <CuboidCollider
        sensor
        args={[0.25, 0.5, 0.25]}
        onIntersectionEnter={() => {
          setActive(true);
          // 色标传感器只对黑色物料响应
          if (name === 'color') {
            if (material.color === 'black') {
              setSensor(name as any, true);
            }
          } else {
            setSensor(name as any, true);
          }
        }}
        onIntersectionExit={() => {
          setActive(false);
          setSensor(name as any, false);
        }}
      />
    </group>
  );
}

/**
 * 气缸组件（物理版）
 */
function PhysicsCylinder({ name, position }: { name: string; position: [number, number, number] }) {
  const cylinders = useDeviceStore((state) => state.cylinders);
  const cylinder = cylinders[name as keyof typeof cylinders];
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const isFeed = name === 'feed';

  // 目标伸出量
  const targetExtend = isFeed ? 0.405 : 0.33;
  const targetRetract = -0.22;
  const targetValue = cylinder.extended ? targetExtend : targetRetract;

  useEffect(() => {
    if (rigidBodyRef.current) {
      // 运动学刚体 - 用 setNextKinematicTranslation 来驱动
      rigidBodyRef.current.setNextKinematicTranslation({
        x: position[0],
        y: position[1],
        z: position[2] - targetValue,
      });
    }
  }, [targetValue, position]);

  return (
    <group position={position}>
      {/* 气缸缸体（固定） */}
      <RigidBody type="fixed">
        <mesh>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#666" />
        </mesh>
      </RigidBody>
      {/* 推杆（运动学刚体） */}
      <RigidBody ref={rigidBodyRef} type="kinematicPosition" colliders="cuboid">
        <mesh>
          <boxGeometry args={[0.4, 0.4, 1.4]} />
          <meshStandardMaterial color="#999" />
        </mesh>
      </RigidBody>
    </group>
  );
}

/**
 * 物料组件（物理版）
 */
function PhysicsMaterial() {
  const material = useDeviceStore((state) => state.material);
  const clearMaterial = useDeviceStore((state) => state.clearMaterial);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);

  useEffect(() => {
    if (rigidBodyRef.current) {
      if (material.visible && !lastVisible.current) {
        // 物料出现时设置初始位置
        rigidBodyRef.current.setTranslation(
          {
            x: material.position[0],
            y: material.position[1],
            z: material.position[2],
          },
          true
        );
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      lastVisible.current = material.visible;
    }
  }, [material.visible, material.position]);

  // 边界检查 - 当物料超出范围时清除
  useEffect(() => {
    if (!material.visible || !rigidBodyRef.current) return;

    const checkPosition = () => {
      const pos = rigidBodyRef.current?.translation();
      if (pos) {
        if (pos.x > CONVEYOR_END_X || pos.z < CONVEYOR_Z_MIN + 0.05 || pos.y < -1) {
          clearMaterial();
        }
      }
    };

    const interval = setInterval(checkPosition, 100);
    return () => clearInterval(interval);
  }, [material.visible, clearMaterial]);

  if (!material.visible) return null;

  return (
    <RigidBody ref={rigidBodyRef} colliders="cuboid">
      <mesh castShadow>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshStandardMaterial
          color={material.color === 'blue' ? '#2563EB' : '#000000'}
        />
      </mesh>
    </RigidBody>
  );
}

/**
 * 主物理场景
 */
export const PhysicsScene: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b' }}>
      <Canvas shadows camera={{ position: [0, 5, 8], fov: 45 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.8, 0]} debug={false}>
            {/* 灯光 */}
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} castShadow />

            {/* 地面 */}
            <RigidBody type="fixed" position={[0, -0.1, 0]}>
              <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color="#334155" roughness={0.8} />
              </mesh>
            </RigidBody>

            {/* 传送带 */}
            <PhysicsConveyorBelt position={[0, 0, 0]} />

            {/* 传感器 */}
            <PhysicsSensor name="feed" position={[SENSORS.feed, 1.45, 0]} />
            <PhysicsSensor name="color" position={[SENSORS.color, 1.45, 0]} />
            <PhysicsSensor name="material" position={[SENSORS.material, 1.45, 0]} />

            {/* 气缸 */}
            <PhysicsCylinder name="feed" position={[-2.5, 1.12, 0]} />
            <PhysicsCylinder name="sorting1" position={[0, 1.12, 0]} />
            <PhysicsCylinder name="sorting2" position={[2.5, 1.12, 0]} />

            {/* 物料 */}
            <PhysicsMaterial />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
};
