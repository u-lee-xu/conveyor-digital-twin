import React, { Suspense, useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useDeviceStore } from '../../stores';
import { geometries, materials } from './shared';
import { Label } from './';
import {
  CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX, CONVEYOR_SPEED,
  CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION,
  CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
} from './shared';

const CONVEYOR_LENGTH = 3.5;
const CONVEYOR_WIDTH = 0.6;
const CONVEYOR_HEIGHT = 1.0;
const CONVEYOR_SURFACE_Y = 1.0;
const SURFACE_OFFSET = 0.72;

function getPushPlateWorldZ(cylinderZ: number, extension: number): number {
  return cylinderZ - (extension + SURFACE_OFFSET);
}

function PhysicsConveyorBelt() {
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const rollersRef = useRef<THREE.Mesh[]>([]);

  const rollerCount = 12;
  const rollerSpacing = (CONVEYOR_LENGTH - 0.2) / (rollerCount - 1);

  const rollerPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < rollerCount; i++) {
      positions.push([
        -CONVEYOR_LENGTH / 2 + 0.1 + i * rollerSpacing,
        CONVEYOR_HEIGHT - 0.06,
        0,
      ]);
    }
    return positions;
  }, [rollerCount, rollerSpacing]);

  const legPositions = useMemo(() => [
    { x: -CONVEYOR_LENGTH / 2 - 0.04, z: -CONVEYOR_WIDTH / 2 - 0.04 },
    { x: -CONVEYOR_LENGTH / 2 - 0.04, z: CONVEYOR_WIDTH / 2 + 0.04 },
    { x: CONVEYOR_LENGTH / 2 + 0.04, z: -CONVEYOR_WIDTH / 2 - 0.04 },
    { x: CONVEYOR_LENGTH / 2 + 0.04, z: CONVEYOR_WIDTH / 2 + 0.04 },
  ], []);

  useFrame(() => {
    if (conveyorRunning) {
      rollersRef.current.forEach((roller) => {
        if (roller) roller.rotation.y -= 0.03;
      });
    }
  });

  return (
    <group>
      {/* 传送带表面物理碰撞体 - 顶部与滚筒顶部齐平 Y=1.0 */}
      <RigidBody type="fixed" position={[0, CONVEYOR_SURFACE_Y - 0.02, 0]} colliders={false}>
        <CuboidCollider args={[CONVEYOR_LENGTH / 2, 0.02, CONVEYOR_WIDTH / 2]} friction={1.5} />
      </RigidBody>

      {/* 滚筒 */}
      {rollerPositions.map((pos, i) => (
        <mesh
          key={`roller-${i}`}
          ref={(el) => { if (el) rollersRef.current[i] = el; }}
          geometry={geometries.roller}
          material={conveyorRunning ? materials.rollerRunning : materials.roller}
          position={pos}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
        />
      ))}

      {/* 长轨 */}
      <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, CONVEYOR_HEIGHT - 0.06, -CONVEYOR_WIDTH / 2 - 0.04]} />
      <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, CONVEYOR_HEIGHT - 0.06, CONVEYOR_WIDTH / 2 + 0.04]} />

      {/* 侧轨 */}
      <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[-CONVEYOR_LENGTH / 2 - 0.04, CONVEYOR_HEIGHT - 0.06, 0]} />
      <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[CONVEYOR_LENGTH / 2 + 0.04, CONVEYOR_HEIGHT - 0.06, 0]} />

      {/* 支撑腿 */}
      {legPositions.map((pos, i) => (
        <mesh key={`leg-${i}`} geometry={geometries.leg} material={materials.darkMetal} position={[pos.x, CONVEYOR_HEIGHT / 2, pos.z]} receiveShadow />
      ))}
    </group>
  );
}

function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const setSensor = useDeviceStore((s) => s.setSensor);
  const material = useDeviceStore((s) => s.material);
  const [active, setActive] = useState(false);

  const labelMaterial = useMemo(() => {
    if (name === 'color') return materials.sensorLabelColor;
    if (name === 'material') return materials.sensorLabelMaterial;
    return materials.sensorLabelFeed;
  }, [name]);

  return (
    <group position={position}>
      <mesh geometry={geometries.sensorBracket} material={materials.sensorBracket} position={[0, -0.075, 0]} />
      <mesh geometry={geometries.sensor} material={materials.sensor} position={[0, 0.03, 0]} />
      <mesh position={[0, 0.06, 0.04]} scale={[1.5, 1.5, 1.5]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial
          color={active ? 0x22C55E : 0x1F2937}
          emissive={active ? 0x22C55E : 0x000000}
          emissiveIntensity={active ? 1.5 : 0}
        />
      </mesh>
      <mesh geometry={geometries.sensorLabel} material={labelMaterial} position={[0, 0.03, -0.05]} />

      <CuboidCollider
        sensor
        args={[0.25, 0.5, 0.25]}
        onIntersectionEnter={() => {
          setActive(true);
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

function PhysicsCylinder({ name, position }: { name: string; position: [number, number, number] }) {
  const cylinders = useDeviceStore((s) => s.cylinders);
  const cylinder = cylinders[name as keyof typeof cylinders];
  const updateCylinderExtension = useDeviceStore((s) => s.updateCylinderExtension);
  const rodRef = useRef<THREE.Group>(null);
  const pushPlateRef = useRef<RapierRigidBody>(null);
  const led1Ref = useRef<THREE.Mesh>(null);
  const led2Ref = useRef<THREE.Mesh>(null);

  const isFeed = name === 'feed';
  const bodyHalfLen = 0.4;
  const rodLen = 0.7;

  const targetExtend = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;
  const targetRetract = CYLINDER_RETRACT_POS;
  const targetValue = cylinder.extended ? targetExtend : targetRetract;

  const currentExtensionRef = useRef(isFeed ? (cylinder.extended ? 0.405 : -0.22) : (cylinder.extended ? 0.33 : -0.22));

  useFrame(() => {
    if (!rodRef.current) return;

    const current = currentExtensionRef.current;
    const diff = targetValue - current;

    let newExt = current;
    if (Math.abs(diff) > 0.001) {
      newExt = current + diff * 0.25;
    } else if (current !== targetValue) {
      newExt = targetValue;
    } else {
      // LED update only
      const atRetract = currentExtensionRef.current <= CYLINDER_RETRACT_POS + 0.04;
      const atExtend = currentExtensionRef.current >= targetExtend - 0.04;
      if (led1Ref.current) {
        const mat = led1Ref.current.material as THREE.MeshStandardMaterial;
        if (atExtend) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
        else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      if (led2Ref.current) {
        const mat = led2Ref.current.material as THREE.MeshStandardMaterial;
        if (atRetract) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
        else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      return;
    }

    currentExtensionRef.current = newExt;
    rodRef.current.position.y = newExt;
    updateCylinderExtension(name as any, newExt);

    // 推板世界坐标位置（不依赖父 group 旋转）
      if (pushPlateRef.current) {
        const worldZ = getPushPlateWorldZ(position[2], newExt);
        pushPlateRef.current.setNextKinematicTranslation({
          x: position[0],
          y: position[1] + 0.135, // 加上Y轴偏移，与视觉对齐
          z: worldZ,
        });
      }

    const atRetract = newExt <= CYLINDER_RETRACT_POS + 0.04;
    const atExtend = newExt >= targetExtend - 0.04;
    if (led1Ref.current) {
      const mat = led1Ref.current.material as THREE.MeshStandardMaterial;
      if (atExtend) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
      else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
    if (led2Ref.current) {
      const mat = led2Ref.current.material as THREE.MeshStandardMaterial;
      if (atRetract) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
      else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
  });

  const initialWorldZ = getPushPlateWorldZ(position[2], currentExtensionRef.current);

  return (
    <>
      {/* 视觉组件（旋转 group 内） */}
      <group position={position} rotation={[Math.PI / 2, 0, Math.PI]}>
        <mesh geometry={geometries.cylinderBody} material={materials.cylinderBody} castShadow />
        <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, -bodyHalfLen, 0]} castShadow />
        <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, bodyHalfLen, 0]} castShadow />

        {[
          { y: bodyHalfLen - 0.05, key: 'valve-top' },
          { y: -bodyHalfLen + 0.05, key: 'valve-bottom' },
        ].map(({ y, key }) => (
          <group key={key} position={[0.1, y, 0]}>
            <mesh geometry={geometries.valveBody} material={materials.endCap} />
            <mesh geometry={geometries.tubeConnector} material={materials.darkMetal} position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
            <mesh geometry={geometries.valveCap} material={materials.darkMetal} position={[0, 0.04, 0]} />
          </group>
        ))}

        {[
          { y: bodyHalfLen - 0.1, ledRef: led1Ref, key: 'sw-ext' },
          { y: -bodyHalfLen + 0.1, ledRef: led2Ref, key: 'sw-ret' },
        ].map(({ y, ledRef: ref, key }) => (
          <group key={key}>
            <mesh geometry={geometries.magneticSwitch} material={materials.magneticSwitch} position={[0, y, -0.1]}>
              <mesh ref={ref} geometry={geometries.led} material={materials.ledInactive.clone()} position={[0, 0.01, -0.03]} />
            </mesh>
          </group>
        ))}

        <group ref={rodRef} position={[0, currentExtensionRef.current, 0]}>
          <mesh geometry={geometries.cylinderRod} material={materials.cylinderRod} position={[0, rodLen / 2, 0]} castShadow />
          <mesh geometry={geometries.cylinderPushPlate} material={materials.endCap} position={[0, rodLen, 0]} castShadow />
        </group>
      </group>

      {/* 推板物理碰撞体 - 独立于旋转 group，直接使用世界坐标 */}
      {/* 调整碰撞体Y轴位置，与视觉推板中心对齐（视觉推板Y轴在气缸坐标系下，对应世界坐标系） */}
      <RigidBody
        ref={pushPlateRef}
        type="kinematicPosition"
        colliders={false}
        position={[position[0], position[1] + 0.135, initialWorldZ]}
      >
        <CuboidCollider args={[0.1, 0.08, 0.02]} />
      </RigidBody>
    </>
  );
}

function PhysicsMaterial() {
  const material = useDeviceStore((s) => s.material);
  const clearMaterial = useDeviceStore((s) => s.clearMaterial);
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);

  useEffect(() => {
    if (rigidBodyRef.current && material.visible && !lastVisible.current) {
      rigidBodyRef.current.setTranslation(
        { x: material.position[0], y: material.position[1], z: material.position[2] },
        true
      );
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    lastVisible.current = material.visible;
  }, [material.visible, material.position]);

  useFrame(() => {
    if (!rigidBodyRef.current || !material.visible || !conveyorRunning) return;

    const pos = rigidBodyRef.current.translation();
    const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX;

    if (isOnConveyor) {
      const currentVel = rigidBodyRef.current.linvel();
      const targetVelX = CONVEYOR_SPEED * 60;
      const newVelX = currentVel.x + (targetVelX - currentVel.x) * 0.1;
      rigidBodyRef.current.setLinvel({ x: newVelX, y: currentVel.y, z: currentVel.z }, false);
    }
  });

  useEffect(() => {
    if (!material.visible || !rigidBodyRef.current) return;
    const checkPosition = () => {
      const pos = rigidBodyRef.current?.translation();
      if (pos && (pos.x > CONVEYOR_END_X || pos.z < CONVEYOR_Z_MIN + 0.05 || pos.y < -1)) {
        clearMaterial();
      }
    };
    const interval = setInterval(checkPosition, 100);
    return () => clearInterval(interval);
  }, [material.visible, clearMaterial]);

  if (!material.visible) return null;

  return (
    <RigidBody ref={rigidBodyRef} colliders="cuboid" friction={0.8} restitution={0.1}>
      <mesh
        geometry={geometries.material}
        material={material.color === 'blue' ? materials.materialBlue : materials.materialBlack}
        castShadow
        receiveShadow
      />
    </RigidBody>
  );
}

function PhysicsMaterialTable({ position }: { position: [number, number, number] }) {
  const legPositions = useMemo(() => [
    [-0.12, -0.5, -0.12],
    [0.12, -0.5, -0.12],
    [-0.12, -0.5, 0.12],
    [0.12, -0.5, 0.12],
  ] as [number, number, number][], []);

  return (
    <group position={position}>
      {/* 物料台桌面物理碰撞体 */}
      <RigidBody type="fixed" position={[0, 0, 0]} colliders={false} friction={1.0}>
        <CuboidCollider args={[0.15, 0.025, 0.15]} />
      </RigidBody>

      {/* 物料台到传送带的过渡斜面 - 帮助物料平滑滑到传送带上 */}
      <RigidBody type="fixed" position={[0, -0.005, -0.22]} colliders={false} friction={0.5}>
        <CuboidCollider args={[0.15, 0.02, 0.12]} />
      </RigidBody>

      <mesh geometry={geometries.tableTop} material={materials.wood} castShadow receiveShadow />
      {legPositions.map((pos, i) => (
        <mesh key={i} geometry={geometries.tableLeg} material={materials.darkMetal} position={pos} castShadow />
      ))}
    </group>
  );
}

function PhysicsSignalTower({ position, red, green, yellow }: {
  position: [number, number, number];
  red: boolean; green: boolean; yellow: boolean;
}) {
  const MODULE_RADIUS = 0.065;
  const MODULE_HEIGHT = 0.13;
  const DOME_RADIUS = 0.065;
  const BASE_RADIUS_TOP = 0.075;
  const BASE_RADIUS_BOTTOM = 0.09;
  const BASE_HEIGHT = 0.04;
  const POLE_RADIUS = 0.025;
  const POLE_HEIGHT = 0.22;
  const GAP = 0.015;

  const startY = BASE_HEIGHT + POLE_HEIGHT;

  const moduleData = useMemo(() => [
    { y: startY + MODULE_HEIGHT / 2, active: red, activeColor: 0xEF4444, darkColor: 0x3B1111 },
    { y: startY + MODULE_HEIGHT + GAP + MODULE_HEIGHT / 2, active: yellow, activeColor: 0xEAB308, darkColor: 0x3B2F08 },
    { y: startY + (MODULE_HEIGHT + GAP) * 2 + MODULE_HEIGHT / 2, active: green, activeColor: 0x22C55E, darkColor: 0x0B3B1A },
  ], [startY, red, yellow, green]);

  return (
    <group position={position}>
      <mesh position={[0, BASE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[BASE_RADIUS_TOP, BASE_RADIUS_BOTTOM, BASE_HEIGHT, 20]} />
        <meshStandardMaterial color={0x1F2937} metalness={0.7} roughness={0.3} />
      </mesh>

      <mesh position={[0, BASE_HEIGHT + POLE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 12]} />
        <meshStandardMaterial color={0x374151} metalness={0.6} roughness={0.4} />
      </mesh>

      {moduleData.map(({ y, active, activeColor, darkColor }, i) => (
        <group key={i} position={[0, y, 0]}>
          <mesh>
            <cylinderGeometry args={[MODULE_RADIUS, MODULE_RADIUS, MODULE_HEIGHT, 20]} />
            <meshStandardMaterial
              color={active ? activeColor : darkColor}
              emissive={active ? activeColor : 0x000000}
              emissiveIntensity={active ? 2.0 : 0}
              transparent
              opacity={0.9}
              roughness={0.3}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[0, MODULE_HEIGHT / 2, 0]}>
            <sphereGeometry args={[DOME_RADIUS, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.5]} />
            <meshStandardMaterial
              color={active ? activeColor : darkColor}
              emissive={active ? activeColor : 0x000000}
              emissiveIntensity={active ? 4.0 : 0}
              transparent
              opacity={active ? 1.0 : 0.7}
              roughness={0.1}
              metalness={0}
            />
          </mesh>
          {active && (
            <pointLight color={activeColor} intensity={0.8} distance={1.5} position={[0, MODULE_HEIGHT / 2 + 0.025, 0]} />
          )}
        </group>
      ))}
    </group>
  );
}

function PhysicsGround() {
  return (
    <RigidBody type="fixed" position={[0, -0.01, 0]} colliders={false}>
      <CuboidCollider args={[10, 0.01, 10]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={0x334155} roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}

function PhysicsSceneContent() {
  const signalTower = useDeviceStore((s) => s.signalTower);
  const showLabels = useDeviceStore((s) => s.showLabels);
  const useNewPhysics = useDeviceStore((s) => s.useNewPhysics);
  const showDebug = false;

  return (
    <Physics gravity={[0, -9.8, 0]} debug={showDebug && useNewPhysics}>
      <ambientLight intensity={1.5} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.001}
      />

      <PhysicsGround />
      <PhysicsConveyorBelt />
      <PhysicsMaterialTable position={MATERIAL_TABLE_POSITION} />
      {showLabels && (
        <Label key="material-table" text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />
      )}

      <PhysicsSensor name="feed" position={[...SENSOR_POSITIONS.feed]} />
      {showLabels && (
        <Label key="feed-sensor" text="上料传感器" position={SENSOR_POSITIONS.feed} offset={[0, 0.2, 0]} color="green" />
      )}

      <PhysicsSensor name="color" position={[...SENSOR_POSITIONS.color]} />
      {showLabels && (
        <Label key="color-sensor" text="色标传感器" position={SENSOR_POSITIONS.color} offset={[0, 0.2, 0]} color="orange" />
      )}

      <PhysicsSensor name="material" position={[...SENSOR_POSITIONS.material]} />
      {showLabels && (
        <Label key="material-sensor" text="物料传感器" position={SENSOR_POSITIONS.material} offset={[0, 0.2, 0]} color="green" />
      )}

      <PhysicsCylinder name="feed" position={[...CYLINDER_POSITIONS.feed]} />
      {showLabels && (
        <Label key="feed-cylinder" text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />
      )}

      <PhysicsCylinder name="sorting1" position={[...CYLINDER_POSITIONS.sorting1]} />
      {showLabels && (
        <Label key="sorting1-cylinder" text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />
      )}

      <PhysicsCylinder name="sorting2" position={[...CYLINDER_POSITIONS.sorting2]} />
      {showLabels && (
        <Label key="sorting2-cylinder" text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />
      )}

      <PhysicsMaterial />
      <PhysicsSignalTower
        position={[1.6, 0.98, -0.5]}
        red={signalTower.red}
        green={signalTower.green}
        yellow={signalTower.yellow}
      />
      {showLabels && (
        <Label key="signal-tower" text="信号灯塔" position={[1.6, 0.98, -0.5]} offset={[0, 1.1, 0]} color="yellow" />
      )}
    </Physics>
  );
}

export const PhysicsScene: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b' }}>
      <Canvas
        shadows
        camera={{ position: [0, 5, 8], fov: 45, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(1);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Suspense fallback={null}>
          <PhysicsSceneContent />
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
