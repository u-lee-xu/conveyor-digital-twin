import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import {
  CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX,
  CYLINDER_POSITIONS, SENSOR_POSITIONS,
  COMPONENT, PHYSICS,
} from '../constants';
import { getPushPlateWorldZ } from './helpers';

const COLLIDERS_ONLY = false;

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

export function PhysicsMaterial() {
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const materialColor = useDeviceStore((s) => s.material.color);
  const clearMaterial = useDeviceStore((s) => s.clearMaterial);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);
  const isKinematicRef = useRef(false);
  const conveyorYRef = useRef<number>(COMPONENT.CONVEYOR_SURFACE_Y);

  useEffect(() => {
    if (rigidBodyRef.current && materialVisible && !lastVisible.current) {
      const spawnPos = useDeviceStore.getState().material.position;
      rigidBodyRef.current.setTranslation(
        { x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] },
        true
      );
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (isKinematicRef.current) {
        rigidBodyRef.current.setBodyType(0 as const, true);
        isKinematicRef.current = false;
      }
    }
    lastVisible.current = materialVisible;
  }, [materialVisible]);

  useFrame((_, delta) => {
    if (!rigidBodyRef.current || !materialVisible) return;

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

      if (dx < PHYSICS.PUSH_DETECT_RANGE_X && dy < PHYSICS.PUSH_DETECT_RANGE_Y) {
        const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX;
        if (!isOnConveyor) {
          pushingCylinder = { pushPlateZ };
        }
        break;
      }
    }

    const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX
      && pos.x >= -COMPONENT.CONVEYOR_LENGTH / 2 && pos.x <= COMPONENT.CONVEYOR_LENGTH / 2;

    if (pushingCylinder) {
      if (!isKinematicRef.current) {
        rigidBodyRef.current.setBodyType(2 as const, true);
        isKinematicRef.current = true;
      }

      const targetZ = pushingCylinder.pushPlateZ - COMPONENT.CYLINDER_PUSH_TARGET_OFFSET;
      const newZ = Math.min(pos.z, targetZ);
      rigidBodyRef.current.setNextKinematicTranslation({
        x: pos.x,
        y: pos.y,
        z: newZ,
      });
    } else if (isOnConveyor && conveyorRunning) {
      if (!isKinematicRef.current) {
        conveyorYRef.current = pos.y;
        rigidBodyRef.current.setBodyType(2 as const, true);
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
        rigidBodyRef.current.setBodyType(0 as const, true);
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
      const inRange = dx < PHYSICS.SENSOR_DETECT_RANGE_X && dz < PHYSICS.SENSOR_DETECT_RANGE_Z;

      if (sen.name === 'color') {
        state.setSensor('color', inRange && materialColor === 'black');
      } else {
        state.setSensor(sen.name, inRange);
      }
    }

    state.updateMaterialPosition([pos.x, pos.y, pos.z]);
  });

  useEffect(() => {
    if (!materialVisible || !rigidBodyRef.current) return;
    const checkPosition = () => {
      const pos = rigidBodyRef.current?.translation();
      if (pos && (pos.x > CONVEYOR_END_X || pos.z < CONVEYOR_Z_MIN + PHYSICS.CONVEYOR_Z_MARGIN || pos.y < PHYSICS.FALL_RECOVERY_Y)) {
        clearMaterial();
      }
    };
    const interval = setInterval(checkPosition, 100);
    return () => clearInterval(interval);
  }, [materialVisible, clearMaterial]);

  if (!materialVisible) return null;

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      friction={PHYSICS.MATERIAL_FRICTION}
      restitution={PHYSICS.MATERIAL_RESTITUTION}
      ccd
      linearDamping={PHYSICS.MATERIAL_LINEAR_DAMPING}
      angularDamping={PHYSICS.MATERIAL_ANGULAR_DAMPING}
    >
      <CuboidCollider args={[COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE]} />
      <DebugBox args={[COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE]} color={0x3B82F6} opacity={0.5} />
      <group visible={!COLLIDERS_ONLY}>
        <mesh
          geometry={geometries.material}
          material={materialColor === 'blue' ? materials.materialBlue : materials.materialBlack}
        />
      </group>
    </RigidBody>
  );
}
