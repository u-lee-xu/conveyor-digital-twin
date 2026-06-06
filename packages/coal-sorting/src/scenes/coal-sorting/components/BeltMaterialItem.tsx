import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { useBeltStore, type BeltName, PARTICLE_SIZE_MAP } from '../useBeltStore';
import {
  BELT_LENGTH, BELT_WIDTH, BELT_SURFACE_Y, BELT_LAYOUT,
  COLLECTION_BOX_POSITION, IMPURITY_BOX_POSITION, SMALL_PARTICLE_BOX_POSITION,
  MATERIAL_SIZE, VISUAL, PHYSICS,
} from '../constants';

/** 将世界坐标转换为某条皮带的局部坐标 */
function worldToLocal(pos: { x: number; y: number; z: number }, belt: BeltName): { lx: number; ly: number; lz: number } {
  const L = BELT_LAYOUT[belt];
  const dx = pos.x - L.position[0], dz = pos.z - L.position[2];
  const cos = Math.cos(-L.rotation), sin = Math.sin(-L.rotation);
  return {
    lx: dx * cos - dz * sin,
    ly: pos.y - L.position[1],
    lz: dx * sin + dz * cos,
  };
}

/** 检测世界坐标位置在哪条皮带附近，返回皮带名和局部坐标 */
function detectBelt(pos: { x: number; y: number; z: number }): { belt: BeltName; lx: number; lz: number } | null {
  for (const name of ['belt1', 'belt2', 'belt3', 'belt4'] as BeltName[]) {
    const { lx, lz } = worldToLocal(pos, name);
    const surfaceY = BELT_SURFACE_Y[name];
    if (
      Math.abs(lx) < BELT_LENGTH / 2 + PHYSICS.BELT_DETECT_X_TOLERANCE &&
      Math.abs(lz) < BELT_WIDTH / 2 + 0.05 &&
      pos.y > surfaceY - 0.05 &&
      pos.y < surfaceY + PHYSICS.BELT_DETECT_Y_TOLERANCE * 2
    ) {
      return { belt: name, lx, lz };
    }
  }
  return null;
}

/** 检测位置是否在某个箱子范围内 */
function detectBox(pos: { x: number; y: number; z: number }): 'coal' | 'stone' | 'small' | null {
  const boxes: { pos: [number, number, number]; type: 'coal' | 'stone' | 'small' }[] = [
    { pos: COLLECTION_BOX_POSITION, type: 'coal' },
    { pos: IMPURITY_BOX_POSITION, type: 'stone' },
    { pos: SMALL_PARTICLE_BOX_POSITION, type: 'small' },
  ];
  for (const box of boxes) {
    if (Math.abs(pos.x - box.pos[0]) < PHYSICS.BOX_DETECT_XZ_RANGE && Math.abs(pos.z - box.pos[2]) < PHYSICS.BOX_DETECT_XZ_RANGE && pos.y < box.pos[1] + PHYSICS.BOX_DETECT_Y_MAX_OFFSET && pos.y > box.pos[1] + PHYSICS.BOX_DETECT_Y_MIN_OFFSET) {
      return box.type;
    }
  }
  return null;
}

/** 计算物料在皮带上的目标 Y 坐标（皮带表面 + 物料半高） */
function getBeltSurfaceY(belt: BeltName, scale: number): number {
  return BELT_SURFACE_Y[belt] + (MATERIAL_SIZE * scale) / 2;
}

/** 皮带转接映射：当前皮带 → 下一条皮带 */
const NEXT_BELT: Partial<Record<BeltName, BeltName>> = {
  belt1: 'belt2',
  belt2: 'belt3',
  belt3: 'belt4',
};

export function BeltMaterialItem({ id }: { id: string }) {
  const matState = useBeltStore((s) => s.materials.find(m => m.id === id));
  const removeMaterial = useBeltStore((s) => s.removeMaterial);
  const incrementCount = useBeltStore((s) => s.incrementCount);
  const updateOnBelt = useBeltStore((s) => s.updateMaterialOnBelt);
  const setPhase = useBeltStore((s) => s.setMaterialPhase);
  const setSensor = useBeltStore((s) => s.setSensor);
  const rbRef = useRef<RapierRigidBody>(null);
  // 初始为 0（dynamic），匹配 RigidBody 默认类型；首帧会正确触发 setBodyType(2)
  const bodyTypeRef = useRef<2 | 0>(0);

  useFrame((_, delta) => {
    if (!rbRef.current || !matState) return;
    const pos = rbRef.current.translation();
    if (isNaN(pos.x)) return;

    const state = useBeltStore.getState();
    const phase = matState.phase;
    const now = Date.now();
    const elapsed = now - matState.phaseStart;
    const scale = PARTICLE_SIZE_MAP[matState.size]?.scale || 1.0;

    // ===== 入箱检测 =====
    const boxType = detectBox(pos);
    if (boxType) {
      incrementCount(boxType);
      removeMaterial(id);
      return;
    }

    // ===== 掉落回收 =====
    if (pos.y < PHYSICS.FALL_RECOVERY_Y) { removeMaterial(id); return; }

    // ===== 传感器触发检测 =====
    if (phase === 'on_belt' || phase === 'transitioning') {
      // 入口传感器
      if (matState.onBelt === 'belt1') {
        const { lx } = worldToLocal(pos, 'belt1');
        if (lx > -BELT_LENGTH / 2 && lx < -BELT_LENGTH / 2 + 0.3) {
          setSensor('s1_belt1_entry', true);
        }
        if (lx > BELT_LENGTH / 2 - 0.3) {
          setSensor('s3_belt1_exit', true);
        }
      }
      if (matState.onBelt === 'belt2') {
        const { lx } = worldToLocal(pos, 'belt2');
        if (lx < -BELT_LENGTH / 2 + 0.3) {
          setSensor('s4_belt2_entry', true);
        }
        if (lx > BELT_LENGTH / 2 - 0.3) {
          setSensor('s6_belt2_exit', true);
        }
      }
      if (matState.onBelt === 'belt3') {
        const { lx } = worldToLocal(pos, 'belt3');
        if (lx < -BELT_LENGTH / 2 + 0.3) {
          setSensor('s7_belt3_entry', true);
        }
        if (lx > BELT_LENGTH / 2 - 0.3) {
          setSensor('s9_belt3_exit', true);
        }
      }
    }

    // ===== 状态机 =====
    switch (phase) {
      case 'on_belt': {
        if (bodyTypeRef.current !== 2) {
          rbRef.current.setBodyType(2 as const, true);
          bodyTypeRef.current = 2;
          // 清除动态阶段残余速度
          rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        const onBelt = matState.onBelt;
        if (!onBelt) break;
        const beltState = state.belts?.[onBelt];
        if (!beltState?.running) break;

        const layout = BELT_LAYOUT[onBelt];
        const speed = beltState.speed * 60 * delta;
        // 运动方向：皮带局部 X 轴正方向，映射到世界坐标
        const dirX = Math.cos(layout.rotation);
        const dirZ = Math.sin(layout.rotation);

        // 计算局部坐标
        const { lx, lz } = worldToLocal(pos, onBelt);

        // V形整列侧向力（belt2 前半段）
        let lateralOffset = 0;
        if (onBelt === 'belt2' && lx > 0 && lx < 0.5) {
          lateralOffset = -lz * PHYSICS.ALIGN_LATERAL_FACTOR;
        }

        // 筛分检测：belt2 筛分区 + 小颗粒 → sieving
        if (onBelt === 'belt2' && lx < 0 && matState.size === 'small') {
          setPhase(id, 'sieving');
          break;
        }

        // 气吹检测：belt2 气吹区 + 矸石 + 分拣机激活 → blown
        if (onBelt === 'belt2' && lx > 0.6 && lx < 0.9 && matState.type === 'stone' && state.separator.active) {
          setPhase(id, 'blown');
          break;
        }

        // 到达皮带末端 → transitioning
        if (lx > BELT_LENGTH / 2 - PHYSICS.BELT_DETECT_X_TOLERANCE) {
          setPhase(id, 'transitioning');
          break;
        }

        // 正常移动：沿皮带方向 + 侧向修正，Y 锁定在皮带表面
        const targetY = getBeltSurfaceY(onBelt, scale);
        rbRef.current.setNextKinematicTranslation({
          x: pos.x + dirX * speed + dirZ * lateralOffset,
          y: targetY,
          z: pos.z + dirZ * speed - dirX * lateralOffset,
        });
        break;
      }
      case 'transitioning': {
        // 刚从 kinematic 切换到 dynamic 时，赋予抛出速度
        if (bodyTypeRef.current !== 0) {
          rbRef.current.setBodyType(0 as const, true);
          bodyTypeRef.current = 0;
          const prevBelt = matState.onBelt;
          const nextBelt = prevBelt ? NEXT_BELT[prevBelt] : undefined;
          if (prevBelt && nextBelt) {
            const layout = BELT_LAYOUT[prevBelt];
            const nextLayout = BELT_LAYOUT[nextBelt];
            // 皮带运行方向速度（加强，确保能离开皮带表面）
            const beltSpeed = (state.belts?.[prevBelt]?.speed || 0.008) * 60;
            const dirX = Math.cos(layout.rotation);
            const dirZ = Math.sin(layout.rotation);
            // 朝向下一条皮带入口的速度分量
            const toNextX = nextLayout.position[0] - pos.x;
            const toNextZ = nextLayout.position[2] - pos.z;
            const toNextDist = Math.sqrt(toNextX * toNextX + toNextZ * toNextZ) || 1;
            rbRef.current.setLinvel({
              x: dirX * beltSpeed * 3 + (toNextX / toNextDist) * 1.5,
              y: 1.5, // 向上抛出，离开皮带表面
              z: dirZ * beltSpeed * 3 + (toNextZ / toNextDist) * 1.5,
            }, true);
          }
        }
        const detected = detectBelt(pos);
        if (detected && detected.belt !== matState.onBelt) {
          updateOnBelt(id, detected.belt);
          setPhase(id, 'on_belt');
          break;
        }
        // 重新落回同一条皮带 — 仅当不在末端时才切回 on_belt，避免末端循环
        if (detected && detected.belt === matState.onBelt && detected.lx < BELT_LENGTH / 2 - 0.1) {
          setPhase(id, 'on_belt');
          break;
        }
        if (elapsed > PHYSICS.TRANSITION_TIMEOUT) { removeMaterial(id); }
        break;
      }
      case 'sieving': {
        if (bodyTypeRef.current !== 0) { rbRef.current.setBodyType(0 as const, true); bodyTypeRef.current = 0; }
        rbRef.current.applyImpulse({
          x: (Math.random() - 0.5) * PHYSICS.SIEVE_IMPULSE_XY,
          y: PHYSICS.SIEVE_IMPULSE_Y_BASE + Math.random() * PHYSICS.SIEVE_IMPULSE_XY,
          z: (Math.random() - 0.5) * PHYSICS.SIEVE_IMPULSE_XY,
        }, true);
        const detected = detectBelt(pos);
        if (detected && detected.belt === 'belt4') {
          updateOnBelt(id, 'belt4');
          setPhase(id, 'on_belt');
          break;
        }
        if (elapsed > PHYSICS.SIEVING_TIMEOUT) {
          const b4 = BELT_LAYOUT.belt4;
          rbRef.current.setTranslation({ x: b4.position[0], y: getBeltSurfaceY('belt4', scale), z: b4.position[2] }, true);
          rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          updateOnBelt(id, 'belt4');
          setPhase(id, 'on_belt');
        }
        break;
      }
      case 'blown': {
        if (bodyTypeRef.current !== 0) { rbRef.current.setBodyType(0 as const, true); bodyTypeRef.current = 0; }
        if (elapsed < PHYSICS.BLOWN_IMPULSE_DURATION) {
          // 喷吹方向：垂直于 belt2 运行方向（belt2 沿 Z 轴，喷吹沿 -X 方向）
          rbRef.current.applyImpulse({ x: PHYSICS.BLOWN_IMPULSE_X, y: PHYSICS.BLOWN_IMPULSE_Y, z: 0 }, true);
        }
        if (elapsed > PHYSICS.BLOWN_TIMEOUT) { removeMaterial(id); }
        break;
      }
      case 'in_box': {
        removeMaterial(id);
        break;
      }
    }
  });

  if (!matState) return null;
  const scale = PARTICLE_SIZE_MAP[matState.size]?.scale || 1.0;
  const halfSize = (MATERIAL_SIZE * scale) / 2;
  const matDensity = (matState.mass || 0.5) / (MATERIAL_SIZE * scale) ** 3;

  return (
    <RigidBody ref={rbRef} position={matState.position} colliders={false}
      collisionGroups={PHYSICS.MAT_COLLISION_GROUP}
    >
      <CuboidCollider args={[halfSize, halfSize, halfSize]}
        collisionGroups={PHYSICS.MAT_COLLISION_GROUP}
        density={matDensity}
        friction={matState.friction || PHYSICS.MAT_DEFAULT_FRICTION}
        restitution={PHYSICS.MAT_RESTITUTION}
      />
      <mesh scale={scale}>
        <boxGeometry args={[MATERIAL_SIZE, MATERIAL_SIZE, MATERIAL_SIZE]} />
        <meshStandardMaterial color={matState.type === 'coal' ? VISUAL.COAL_COLOR : VISUAL.STONE_COLOR} />
      </mesh>
    </RigidBody>
  );
}
