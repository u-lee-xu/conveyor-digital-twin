import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useBeltStore, type BeltName } from '../useBeltStore';
import { SceneLabel } from './SceneLabel';
import {
  BELT_WIDTH, BELT_THICKNESS, BELT_LAYOUT,
  TAIL_DRUM_R, HEAD_DRUM_R, BEAM_SECTION,
  VISUAL, COMPONENT, PHYSICS, getBeltLength,
} from '../constants';

// ===== 皮带名称映射 =====
const BELT_LABELS: Record<BeltName, string> = {
  belt1: '1# 给料皮带',
  belt2: '2# 筛分皮带',
  belt3: '3# 筛下小料皮带',
  belt4: '4# 大料收集皮带',
};

export function IndicatorLight({ position, active, color }: { position: [number, number, number]; active: boolean; color: number }) {
  if (!position) return null;
  return (
    <group position={position}>
      <mesh><cylinderGeometry args={[COMPONENT.INDICATOR_BASE_RADIUS, COMPONENT.INDICATOR_BASE_RADIUS, COMPONENT.INDICATOR_BASE_HEIGHT, 16]} /><meshStandardMaterial color={VISUAL.INDICATOR_HOUSING} /></mesh>
      <mesh position={[0, COMPONENT.INDICATOR_BULB_OFFSET_Y, 0]}><sphereGeometry args={[COMPONENT.INDICATOR_BULB_RADIUS, 16, 16]} /><meshStandardMaterial color={active ? color : VISUAL.INDICATOR_OFF} emissive={active ? color : 0} emissiveIntensity={VISUAL.INDICATOR_EMISSIVE_INTENSITY} /></mesh>
    </group>
  );
}

function BeltEnds({ beltName, beltRunning }: { beltName: BeltName; beltRunning: boolean }) {
  const drumLen = BELT_WIDTH + 0.06;
  const length = getBeltLength(beltName);
  return (
    <group>
      <mesh position={[-length / 2, TAIL_DRUM_R, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[TAIL_DRUM_R, TAIL_DRUM_R, drumLen, 12]} /><meshStandardMaterial color={VISUAL.ROLLER_COLOR} /></mesh>
      <mesh position={[length / 2, HEAD_DRUM_R, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[HEAD_DRUM_R, HEAD_DRUM_R, drumLen, 12]} /><meshStandardMaterial color={VISUAL.ROLLER_COLOR} /></mesh>
      <group position={[length / 2, HEAD_DRUM_R, BELT_WIDTH / 2 + 0.12]}>
        <mesh><boxGeometry args={[...COMPONENT.MOTOR_HOUSING_SIZE]} /><meshStandardMaterial color={VISUAL.MOTOR_HOUSING_COLOR} /></mesh>
        <mesh position={[COMPONENT.MOTOR_BODY_OFFSET_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[COMPONENT.MOTOR_BODY_RADIUS, COMPONENT.MOTOR_BODY_RADIUS, COMPONENT.MOTOR_BODY_LENGTH]} /><meshStandardMaterial color={beltRunning ? VISUAL.MOTOR_COLOR : VISUAL.MOTOR_HOUSING_COLOR} emissive={beltRunning ? VISUAL.MOTOR_COLOR : 0} emissiveIntensity={VISUAL.MOTOR_EMISSIVE_INTENSITY} /></mesh>
      </group>
    </group>
  );
}

export function BeltConveyor({ beltName }: { beltName: BeltName }) {
  const beltRunning = useBeltStore((s) => s.belts?.[beltName]?.running || false);
  const layout = BELT_LAYOUT[beltName];
  if (!layout) return null;
  const isSieving = beltName === 'belt2';
  const length = getBeltLength(beltName);

  return (
    <group position={layout.position} rotation={[0, layout.rotation, 0]}>
      <RigidBody type="fixed" position={[0, TAIL_DRUM_R + BELT_THICKNESS, 0]} colliders={false}>
        {isSieving ? (
          <>
            {/* 2# 筛分皮带：仅入口段承接来料（实板），中后段为筛孔带（无碰撞体，小料漏下） */}
            <CuboidCollider args={[PHYSICS.SIEVE_ENTRY_ZONE_HALF, 0.03, BELT_WIDTH / 2]} position={[-PHYSICS.SIEVE_ENTRY_ZONE_CENTER, 0, 0]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
          </>
        ) : (
          <CuboidCollider args={[length / 2, 0.03, BELT_WIDTH / 2]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
        )}
        {/* 侧挡板碰撞体 — 仅入口段设置，防止来料从侧面滑落 */}
        <CuboidCollider args={[length / 2, 0.05, 0.01]} position={[0, 0.08, -BELT_WIDTH / 2 - 0.005]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
        <CuboidCollider args={[length / 2, 0.05, 0.01]} position={[0, 0.08, BELT_WIDTH / 2 + 0.005]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
      </RigidBody>
      <mesh position={[0, 0, -BELT_WIDTH / 2 - 0.03]}><boxGeometry args={[length + 0.1, BEAM_SECTION, BEAM_SECTION]} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} /></mesh>
      <mesh position={[0, 0, BELT_WIDTH / 2 + 0.03]}><boxGeometry args={[length + 0.1, BEAM_SECTION, BEAM_SECTION]} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} /></mesh>
      <BeltEnds beltName={beltName} beltRunning={beltRunning} />
      <mesh position={[0, TAIL_DRUM_R + BELT_THICKNESS, 0]}>
        <boxGeometry args={[length, BELT_THICKNESS, BELT_WIDTH]} />
        <meshStandardMaterial color={beltRunning ? (isSieving ? VISUAL.BELT_SIEVE : VISUAL.BELT_RUN) : VISUAL.BELT_STOP} transparent={isSieving} opacity={isSieving ? VISUAL.BELT_SIEVE_OPACITY : 1} />
      </mesh>
      <SceneLabel text={BELT_LABELS[beltName]} position={[0, HEAD_DRUM_R + 0.15, 0]} offset={[0, 0.1, 0]} />
    </group>
  );
}
