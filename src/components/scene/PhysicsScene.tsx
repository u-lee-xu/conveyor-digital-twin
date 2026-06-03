import React, { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, type Mesh, type Group, type MeshStandardMaterial } from 'three';
import { useDeviceStore } from '../../stores';
import { geometries, materials } from './shared';
import {
  CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX, CONVEYOR_SPEED,
  CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION,
  CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
} from './shared';

const COLLIDERS_ONLY = false;
const CONVEYOR_LENGTH = 3.5;
const CONVEYOR_WIDTH = 0.6;
const CONVEYOR_HEIGHT = 1.0;
const CONVEYOR_SURFACE_Y = 1.0;
const SURFACE_OFFSET = 0.72;
const PUSH_DETECT_RANGE_X = 0.35;
const PUSH_DETECT_RANGE_Y = 0.4;
const SENSOR_DETECT_RANGE_X = 0.2;
const SENSOR_DETECT_RANGE_Z = 0.35;

function getPushPlateWorldZ(cylinderZ: number, extension: number): number {
  return cylinderZ - (extension + SURFACE_OFFSET);
}

const LABEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.4)', border: 'rgba(96,165,250,0.6)', text: '#dbeafe' },
  green: { bg: 'rgba(34,197,94,0.4)', border: 'rgba(74,222,128,0.6)', text: '#dcfce7' },
  orange: { bg: 'rgba(245,158,11,0.4)', border: 'rgba(251,191,36,0.6)', text: '#fef3c7' },
  purple: { bg: 'rgba(168,85,247,0.4)', border: 'rgba(192,132,252,0.6)', text: '#f3e8ff' },
  gray: { bg: 'rgba(107,114,128,0.4)', border: 'rgba(156,163,175,0.6)', text: '#f1f5f9' },
  yellow: { bg: 'rgba(234,179,8,0.4)', border: 'rgba(250,204,21,0.6)', text: '#fef9c3' },
};

function PhysicsLabel({ text, position, offset = [0, 0.5, 0], color = 'blue' }: {
  text: string; position: [number, number, number]; offset?: [number, number, number]; color?: string;
}) {
  const showLabels = useDeviceStore((s) => s.showLabels);
  if (!showLabels) return null;
  const c = LABEL_COLORS[color] || LABEL_COLORS.blue;
  return (
    <Html position={[position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]} center>
      <div style={{
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '10px',
        fontWeight: 500,
        border: `1px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.text,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        {text}
      </div>
    </Html>
  );
}

function DebugBox({ args, color = 0x00ff00, opacity = 0.25 }: {
  args: [number, number, number]; color?: number; opacity?: number;
}) {
  if (!COLLIDERS_ONLY) return null;
  return (
    <mesh>
      <boxGeometry args={[args[0] * 2, args[1] * 2, args[2] * 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function PhysicsConveyorBelt() {
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const rollersRef = useRef<Mesh[]>([]);

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
      <RigidBody type="fixed" position={[0, CONVEYOR_SURFACE_Y - 0.02, 0]} colliders={false}>
        <CuboidCollider args={[CONVEYOR_LENGTH / 2, 0.02, CONVEYOR_WIDTH / 2]} friction={1.5} />
        <DebugBox args={[CONVEYOR_LENGTH / 2, 0.02, CONVEYOR_WIDTH / 2]} color={0x22C55E} />
      </RigidBody>

      <group visible={!COLLIDERS_ONLY}>
        {rollerPositions.map((pos, i) => (
          <mesh
            key={`roller-${i}`}
            ref={(el) => { if (el) rollersRef.current[i] = el; }}
            geometry={geometries.roller}
            material={conveyorRunning ? materials.rollerRunning : materials.roller}
            position={pos}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}

        <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, CONVEYOR_HEIGHT - 0.06, -CONVEYOR_WIDTH / 2 - 0.04]} />
        <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, CONVEYOR_HEIGHT - 0.06, CONVEYOR_WIDTH / 2 + 0.04]} />

        <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[-CONVEYOR_LENGTH / 2 - 0.04, CONVEYOR_HEIGHT - 0.06, 0]} />
        <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[CONVEYOR_LENGTH / 2 + 0.04, CONVEYOR_HEIGHT - 0.06, 0]} />

        {legPositions.map((pos, i) => (
          <mesh key={`leg-${i}`} geometry={geometries.leg} material={materials.darkMetal} position={[pos.x, CONVEYOR_HEIGHT / 2, pos.z]} />
        ))}
      </group>
    </group>
  );
}

function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const sensors = useDeviceStore((s) => s.sensors);
  const active = sensors[name as keyof typeof sensors];

  const labelMaterial = useMemo(() => {
    if (name === 'color') return materials.sensorLabelColor;
    if (name === 'material') return materials.sensorLabelMaterial;
    return materials.sensorLabelFeed;
  }, [name]);

  return (
    <group position={position}>
      <group visible={!COLLIDERS_ONLY}>
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
      </group>
    </group>
  );
}

function PhysicsCylinder({ name, position }: { name: string; position: [number, number, number] }) {
  const cylinders = useDeviceStore((s) => s.cylinders);
  const cylinder = cylinders[name as keyof typeof cylinders];
  const updateCylinderExtension = useDeviceStore((s) => s.updateCylinderExtension);
  const rodRef = useRef<Group>(null);
  const led1Ref = useRef<Mesh>(null);
  const led2Ref = useRef<Mesh>(null);
  const pushPlateRef = useRef<RapierRigidBody>(null);

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
      newExt = current + diff * 0.12;
    } else if (current !== targetValue) {
      newExt = targetValue;
    } else {
      const atRetract = currentExtensionRef.current <= CYLINDER_RETRACT_POS + 0.04;
      const atExtend = currentExtensionRef.current >= targetExtend - 0.04;
      if (led1Ref.current) {
        const mat = led1Ref.current.material as MeshStandardMaterial;
        if (atExtend) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
        else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      if (led2Ref.current) {
        const mat = led2Ref.current.material as MeshStandardMaterial;
        if (atRetract) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
        else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      if (pushPlateRef.current) {
        const pushPlateZ = getPushPlateWorldZ(position[2], currentExtensionRef.current) + 0.02;
        pushPlateRef.current.setNextKinematicTranslation({
          x: position[0],
          y: position[1],
          z: pushPlateZ,
        });
      }
      return;
    }

    currentExtensionRef.current = newExt;
    rodRef.current.position.y = newExt;
    updateCylinderExtension(name as any, newExt);

    if (pushPlateRef.current) {
      const pushPlateZ = getPushPlateWorldZ(position[2], newExt) + 0.02;
      pushPlateRef.current.setNextKinematicTranslation({
        x: position[0],
        y: position[1],
        z: pushPlateZ,
      });
    }

    const atRetract = newExt <= CYLINDER_RETRACT_POS + 0.04;
    const atExtend = newExt >= targetExtend - 0.04;
    if (led1Ref.current) {
      const mat = led1Ref.current.material as MeshStandardMaterial;
      if (atExtend) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
      else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
    if (led2Ref.current) {
      const mat = led2Ref.current.material as MeshStandardMaterial;
      if (atRetract) { mat.color.set(0x10B981); mat.emissive.set(0x10B981); mat.emissiveIntensity = 2.0; }
      else { mat.color.set(0x1F2937); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
  });

  return (
    <>
      <RigidBody ref={pushPlateRef} type="kinematicPosition" colliders={false}>
        <CuboidCollider args={[0.1, 0.09, 0.02]} />
        <DebugBox args={[0.1, 0.09, 0.02]} color={0xF97316} opacity={0.4} />
      </RigidBody>
      <group position={position} rotation={[Math.PI / 2, 0, Math.PI]}>
        <group visible={!COLLIDERS_ONLY}>
          <mesh geometry={geometries.cylinderBody} material={materials.cylinderBody} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, -bodyHalfLen, 0]} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, bodyHalfLen, 0]} />

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
            <mesh geometry={geometries.cylinderRod} material={materials.cylinderRod} position={[0, rodLen / 2, 0]} />
            <mesh geometry={geometries.cylinderPushPlate} material={materials.endCap} position={[0, rodLen, 0]} />
          </group>
        </group>
      </group>
    </>
  );
}

function PhysicsMaterial() {
  const material = useDeviceStore((s) => s.material);
  const clearMaterial = useDeviceStore((s) => s.clearMaterial);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);
  const isKinematicRef = useRef(false);
  const conveyorYRef = useRef(CONVEYOR_SURFACE_Y);

  useEffect(() => {
    if (rigidBodyRef.current && material.visible && !lastVisible.current) {
      rigidBodyRef.current.setTranslation(
        { x: material.position[0], y: material.position[1], z: material.position[2] },
        true
      );
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (isKinematicRef.current) {
        rigidBodyRef.current.setBodyType(0, true);
        isKinematicRef.current = false;
      }
    }
    lastVisible.current = material.visible;
  }, [material.visible, material.position]);

  useFrame((_, delta) => {
    if (!rigidBodyRef.current || !material.visible) return;

    const pos = rigidBodyRef.current.translation();

    const state = useDeviceStore.getState();
    const conveyorRunning = state.conveyorRunning;
    const cylinders = state.cylinders;

    let pushingCylinder: { pushPlateZ: number } | null = null;

    const cylinderEntries = [
      { name: 'feed' as const, pos: CYLINDER_POSITIONS.feed },
      { name: 'sorting1' as const, pos: CYLINDER_POSITIONS.sorting1 },
      { name: 'sorting2' as const, pos: CYLINDER_POSITIONS.sorting2 },
    ];

    for (const cyl of cylinderEntries) {
      const cylState = cylinders[cyl.name];
      const isExtending = cylState.extended && cylState.currentExtension > -0.20;

      if (!isExtending) continue;

      const pushPlateZ = getPushPlateWorldZ(cyl.pos[2], cylState.currentExtension);
      const pushPlateX = cyl.pos[0];
      const pushPlateY = cyl.pos[1];

      const dx = Math.abs(pos.x - pushPlateX);
      const dy = Math.abs(pos.y - pushPlateY);

      if (dx < PUSH_DETECT_RANGE_X && dy < PUSH_DETECT_RANGE_Y) {
        const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX;
        if (!isOnConveyor) {
          pushingCylinder = { pushPlateZ };
        }
        break;
      }
    }

    const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX
      && pos.x >= -CONVEYOR_LENGTH / 2 && pos.x <= CONVEYOR_LENGTH / 2;

    if (pushingCylinder) {
      if (!isKinematicRef.current) {
        rigidBodyRef.current.setBodyType(2, true);
        isKinematicRef.current = true;
      }

      const targetZ = pushingCylinder.pushPlateZ - 0.12;
      const newZ = Math.min(pos.z, targetZ);
      rigidBodyRef.current.setNextKinematicTranslation({
        x: pos.x,
        y: pos.y,
        z: newZ,
      });
    } else if (isOnConveyor && conveyorRunning) {
      if (!isKinematicRef.current) {
        conveyorYRef.current = pos.y;
        rigidBodyRef.current.setBodyType(2, true);
        isKinematicRef.current = true;
      }

      const moveX = CONVEYOR_SPEED * 60 * delta;
      rigidBodyRef.current.setNextKinematicTranslation({
        x: pos.x + moveX,
        y: conveyorYRef.current,
        z: pos.z,
      });
    } else {
      if (isKinematicRef.current) {
        rigidBodyRef.current.setBodyType(0, true);
        isKinematicRef.current = false;
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      }
    }

    const sensorEntries = [
      { name: 'feed' as const, pos: SENSOR_POSITIONS.feed },
      { name: 'color' as const, pos: SENSOR_POSITIONS.color },
      { name: 'material' as const, pos: SENSOR_POSITIONS.material },
    ];

    for (const sen of sensorEntries) {
      const dx = Math.abs(pos.x - sen.pos[0]);
      const dz = Math.abs(pos.z - sen.pos[2]);
      const inRange = dx < SENSOR_DETECT_RANGE_X && dz < SENSOR_DETECT_RANGE_Z;

      if (sen.name === 'color') {
        state.setSensor('color', inRange && material.color === 'black');
      } else {
        state.setSensor(sen.name, inRange);
      }
    }

    // 只在位置变化时更新，防止无限重渲染！
    state.updateMaterialPosition([pos.x, pos.y, pos.z]);
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
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      friction={0.6}
      restitution={0.0}
      ccd
      linearDamping={0.5}
      angularDamping={0.8}
    >
      <CuboidCollider args={[0.07, 0.07, 0.07]} />
      <DebugBox args={[0.07, 0.07, 0.07]} color={0x3B82F6} opacity={0.5} />
      <group visible={!COLLIDERS_ONLY}>
        <mesh
          geometry={geometries.material}
          material={material.color === 'blue' ? materials.materialBlue : materials.materialBlack}
        />
      </group>
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
      <RigidBody type="fixed" position={[0, 0, 0]} colliders={false} friction={1.0}>
        <CuboidCollider args={[0.25, 0.025, 0.25]} />
        <DebugBox args={[0.25, 0.025, 0.25]} color={0x22C55E} />
      </RigidBody>

      <group visible={!COLLIDERS_ONLY}>
        <mesh geometry={geometries.tableTop} material={materials.wood} />
        {legPositions.map((pos, i) => (
          <mesh key={i} geometry={geometries.tableLeg} material={materials.darkMetal} position={pos} />
        ))}
      </group>
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
    { y: startY + MODULE_HEIGHT / 2, active: red, activeColor: 0xFF0000, darkColor: 0x3B0000 },
    { y: startY + MODULE_HEIGHT + GAP + MODULE_HEIGHT / 2, active: yellow, activeColor: 0xEAB308, darkColor: 0x3B2F08 },
    { y: startY + (MODULE_HEIGHT + GAP) * 2 + MODULE_HEIGHT / 2, active: green, activeColor: 0x22C55E, darkColor: 0x0B3B1A },
  ], [startY, red, yellow, green]);

  return (
    <group position={position} visible={!COLLIDERS_ONLY}>
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
            <mesh position={[0, MODULE_HEIGHT / 2 + 0.025, 0]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={2.0} />
            </mesh>
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
      <DebugBox args={[10, 0.01, 10]} color={0x64748B} opacity={0.1} />
      <group visible={!COLLIDERS_ONLY}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color={0x334155} roughness={0.8} />
        </mesh>
      </group>
    </RigidBody>
  );
}

function PhysicsSceneContent() {
  const signalTower = useDeviceStore((s) => s.signalTower);
  const showDebug = false;

  return (
    <Physics gravity={[0, -9.8, 0]} debug={showDebug} timeStep={1 / 30}>
      <ambientLight intensity={2.0} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={1.5}
      />

      <PhysicsGround />
      <PhysicsConveyorBelt />
      <PhysicsMaterialTable position={MATERIAL_TABLE_POSITION} />
      <PhysicsLabel key="material-table" text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />

      <PhysicsSensor name="feed" position={[...SENSOR_POSITIONS.feed]} />
      <PhysicsLabel key="feed-sensor" text="上料传感器" position={SENSOR_POSITIONS.feed} offset={[0, 0.2, 0]} color="green" />

      <PhysicsSensor name="color" position={[...SENSOR_POSITIONS.color]} />
      <PhysicsLabel key="color-sensor" text="色标传感器" position={SENSOR_POSITIONS.color} offset={[0, 0.2, 0]} color="orange" />

      <PhysicsSensor name="material" position={[...SENSOR_POSITIONS.material]} />
      <PhysicsLabel key="material-sensor" text="物料传感器" position={SENSOR_POSITIONS.material} offset={[0, 0.2, 0]} color="green" />

      <PhysicsCylinder name="feed" position={[...CYLINDER_POSITIONS.feed]} />
      <PhysicsLabel key="feed-cylinder" text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />

      <PhysicsCylinder name="sorting1" position={[...CYLINDER_POSITIONS.sorting1]} />
      <PhysicsLabel key="sorting1-cylinder" text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />

      <PhysicsCylinder name="sorting2" position={[...CYLINDER_POSITIONS.sorting2]} />
      <PhysicsLabel key="sorting2-cylinder" text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />

      <PhysicsMaterial />
      <PhysicsSignalTower
        position={[1.6, 0.98, -0.5]}
        red={signalTower.red}
        green={signalTower.green}
        yellow={signalTower.yellow}
      />
      <PhysicsLabel key="signal-tower" text="信号灯塔" position={[1.6, 0.98, -0.5]} offset={[0, 1.1, 0]} color="yellow" />
    </Physics>
  );
}

export const PhysicsScene: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b' }}>
      <Canvas
        camera={{ position: [0, 5, 8], fov: 45, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(1);
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
