import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useBeltStore, type BeltName } from '../useBeltStore';
import { SceneLabel } from './SceneLabel';
import {
  BELT_LENGTH, BELT_WIDTH, BELT_THICKNESS, BELT_LAYOUT,
  TAIL_DRUM_R, HEAD_DRUM_R, BEAM_SECTION,
  VISUAL, COMPONENT, PHYSICS,
} from '../constants';

// ===== 皮带名称映射 =====
const BELT_LABELS: Record<BeltName, string> = {
  belt1: '1# 给料皮带',
  belt2: '2# 筛分皮带',
  belt3: '3# 精选皮带',
  belt4: '4# 筛下物皮带',
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

function BeltEnds({ beltRunning }: { beltRunning: boolean }) {
  const drumLen = BELT_WIDTH + 0.06;
  return (
    <group>
      <mesh position={[-BELT_LENGTH / 2, TAIL_DRUM_R, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[TAIL_DRUM_R, TAIL_DRUM_R, drumLen, 12]} /><meshStandardMaterial color={VISUAL.ROLLER_COLOR} /></mesh>
      <mesh position={[BELT_LENGTH / 2, HEAD_DRUM_R, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[HEAD_DRUM_R, HEAD_DRUM_R, drumLen, 12]} /><meshStandardMaterial color={VISUAL.ROLLER_COLOR} /></mesh>
      <group position={[BELT_LENGTH / 2, HEAD_DRUM_R, BELT_WIDTH / 2 + 0.12]}>
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

  return (
    <group position={layout.position} rotation={[0, layout.rotation, 0]}>
      <RigidBody type="fixed" position={[0, TAIL_DRUM_R + BELT_THICKNESS, 0]} colliders={false}>
        {isSieving ? (
          <>
            <CuboidCollider args={[BELT_LENGTH / 4, 0.03, 0.05]} position={[-BELT_LENGTH / 4, 0, -BELT_WIDTH / 2 + 0.05]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
            <CuboidCollider args={[BELT_LENGTH / 4, 0.03, 0.05]} position={[-BELT_LENGTH / 4, 0, BELT_WIDTH / 2 - 0.05]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
            <CuboidCollider args={[BELT_LENGTH / 4, 0.03, BELT_WIDTH / 2]} position={[BELT_LENGTH / 4, 0, 0]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
          </>
        ) : (
          <CuboidCollider args={[BELT_LENGTH / 2, 0.03, BELT_WIDTH / 2]} friction={PHYSICS.BELT_FRICTION} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
        )}
        {/* 侧挡板碰撞体 — 防止物料从侧面滑落 */}
        <CuboidCollider args={[BELT_LENGTH / 2, 0.05, 0.01]} position={[0, 0.08, -BELT_WIDTH / 2 - 0.005]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
        <CuboidCollider args={[BELT_LENGTH / 2, 0.05, 0.01]} position={[0, 0.08, BELT_WIDTH / 2 + 0.005]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
      </RigidBody>
      <mesh position={[0, 0, -BELT_WIDTH / 2 - 0.03]}><boxGeometry args={[BELT_LENGTH + 0.1, BEAM_SECTION, BEAM_SECTION]} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} /></mesh>
      <mesh position={[0, 0, BELT_WIDTH / 2 + 0.03]}><boxGeometry args={[BELT_LENGTH + 0.1, BEAM_SECTION, BEAM_SECTION]} /><meshStandardMaterial color={VISUAL.FRAME_COLOR} /></mesh>
      <BeltEnds beltRunning={beltRunning} />
      <mesh position={[0, TAIL_DRUM_R + BELT_THICKNESS, 0]}>
        <boxGeometry args={[BELT_LENGTH, BELT_THICKNESS, BELT_WIDTH]} />
        <meshStandardMaterial color={beltRunning ? (isSieving ? VISUAL.BELT_SIEVE : VISUAL.BELT_RUN) : VISUAL.BELT_STOP} transparent={isSieving} opacity={isSieving ? VISUAL.BELT_SIEVE_OPACITY : 1} />
      </mesh>
      <SceneLabel text={BELT_LABELS[beltName]} position={[0, HEAD_DRUM_R + 0.15, 0]} offset={[0, 0.1, 0]} />
    </group>
  );
}
