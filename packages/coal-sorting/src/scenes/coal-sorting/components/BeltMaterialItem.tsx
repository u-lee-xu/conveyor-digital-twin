import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { useBeltStore, type BeltName, PARTICLE_SIZE_MAP } from '../useBeltStore';
import {
  BELT_SURFACE_Y, BELT_LAYOUT, getBeltLength,
  COLLECTION_BOX_POSITION, SMALL_PARTICLE_BOX_POSITION,
  MATERIAL_SIZE, VISUAL, PHYSICS,
} from '../constants';
import { worldToLocal, detectBelt } from './helpers';
import { registerMaterialPos, unregisterMaterialPos } from '../materialRegistry';

/** 检测位置是否在某个收集容器范围内 */
const BOX_DETECTORS: { pos: [number, number, number]; kind: 'small' | 'large' }[] = [
  { pos: COLLECTION_BOX_POSITION, kind: 'large' },
  { pos: SMALL_PARTICLE_BOX_POSITION, kind: 'small' },
];

/** 大料框接收 medium/large，小料箱只接收 small */
function detectBox(pos: { x: number; y: number; z: number }): 'small' | 'large' | null {
  for (const box of BOX_DETECTORS) {
    if (Math.abs(pos.x - box.pos[0]) < PHYSICS.BOX_DETECT_XZ_RANGE && Math.abs(pos.z - box.pos[2]) < PHYSICS.BOX_DETECT_XZ_RANGE && pos.y < box.pos[1] + PHYSICS.BOX_DETECT_Y_MAX_OFFSET && pos.y > box.pos[1] + PHYSICS.BOX_DETECT_Y_MIN_OFFSET) {
      return box.kind;
    }
  }
  return null;
}

/** 计算物料在皮带上的目标 Y 坐标（皮带表面 + 物料半高） */
function getBeltSurfaceY(belt: BeltName, scale: number): number {
  return BELT_SURFACE_Y[belt] + (MATERIAL_SIZE * scale) / 2;
}

/**
 * 皮带转接滑出速度（世界坐标，m/s）
 * 带面与端滚筒上边缘持平，物料沿水平方向自然滑出（无上抛，不跳起）
 */
const THROW_SPEEDS: Partial<Record<BeltName, [number, number, number]>> = {
  belt1: [0.6, 0, -0.55], // belt1 → belt2 筛分皮带入口
  belt2: [0.15, 0, 0.4],  // belt2 → belt4 大料收集皮带（末端）
  belt3: [0, 0, 0.6],     // belt3 → 小料收集箱
  belt4: [0.6, 0, 0],     // belt4 → 大料收集框
};

/** 小料在 belt2 上开始过筛的位置（局部 X，位于筛分孔带） */
const SIEVE_START_LX = -0.5;

export function BeltMaterialItem({ id }: { id: string }) {
  const matState = useBeltStore((s) => s.materials.find(m => m.id === id));
  const removeMaterial = useBeltStore((s) => s.removeMaterial);
  const incrementCount = useBeltStore((s) => s.incrementCount);
  const updateOnBelt = useBeltStore((s) => s.updateMaterialOnBelt);
  const setPhase = useBeltStore((s) => s.setMaterialPhase);
  const rbRef = useRef<RapierRigidBody>(null);
  // 初始为 0（dynamic），匹配 RigidBody 默认类型；首帧会正确触发 setBodyType(2)
  const bodyTypeRef = useRef<2 | 0>(0);

  useEffect(() => {
    return () => unregisterMaterialPos(id);
  }, [id]);

  useFrame((_, delta) => {
    if (!rbRef.current || !matState) return;
    const pos = rbRef.current.translation();
    if (isNaN(pos.x)) return;
    registerMaterialPos(id, pos);

    const state = useBeltStore.getState();
    const phase = matState.phase;
    const now = Date.now();
    const elapsed = now - matState.phaseStart;
    const scale = PARTICLE_SIZE_MAP[matState.size]?.scale || 1.0;

    // ===== 入箱检测（按尺寸匹配收集容器）=====
    const boxKind = detectBox(pos);
    if (boxKind === 'small' && matState.size === 'small') { incrementCount('small'); removeMaterial(id); return; }
    if (boxKind === 'large' && matState.size !== 'small') { incrementCount('large'); removeMaterial(id); return; }

    // ===== 掉落回收 =====
    if (pos.y < PHYSICS.FALL_RECOVERY_Y) { removeMaterial(id); return; }

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
        const { lx } = worldToLocal(pos, onBelt);

        // 筛分检测：belt2 筛孔带 + 小颗粒 → 漏到 belt3 筛下皮带
        if (onBelt === 'belt2' && lx > SIEVE_START_LX && matState.size === 'small') {
          setPhase(id, 'sieving');
          break;
        }

        // 到达皮带末端 → transitioning
        if (lx > getBeltLength(onBelt) / 2 - PHYSICS.BELT_DETECT_X_TOLERANCE) {
          setPhase(id, 'transitioning');
          break;
        }

        // 正常移动：沿皮带方向，Y 锁定在皮带表面
        const targetY = getBeltSurfaceY(onBelt, scale);
        rbRef.current.setNextKinematicTranslation({
          x: pos.x + dirX * speed,
          y: targetY,
          z: pos.z + dirZ * speed,
        });
        break;
      }
      case 'transitioning': {
        // 刚从 kinematic 切换到 dynamic 时，按出发皮带赋予抛掷速度
        if (bodyTypeRef.current !== 0) {
          rbRef.current.setBodyType(0 as const, true);
          bodyTypeRef.current = 0;
          const prevBelt = matState.onBelt;
          const speed = prevBelt ? THROW_SPEEDS[prevBelt] : undefined;
          if (speed) {
            rbRef.current.setLinvel({ x: speed[0], y: speed[1], z: speed[2] }, true);
          }
        }
        const detected = detectBelt(pos);
        if (detected && detected.belt !== matState.onBelt) {
          updateOnBelt(id, detected.belt);
          setPhase(id, 'on_belt');
          break;
        }
        // 重新落回同一条皮带 — 仅当不在末端时才切回 on_belt，避免末端循环
        if (detected && detected.belt === matState.onBelt && detected.lx < getBeltLength(detected.belt) / 2 - 0.1) {
          setPhase(id, 'on_belt');
          break;
        }
        if (elapsed > PHYSICS.TRANSITION_TIMEOUT) { removeMaterial(id); }
        break;
      }
      case 'sieving': {
        if (bodyTypeRef.current !== 0) {
          rbRef.current.setBodyType(0 as const, true);
          bodyTypeRef.current = 0;
          // 过筛下落：垂直漏下至 belt3 筛下皮带
          rbRef.current.setLinvel({ x: 0, y: -PHYSICS.SIEVE_FALL_VELOCITY_Y, z: 0 }, true);
        }
        const detected = detectBelt(pos);
        if (detected && detected.belt === 'belt3') {
          updateOnBelt(id, 'belt3');
          setPhase(id, 'on_belt');
          break;
        }
        if (elapsed > PHYSICS.SIEVING_TIMEOUT) {
          const b3 = BELT_LAYOUT.belt3;
          rbRef.current.setTranslation({ x: b3.position[0], y: getBeltSurfaceY('belt3', scale), z: b3.position[2] }, true);
          rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          updateOnBelt(id, 'belt3');
          setPhase(id, 'on_belt');
        }
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
