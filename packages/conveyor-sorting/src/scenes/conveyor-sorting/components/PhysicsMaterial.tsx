import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { type CylinderName } from '../../../types/device';
import {
  CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX,
  CYLINDER_POSITIONS, CYLINDER_RETRACT_POS, SENSOR_POSITIONS,
  COMPONENT, PHYSICS, SORT_CHUTE, type SortSlot,
} from '../constants';
import { readCylinderExtensions } from '../cylinderKinematics';
import { getPushedMaterialZ } from './helpers';
import { sortChutePoint, isAtChuteEntry } from '../sortChute';

const COLLIDERS_ONLY = false;

type MaterialPhase = 'free' | 'pushing' | 'sliding' | 'settled';
type Vec = { x: number; y: number; z: number };

const CYLINDER_ENTRIES: { name: CylinderName; cylinderZ: number; x: number; y: number }[] = [
  { name: 'feed', cylinderZ: CYLINDER_POSITIONS.feed[2], x: CYLINDER_POSITIONS.feed[0], y: CYLINDER_POSITIONS.feed[1] },
  { name: 'sorting1', cylinderZ: CYLINDER_POSITIONS.sorting1[2], x: CYLINDER_POSITIONS.sorting1[0], y: CYLINDER_POSITIONS.sorting1[1] },
  { name: 'sorting2', cylinderZ: CYLINDER_POSITIONS.sorting2[2], x: CYLINDER_POSITIONS.sorting2[0], y: CYLINDER_POSITIONS.sorting2[1] },
];

const SENSOR_ENTRIES = [
  { name: 'feed' as const, pos: SENSOR_POSITIONS.feed },
  { name: 'color' as const, pos: SENSOR_POSITIONS.color },
  { name: 'material' as const, pos: SENSOR_POSITIONS.material },
];

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

/**
 * 在途工件。
 *
 * 穿模修复：不再靠 kinematic 推板去「撞」dynamic 工件，也不再用两个
 * useFrame 各算各的行程。推板与工件都读 cylinderKinematics 的同一份快照，
 * 工件中心严格等于「推板中心 − FOLLOW_GAP」，间隙由两个半厚推导，
 * 因此推板永远追不上、更不会插进工件。
 *
 * 推出带面后进入 sliding → settled：沿 sortChute.ts 的轨迹滑进收集盒，
 * 停留 SETTLE_SECONDS 再计入 sortedItems 并清理刚体，替代旧版
 * 「z < -0.30 立刻消失」。
 */
export function PhysicsMaterial() {
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const materialColor = useDeviceStore((s) => s.material.color);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);
  const isKinematicRef = useRef(false);

  const phaseRef = useRef<MaterialPhase>('free');
  const slideElapsedRef = useRef(0);
  const settleElapsedRef = useRef(0);
  const slotRef = useRef<SortSlot>('sorting1');
  const slideStartXRef = useRef(0);

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
      phaseRef.current = 'free';
      slideElapsedRef.current = 0;
      settleElapsedRef.current = 0;
    }
    lastVisible.current = materialVisible;
  }, [materialVisible]);

  useFrame((_, delta) => {
    const body = rigidBodyRef.current;
    if (!body || !materialVisible) return;

    const pos = body.translation();
    const state = useDeviceStore.getState();
    const extensions = readCylinderExtensions();

    let next: Vec = { x: pos.x, y: pos.y, z: pos.z };
    let kinematic = true;

    if (phaseRef.current === 'sliding') {
      slideElapsedRef.current += delta;
      const t = Math.min(1, slideElapsedRef.current / SORT_CHUTE.SLIDE_SECONDS);
      const [x, y, z] = sortChutePoint(slotRef.current, t);
      // 手动模式下工件 X 可能偏离分拣位，滑落时平滑归位而不是瞬移
      const blend = Math.min(1, t * 2.5);
      next = { x: slideStartXRef.current + (x - slideStartXRef.current) * blend, y, z };
      if (t >= 1) {
        phaseRef.current = 'settled';
        settleElapsedRef.current = 0;
      }
    } else if (phaseRef.current === 'settled') {
      settleElapsedRef.current += delta;
      const [x, y, z] = sortChutePoint(slotRef.current, 1);
      next = { x, y, z };
      if (settleElapsedRef.current >= SORT_CHUTE.SETTLE_SECONDS) {
        state.addSortedItem(slotRef.current, state.material.color);
        state.clearMaterial();
        phaseRef.current = 'free';
        return;
      }
    } else {
      // 任一气缸正在伸出且工件在其作用范围内：工件改为严格跟随推板。
      // 旧版这里额外要求 !isOnConveyor，结果分拣气缸根本不接管带上的工件，
      // 只能靠 kinematic 推板去撞 dynamic 工件 —— 这正是偶发穿模的来源。
      let pushing: (typeof CYLINDER_ENTRIES)[number] | null = null;
      for (const cyl of CYLINDER_ENTRIES) {
        if (!state.cylinders[cyl.name].extended) continue;
        const ext = extensions[cyl.name];
        if (ext <= CYLINDER_RETRACT_POS + 0.02) continue;
        if (
          Math.abs(pos.x - cyl.x) < PHYSICS.PUSH_DETECT_RANGE_X
          && Math.abs(pos.y - cyl.y) < PHYSICS.PUSH_DETECT_RANGE_Y
        ) {
          pushing = cyl;
          break;
        }
      }

      if (pushing) {
        phaseRef.current = 'pushing';
        const materialZ = getPushedMaterialZ(pushing.cylinderZ, extensions[pushing.name]);
        // 单向跟随：推板缩回时不把工件拉回 +Z
        const z = Math.min(pos.z, materialZ);
        next = { x: pos.x, y: pos.y, z };

        if (pushing.name !== 'feed' && isAtChuteEntry(z)) {
          slotRef.current = pushing.name as SortSlot;
          phaseRef.current = 'sliding';
          slideElapsedRef.current = 0;
          slideStartXRef.current = pos.x;
          const [, sy, sz] = sortChutePoint(slotRef.current, 0);
          next = { x: pos.x, y: sy, z: sz };
        }
      } else {
        phaseRef.current = 'free';
        const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX
          && pos.x >= -COMPONENT.CONVEYOR_LENGTH / 2 && pos.x <= COMPONENT.CONVEYOR_LENGTH / 2;

        if (isOnConveyor && state.conveyorRunning) {
          next = { x: pos.x + CONVEYOR_SPEED * 60 * delta, y: pos.y, z: pos.z };
        } else {
          kinematic = false;
        }
      }
    }

    if (kinematic) {
      if (!isKinematicRef.current) {
        body.setBodyType(2 as const, true);
        isKinematicRef.current = true;
      }
      body.setNextKinematicTranslation(next);
    } else if (isKinematicRef.current) {
      body.setBodyType(0 as const, true);
      isKinematicRef.current = false;
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }

    // 兜底：走完传送带仍未分拣 / 掉出世界才清理，不再因 z < -0.30 瞬间消失
    if (next.x > CONVEYOR_END_X || next.y < PHYSICS.FALL_RECOVERY_Y) {
      state.clearMaterial();
      phaseRef.current = 'free';
      return;
    }

    for (const sen of SENSOR_ENTRIES) {
      const inRange = Math.abs(next.x - sen.pos[0]) < PHYSICS.SENSOR_DETECT_RANGE_X
        && Math.abs(next.z - sen.pos[2]) < PHYSICS.SENSOR_DETECT_RANGE_Z;
      if (sen.name === 'color') {
        state.setSensor('color', inRange && state.material.color === 'black');
      } else {
        state.setSensor(sen.name, inRange);
      }
    }

    state.updateMaterialPosition([next.x, next.y, next.z]);
  });

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
      <DebugBox args={[COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE, COMPONENT.MATERIAL_HALF_SIZE]} color="#3b82f6" opacity={0.5} />
      <group visible={!COLLIDERS_ONLY}>
        <mesh
          geometry={geometries.material}
          material={materialColor === 'blue' ? materials.materialBlue : materials.materialBlack}
        />
      </group>
    </RigidBody>
  );
}
