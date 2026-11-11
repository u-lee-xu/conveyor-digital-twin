import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, Quaternion } from 'three';
import { useDeviceStore } from '../../../stores';
import { useVfdStore } from '../../../stores/useVfdStore';
import { geometries, materials } from '../../../components/scene/shared';
import { type CylinderName } from '../../../types/device';
import {
  CONVEYOR_SPEED, CONVEYOR_END_X, CONVEYOR_Z_MIN, CONVEYOR_Z_MAX,
  CYLINDER_POSITIONS, CYLINDER_RETRACT_POS, SENSOR_POSITIONS,
  COMPONENT, PHYSICS, SORT_CHUTE, type SortSlot,
} from '../constants';
import { readCylinderExtensions } from '../cylinderKinematics';
import { getPushedMaterialZ } from './helpers';
import {
  chuteCenterAt, slideStartCenter, isAtChuteEntry, isChuteEndReached, chuteClearance,
  CHUTE_QUATERNION, CHUTE_TANGENT, CHUTE_END_CENTER_Z,
  BIN_CENTER_Z, BIN_REST_Y, sortSlotX,
} from '../sortChute';
import { readMaterialSlideDebug, writeMaterialSlideDebug } from '../materialSlideDebug';

const COLLIDERS_ONLY = false;

type MaterialPhase = 'free' | 'pushing' | 'aligning' | 'sliding' | 'dropping' | 'settled';
type Drive = 'kinematic' | 'dynamic-free' | 'physics';
type Vec = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
const SLOPE: Quat = {
  x: CHUTE_QUATERNION[0], y: CHUTE_QUATERNION[1],
  z: CHUTE_QUATERNION[2], w: CHUTE_QUATERNION[3],
};

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** 姿态从斜坡姿态平滑回正（落盒时工件自然放平） */
function levelRotation(from: Quat, t: number): Quat {
  const q = new Quaternion(from.x, from.y, from.z, from.w);
  q.slerp(new Quaternion(0, 0, 0, 1), Math.max(0, Math.min(1, t)));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

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
 * 推料段：推板与工件都读 cylinderKinematics 的同一份快照，工件中心严格等于
 * 「推板中心 − FOLLOW_GAP」，因此推板永远追不上、更不会插进工件。
 *
 * 滑落段（本次改造）：**交给 Rapier 真实物理**。工件切成 dynamic 刚体，
 * 以与斜槽面平行的姿态入场、带沿下坡切线的初速度，重力 / 摩擦 / 槽面与
 * 挡边的静态碰撞体共同决定下滑过程。因此底面始终贴着斜面、会随坡度倾斜，
 * 不再像旧版脚本平移那样「方块平放 + 斜槽倾斜」啃进底板。
 *
 * 落盒段：物理到底后切回 kinematic 做短插值并停留，再计入 sortedItems。
 * 保留这段确定性收尾是为了让演示/评分状态机一定能闭环（物理抖动不会卡死流程），
 * 另有 SLIDE_MAX_SECONDS 看门狗兜底。
 */
export function PhysicsMaterial() {
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const materialColor = useDeviceStore((s) => s.material.color);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastVisible = useRef(false);
  const isKinematicRef = useRef(false);

  const phaseRef = useRef<MaterialPhase>('free');
  const slideElapsedRef = useRef(0);
  const dropElapsedRef = useRef(0);
  const settleElapsedRef = useRef(0);
  const slotRef = useRef<SortSlot>('sorting1');
  const alignStartXRef = useRef(0);
  const releasedRef = useRef(false);
  const dropFromRef = useRef<Vec>({ x: 0, y: 0, z: 0 });
  const dropFromRotRef = useRef<Quat>(IDENTITY);
  const releasesRef = useRef(0);

  useEffect(() => {
    if (rigidBodyRef.current && materialVisible && !lastVisible.current) {
      const spawnPos = useDeviceStore.getState().material.position;
      const body = rigidBodyRef.current;
      body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);
      body.setRotation(IDENTITY, true);
      // 上一次滑落锁定过角自由度，新工件要恢复完整刚体
      body.setEnabledRotations(true, true, true, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (isKinematicRef.current) {
        body.setBodyType(0 as const, true);
        isKinematicRef.current = false;
      }
      phaseRef.current = 'free';
      releasedRef.current = false;
      slideElapsedRef.current = 0;
      dropElapsedRef.current = 0;
      settleElapsedRef.current = 0;
      writeMaterialSlideDebug({ phase: 'free', rotation: [0, 0, 0, 1] });
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
    let nextRot: Quat = IDENTITY;
    let drive: Drive = 'kinematic';
    let reported: Vec = next;

    if (phaseRef.current === 'aligning') {
      // 入槽前的极短 kinematic 段：把可能偏离的 X 平滑归位到槽位中心，
      // 同时把姿态转到与槽面平行，避免释放瞬间撞上引导挡板。
      slideElapsedRef.current += delta;
      const a = Math.min(1, slideElapsedRef.current / SORT_CHUTE.SLIDE_ALIGN_SECONDS);
      const [, ey, ez] = chuteCenterAt(slotRef.current, SORT_CHUTE.ENTRY_Z);
      next = {
        x: lerp(alignStartXRef.current, sortSlotX(slotRef.current), smooth(a)),
        y: ey,
        z: ez,
      };
      nextRot = SLOPE;
      drive = 'kinematic';
      reported = next;
      if (a >= 1) {
        phaseRef.current = 'sliding';
        slideElapsedRef.current = 0;
        releasedRef.current = false;
      }
    } else if (phaseRef.current === 'sliding') {
      if (!releasedRef.current) {
        // 真正把工件交给物理引擎：dynamic + 斜面姿态 + 沿坡初速度
        if (isKinematicRef.current) {
          body.setBodyType(0 as const, true);
          isKinematicRef.current = false;
        }
        const [, ey, ez] = slideStartCenter(slotRef.current);
        body.setTranslation({ x: sortSlotX(slotRef.current), y: ey, z: ez }, true);
        body.setRotation(SLOPE, true);
        // 只锁角自由度、不锁平移：重力 / 摩擦 / 槽面接触仍完全由 Rapier 求解，
        // 但方块不会在斜坡上被摩擦带得翻滚，底面始终与槽面平行。
        body.setEnabledRotations(false, false, false, true);
        body.setAdditionalSolverIterations(8);
        body.setLinvel({
          x: 0,
          y: CHUTE_TANGENT[1] * SORT_CHUTE.SLIDE_LAUNCH_SPEED,
          z: CHUTE_TANGENT[2] * SORT_CHUTE.SLIDE_LAUNCH_SPEED,
        }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        releasedRef.current = true;
        releasesRef.current += 1;
        writeMaterialSlideDebug({
          releases: releasesRef.current,
          minSlideClearance: Number.POSITIVE_INFINITY,
          minSlideClearanceZ: 0,
        });
      }

      drive = 'physics';
      reported = { x: pos.x, y: pos.y, z: pos.z };
      slideElapsedRef.current += delta;
      // 逐帧量化「工件底面到槽面的净空」：只统计还压在槽板上的帧，
      // 越过槽尾之后是自由落盒，斜面方程外推会把正常下落误判成穿模。
      const stillOnPlate = pos.z > CHUTE_END_CENTER_Z - 0.01;
      const clearance = chuteClearance(pos, body.rotation());
      if (stillOnPlate && Number.isFinite(clearance)) {
        const prevMin = readMaterialSlideDebug().minSlideClearance;
        if (clearance < prevMin) {
          writeMaterialSlideDebug({ minSlideClearance: clearance, minSlideClearanceZ: pos.z });
        }
      }

      const reachedEnd = isChuteEndReached(pos);
      const timedOut = slideElapsedRef.current >= SORT_CHUTE.SLIDE_MAX_SECONDS;
      if (reachedEnd || timedOut || pos.y < SORT_CHUTE.BIN_FLOOR_Y) {
        const rot = body.rotation();
        dropFromRef.current = { x: pos.x, y: pos.y, z: pos.z };
        dropFromRotRef.current = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
        dropElapsedRef.current = 0;
        phaseRef.current = 'dropping';
        writeMaterialSlideDebug({
          lastSlideSeconds: slideElapsedRef.current,
          lastSlideRotation: [rot.x, rot.y, rot.z, rot.w],
          lastSlideDynamic: !isKinematicRef.current,
          lastSlideMinClearance: readMaterialSlideDebug().minSlideClearance,
          lastSlideMinClearanceZ: readMaterialSlideDebug().minSlideClearanceZ,
          lastSlideReason: timedOut ? 'timeout' : 'reached-end',
        });
      }
    } else if (phaseRef.current === 'dropping') {
      // 槽尾 → 盒内：切回 kinematic 做短插值，姿态同时回正，保证状态机闭环
      dropElapsedRef.current += delta;
      const t = Math.min(1, dropElapsedRef.current / SORT_CHUTE.DROP_SECONDS);
      const a = smooth(t);
      const from = dropFromRef.current;
      next = {
        x: lerp(from.x, sortSlotX(slotRef.current), a),
        y: lerp(from.y, BIN_REST_Y, a),
        z: lerp(from.z, BIN_CENTER_Z, a),
      };
      nextRot = levelRotation(dropFromRotRef.current, a);
      drive = 'kinematic';
      reported = next;
      if (t >= 1) {
        phaseRef.current = 'settled';
        settleElapsedRef.current = 0;
      }
    } else if (phaseRef.current === 'settled') {
      settleElapsedRef.current += delta;
      next = { x: sortSlotX(slotRef.current), y: BIN_REST_Y, z: BIN_CENTER_Z };
      nextRot = IDENTITY;
      drive = 'kinematic';
      reported = next;
      if (settleElapsedRef.current >= SORT_CHUTE.SETTLE_SECONDS) {
        state.addSortedItem(slotRef.current, state.material.color);
        state.clearMaterial();
        phaseRef.current = 'free';
        writeMaterialSlideDebug({ phase: 'free', rotation: [0, 0, 0, 1] });
        return;
      }
    } else {
      // 任一气缸正在伸出且工件在其作用范围内：工件严格跟随推板。
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
        nextRot = IDENTITY;
        drive = 'kinematic';
        reported = next;

        if (pushing.name !== 'feed' && isAtChuteEntry(z)) {
          slotRef.current = pushing.name as SortSlot;
          phaseRef.current = 'aligning';
          slideElapsedRef.current = 0;
          releasedRef.current = false;
          alignStartXRef.current = pos.x;
          const [, ey, ez] = chuteCenterAt(slotRef.current, SORT_CHUTE.ENTRY_Z);
          next = { x: pos.x, y: ey, z: ez };
          nextRot = SLOPE;
          reported = next;
          // kinematic 的 nextRotation 要到下一物理步才生效，这里直接落位，
          // 保证入槽第一帧就是与槽面平行的姿态。
          body.setRotation(SLOPE, true);
        }
      } else {
        phaseRef.current = 'free';
        const isOnConveyor = pos.z >= CONVEYOR_Z_MIN && pos.z <= CONVEYOR_Z_MAX
          && pos.x >= -COMPONENT.CONVEYOR_LENGTH / 2 && pos.x <= COMPONENT.CONVEYOR_LENGTH / 2;

        if (isOnConveyor && state.conveyorRunning) {
          // 变频器输出频率只作为带速倍率，启停仍由 conveyorRunning / PLC 线圈唯一决定
          next = { x: pos.x + CONVEYOR_SPEED * useVfdStore.getState().speedFactor() * 60 * delta, y: pos.y, z: pos.z };
          nextRot = IDENTITY;
          drive = 'kinematic';
          reported = next;
        } else {
          drive = 'dynamic-free';
          reported = { x: pos.x, y: pos.y, z: pos.z };
        }
      }
    }

    if (drive === 'kinematic') {
      if (!isKinematicRef.current) {
        body.setBodyType(2 as const, true);
        isKinematicRef.current = true;
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.setNextKinematicTranslation(next);
      body.setNextKinematicRotation(nextRot);
    } else if (drive === 'dynamic-free') {
      if (isKinematicRef.current) {
        body.setBodyType(0 as const, true);
        isKinematicRef.current = false;
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setRotation(IDENTITY, true);
      }
    }
    // drive === 'physics'：Rapier 自己积分，这一帧不碰刚体

    // 兜底：走完传送带仍未分拣 / 掉出世界才清理
    if (reported.x > CONVEYOR_END_X || reported.y < PHYSICS.FALL_RECOVERY_Y) {
      state.clearMaterial();
      phaseRef.current = 'free';
      writeMaterialSlideDebug({ phase: 'free' });
      return;
    }

    for (const sen of SENSOR_ENTRIES) {
      const inRange = Math.abs(reported.x - sen.pos[0]) < PHYSICS.SENSOR_DETECT_RANGE_X
        && Math.abs(reported.z - sen.pos[2]) < PHYSICS.SENSOR_DETECT_RANGE_Z;
      if (sen.name === 'color') {
        state.setSensor('color', inRange && state.material.color === 'black');
      } else {
        state.setSensor(sen.name, inRange);
      }
    }

    const rot = body.rotation();
    writeMaterialSlideDebug({
      phase: phaseRef.current,
      dynamic: !isKinematicRef.current,
      rotation: [rot.x, rot.y, rot.z, rot.w],
    });
    state.updateMaterialPosition([reported.x, reported.y, reported.z]);
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
