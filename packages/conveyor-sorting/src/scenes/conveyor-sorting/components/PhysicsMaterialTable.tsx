import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DoubleSide } from 'three';
import { geometries, materials } from '../../../components/scene/shared';
import { COMPONENT, PHYSICS, SURFACE_GAP } from '../constants';

const COLLIDERS_ONLY = false;

function DebugBox({ args, color = '#22c55e', opacity = 0.25 }: {
  args: [number, number, number]; color?: string; opacity?: number;
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
        <DebugBox args={[COMPONENT.MATERIAL_TABLE_HALF_XZ, COMPONENT.MATERIAL_TABLE_HALF_Y, COMPONENT.MATERIAL_TABLE_HALF_XZ]} color="#22c55e" />
      </RigidBody>

      <group visible={!COLLIDERS_ONLY}>
        {/* 物料台改为铝板台面 + 亮银包边，与输送线型材同一套材质 */}
        <mesh geometry={geometries.tableTop} material={materials.panel} />
        <mesh position={[0, COMPONENT.MATERIAL_TABLE_HALF_Y + SURFACE_GAP, 0]} material={materials.decal}>
          <boxGeometry args={[0.27, SURFACE_GAP, 0.27]} />
        </mesh>
        {legPositions.map((pos, i) => (
          <group key={i}>
            <mesh geometry={geometries.tableLeg} material={materials.base} position={pos} />
            <mesh position={[pos[0], pos[1], pos[2] + 0.01 + SURFACE_GAP]} material={materials.profileSlot}>
              <boxGeometry args={[0.014, 0.8, SURFACE_GAP]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
