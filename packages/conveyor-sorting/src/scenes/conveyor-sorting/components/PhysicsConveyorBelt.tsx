import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DoubleSide, type Mesh } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { COMPONENT, PHYSICS } from '../constants';

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

export function PhysicsConveyorBelt() {
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const rollersRef = useRef<Mesh[]>([]);

  const rollerSpacing = (COMPONENT.CONVEYOR_LENGTH - 0.2) / (COMPONENT.ROLLER_COUNT - 1);

  const rollerPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < COMPONENT.ROLLER_COUNT; i++) {
      positions.push([
        -COMPONENT.CONVEYOR_LENGTH / 2 + 0.1 + i * rollerSpacing,
        COMPONENT.CONVEYOR_HEIGHT - 0.06,
        0,
      ]);
    }
    return positions;
  }, [rollerSpacing]);

  const legPositions = useMemo(() => [
    { x: -COMPONENT.CONVEYOR_LENGTH / 2 - 0.04, z: -COMPONENT.CONVEYOR_WIDTH / 2 - 0.04 },
    { x: -COMPONENT.CONVEYOR_LENGTH / 2 - 0.04, z: COMPONENT.CONVEYOR_WIDTH / 2 + 0.04 },
    { x: COMPONENT.CONVEYOR_LENGTH / 2 + 0.04, z: -COMPONENT.CONVEYOR_WIDTH / 2 - 0.04 },
    { x: COMPONENT.CONVEYOR_LENGTH / 2 + 0.04, z: COMPONENT.CONVEYOR_WIDTH / 2 + 0.04 },
  ], []);

  useFrame(() => {
    if (conveyorRunning) {
      rollersRef.current.forEach((roller) => {
        if (roller) roller.rotation.y -= COMPONENT.ROLLER_SPEED;
      });
    }
  });

  return (
    <group>
      <RigidBody type="fixed" position={[0, COMPONENT.CONVEYOR_SURFACE_Y - PHYSICS.CONVEYOR_BELT_HALF_Y, 0]} colliders={false}>
        <CuboidCollider args={[COMPONENT.CONVEYOR_LENGTH / 2, PHYSICS.CONVEYOR_BELT_HALF_Y, COMPONENT.CONVEYOR_WIDTH / 2]} friction={PHYSICS.CONVEYOR_BELT_FRICTION} />
        <DebugBox args={[COMPONENT.CONVEYOR_LENGTH / 2, PHYSICS.CONVEYOR_BELT_HALF_Y, COMPONENT.CONVEYOR_WIDTH / 2]} color={0x22C55E} />
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

        <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, COMPONENT.CONVEYOR_HEIGHT - 0.06, -COMPONENT.CONVEYOR_WIDTH / 2 - 0.04]} />
        <mesh geometry={geometries.rail} material={materials.darkMetal} position={[0, COMPONENT.CONVEYOR_HEIGHT - 0.06, COMPONENT.CONVEYOR_WIDTH / 2 + 0.04]} />

        <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[-COMPONENT.CONVEYOR_LENGTH / 2 - 0.04, COMPONENT.CONVEYOR_HEIGHT - 0.06, 0]} />
        <mesh geometry={geometries.sideRail} material={materials.darkMetal} position={[COMPONENT.CONVEYOR_LENGTH / 2 + 0.04, COMPONENT.CONVEYOR_HEIGHT - 0.06, 0]} />

        {legPositions.map((pos, i) => (
          <mesh key={`leg-${i}`} geometry={geometries.leg} material={materials.darkMetal} position={[pos.x, COMPONENT.CONVEYOR_HEIGHT / 2, pos.z]} />
        ))}
      </group>
    </group>
  );
}
