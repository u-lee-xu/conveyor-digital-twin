import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DoubleSide } from 'three';
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

export function PhysicsMaterialTable({ position }: { position: [number, number, number] }) {
  const legPositions = useMemo(() => [
    [-COMPONENT.MATERIAL_TABLE_LEG_OFFSET, -COMPONENT.MATERIAL_TABLE_LEG_HEIGHT, -COMPONENT.MATERIAL_TABLE_LEG_OFFSET],
    [COMPONENT.MATERIAL_TABLE_LEG_OFFSET, -COMPONENT.MATERIAL_TABLE_LEG_HEIGHT, -COMPONENT.MATERIAL_TABLE_LEG_OFFSET],
    [-COMPONENT.MATERIAL_TABLE_LEG_OFFSET, -COMPONENT.MATERIAL_TABLE_LEG_HEIGHT, COMPONENT.MATERIAL_TABLE_LEG_OFFSET],
    [COMPONENT.MATERIAL_TABLE_LEG_OFFSET, -COMPONENT.MATERIAL_TABLE_LEG_HEIGHT, COMPONENT.MATERIAL_TABLE_LEG_OFFSET],
  ] as [number, number, number][], []);

  return (
    <group position={position}>
      <RigidBody type="fixed" position={[0, 0, 0]} colliders={false} friction={PHYSICS.MATERIAL_TABLE_FRICTION}>
        <CuboidCollider args={[COMPONENT.MATERIAL_TABLE_HALF_XZ, COMPONENT.MATERIAL_TABLE_HALF_Y, COMPONENT.MATERIAL_TABLE_HALF_XZ]} />
        <DebugBox args={[COMPONENT.MATERIAL_TABLE_HALF_XZ, COMPONENT.MATERIAL_TABLE_HALF_Y, COMPONENT.MATERIAL_TABLE_HALF_XZ]} color={0x22C55E} />
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
