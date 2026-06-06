import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useBeltStore, type BeltSensorName } from './useBeltStore';
import {
  SENSOR_POSITIONS, INDICATOR_POSITIONS,
  COLLECTION_BOX_POSITION, IMPURITY_BOX_POSITION, SMALL_PARTICLE_BOX_POSITION,
  DEFLECTOR_PLATES,
  type IndicatorName, VISUAL, COMPONENT, PHYSICS,
} from './constants';
import { BeltConveyor, IndicatorLight } from './components/BeltConveyor';
import { Hopper, FeedCylinder, SortingStations, CollectionBox } from './components/SortingStation';
import { BeltMaterialItem } from './components/BeltMaterialItem';
import { SceneLabel } from './components/SceneLabel';

// ===== 传感器名称映射 =====
const SENSOR_LABELS: Record<string, string> = {
  s1_belt1_entry: '入口传感器',
  s3_belt1_exit: '1# 出口传感器',
  s4_belt2_entry: '2# 入口传感器',
  s6_belt2_exit: '2# 出口传感器',
  s7_belt3_entry: '3# 入口传感器',
  s9_belt3_exit: '3# 出口传感器',
  s2_belt1_run: '1# 运行指示',
  s5_belt2_run: '2# 运行指示',
  s8_belt3_run: '3# 运行指示',
  s10_pileup: '堆料传感器',
};

export function ThreeStageBeltSceneContent() {
  const materials = useBeltStore((s) => s.materials);
  const indicators = useBeltStore((s) => s.indicators);
  const sensors = useBeltStore((s) => s.sensors);
  const materialIds = useMemo(() => materials.map(m => m.id), [materials]);

  return (
    <group>
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />

      <BeltConveyor beltName="belt1" /><BeltConveyor beltName="belt2" />
      <BeltConveyor beltName="belt3" /><BeltConveyor beltName="belt4" />

      {/* 溜槽导板 — belt1→belt2、belt2→belt3 */}
      <RigidBody type="fixed" position={DEFLECTOR_PLATES.plate1to2.position} rotation={DEFLECTOR_PLATES.plate1to2.rotation} colliders={false}>
        <CuboidCollider args={[DEFLECTOR_PLATES.plate1to2.size[0] / 2, DEFLECTOR_PLATES.plate1to2.size[1] / 2, DEFLECTOR_PLATES.plate1to2.size[2] / 2]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} friction={PHYSICS.BELT_FRICTION} />
        <mesh><boxGeometry args={DEFLECTOR_PLATES.plate1to2.size} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} transparent opacity={0.6} /></mesh>
      </RigidBody>
      <RigidBody type="fixed" position={DEFLECTOR_PLATES.plate2to3.position} rotation={DEFLECTOR_PLATES.plate2to3.rotation} colliders={false}>
        <CuboidCollider args={[DEFLECTOR_PLATES.plate2to3.size[0] / 2, DEFLECTOR_PLATES.plate2to3.size[1] / 2, DEFLECTOR_PLATES.plate2to3.size[2] / 2]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} friction={PHYSICS.BELT_FRICTION} />
        <mesh><boxGeometry args={DEFLECTOR_PLATES.plate2to3.size} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} transparent opacity={0.6} /></mesh>
      </RigidBody>

      <Hopper /><FeedCylinder /><SortingStations />
      <CollectionBox position={COLLECTION_BOX_POSITION} color={VISUAL.COAL_BOX_COLOR} label="精煤收集箱" />
      <CollectionBox position={IMPURITY_BOX_POSITION} color={VISUAL.STONE_BOX_COLOR} label="矸石收集箱" />
      <CollectionBox position={SMALL_PARTICLE_BOX_POSITION} color={VISUAL.SMALL_BOX_COLOR} label="筛下物收集箱" />

      {Object.entries(indicators).map(([name, active]) => {
        const pos = INDICATOR_POSITIONS[name as IndicatorName];
        return name.includes('_run') && pos ? (
          <IndicatorLight key={name} position={pos} active={!!active} color={VISUAL.INDICATOR_RUN_COLOR} />
        ) : null;
      })}
      <IndicatorLight position={INDICATOR_POSITIONS.fault} active={!!indicators.fault} color={VISUAL.INDICATOR_FAULT_COLOR} />

      {(Object.entries(SENSOR_POSITIONS) as [BeltSensorName, [number, number, number]][]).map(([name, pos]) => (
        <group key={name}>
          <mesh position={pos}><sphereGeometry args={[COMPONENT.SENSOR_RADIUS, 8, 8]} /><meshStandardMaterial color={sensors[name] ? VISUAL.SENSOR_ON_COLOR : VISUAL.SENSOR_OFF_COLOR} /></mesh>
          <SceneLabel text={SENSOR_LABELS[name] || name} position={pos} offset={[0, 0.1, 0]} />
        </group>
      ))}

      {materialIds.map((id) => <BeltMaterialItem key={id} id={id} />)}
    </group>
  );
}
