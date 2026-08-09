import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { useBeltStore, type BeltName, PARTICLE_SIZE_MAP } from '../useBeltStore';
import {
  BELT_SURFACE_Y, BELT_LAYOUT, BELT_WIDTH, getBeltLength,
  COLLECTION_BOX_POSITION, SMALL_PARTICLE_BOX_POSITION, IMPURITY_BOX_POSITION,
  MATERIAL_SIZE, VISUAL, PHYSICS, COMPONENT,
} from '../constants';
import { worldToLocal, detectBelt } from './helpers';
import { registerMaterialPos, unregisterMaterialPos } from '../materialRegistry';

/** 检测位置是否在某个收集容器范围内 */
const BOX_DETECTORS: { pos: [number, number, number]; kind: 'coal' | 'small' | 'stone' }[] = [
  { pos: COLLECTION_BOX_POSITION, kind: 'coal' },
  { pos: SMALL_PARTICLE_BOX_POSITION, kind: 'small' },
  { pos: IMPURITY_BOX_POSITION, kind: 'stone' },
];

/** 收集容器检测：大料框收中/大料，小料箱只收小料，矸石箱只收矸石 */
function detectBox(pos: { x: number; y: number; z: number }): 'coal' | 'small' | 'stone' | null {
  for (const box of BOX_DETECTORS) {
    if (Math.abs(pos.x - box.pos[0]) < PHYSICS.BOX_DETECT_XZ_RANGE && Math.abs(pos.z - box.pos[2]) < PHYSICS.BOX_DETECT_XZ_RANGE && pos.y < box.pos[1] + PHYSICS.BOX_DETECT_Y_MAX_OFFSET && pos.y > box.pos[1] + PHYSICS.BOX_DETECT_Y_MIN_OFFSET) {
      return box.kind;
    }
  }
  return null;
}

/** 上帧→本帧路径上多点采样入箱检测（低帧率下快速下落的物料整帧跳过窗口，插值补偿） */
function detectBoxSampled(last: { x: number; y: number; z: number } | null, cur: { x: number; y: number; z: number }): 'coal' | 'small' | 'stone' | null {
  if (!last) return detectBox(cur);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const kind = detectBox({
      x: last.x + (cur.x - last.x) * t,
      y: last.y + (cur.y - last.y) * t,
      z: last.z + (cur.z - last.z) * t,
    });
    if (kind) return kind;
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
  belt1: [0.6, 0, -0.35],  // belt1 → belt2 筛分皮带入口（vz 不宜过大，否则落点越过 belt2 起点掉地）
  belt2: [-0.15, 0, 0.4],  // belt2 → belt4 大料收集皮带（末端）
  belt3: [0, 0, 0.6],      // belt3 → 小料收集箱
  belt4: [-0.6, 0, 0],     // belt4（掉头）→ 大料收集框
};

/** 小料在 belt2 上开始过筛的位置（局部 X，位于筛孔带，避开入口实板 lx∈[-1,-0.4]） */
const SIEVE_START_LX = -0.35;

export function BeltMaterialItem({ id }: { id: string }) {
  const matState = useBeltStore((s) => s.materials.find(m => m.id === id));
  const removeMaterial = useBeltStore((s) => s.removeMaterial);
  const incrementCount = useBeltStore((s) => s.incrementCount);
  const updateOnBelt = useBeltStore((s) => s.updateMaterialOnBelt);
  const setPhase = useBeltStore((s) => s.setMaterialPhase);
  const rbRef = useRef<RapierRigidBody>(null);
  // 初始为 0（dynamic），匹配 RigidBody 默认类型；首帧会正确触发 setBodyType(2)
  const bodyTypeRef = useRef<2 | 0>(0);
  // 自由飞行相位（transitioning / sieving / blown）手动 kinematic 插值状态
  // destBelt/tLand：转接目标带与解析落带时刻；boxKind/boxT：解析入箱容器与时刻（帧率无关）
  const flightRef = useRef<{
    phase: string; x0: number; y0: number; z0: number; t: number;
    lastX: number; lastY: number; lastZ: number;
    destBelt: BeltName | null; tLand: number;
    boxKind: 'coal' | 'small' | 'stone' | null; boxT: number;
  }>({ phase: '', x0: 0, y0: 0, z0: 0, t: 0, lastX: 0, lastY: 0, lastZ: 0, destBelt: null, tLand: -1, boxKind: null, boxT: -1 });
  // 上帧位置（入箱检测多点采样用）
  const lastPosRef = useRef<{ x: number; y: number; z: number } | null>(null);

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

    // ===== 入箱检测（按类型匹配收集容器，路径多点采样防漏检）=====
    const boxKind = detectBoxSampled(lastPosRef.current, pos);
    lastPosRef.current = { x: pos.x, y: pos.y, z: pos.z };
    if (boxKind === 'small' && matState.size === 'small') { incrementCount('small'); removeMaterial(id); return; }
    if (boxKind === 'stone' && matState.type === 'stone') { incrementCount('stone'); removeMaterial(id); return; }
    if (boxKind === 'coal' && matState.size !== 'small') { incrementCount(matState.type === 'coal' ? 'coal' : 'stone'); removeMaterial(id); return; }

    // ===== 掉落回收 =====
    if (pos.y < PHYSICS.FALL_RECOVERY_Y) { removeMaterial(id); return; }

    // ===== 状态机 =====
    switch (phase) {
      case 'on_belt': {
        // 回到带面：重置自由飞行状态，下次转接/过筛/吹矸重新初始化起点与计时
        flightRef.current.phase = '';
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

        // 筛分检测：belt2 筛孔带 + 小颗粒 → 漏到 belt3 筛下皮带
        if (onBelt === 'belt2' && lx > SIEVE_START_LX && matState.size === 'small') {
          setPhase(id, 'sieving');
          break;
        }

        // 整列：belt2 整列区内把物料向带中心聚拢（局部 Z → 0）
        // 目标 lz 钳制在 V 形挡板内沿内（内沿随 lx 线性收窄），物料贴板走不穿模
        let lateralOffset = 0;
        if (onBelt === 'belt2' && lx >= PHYSICS.ALIGN_ZONE_START_LX && lx <= PHYSICS.ALIGN_ZONE_END_LX) {
          const halfWidth = COMPONENT.ALIGNER_OFFSET - (lx - PHYSICS.ALIGNER_CENTER_LX) * Math.tan(COMPONENT.ALIGNER_ANGLE);
          const targetLz = lz * (1 - PHYSICS.ALIGN_LATERAL_FACTOR);
          const clamped = Math.max(-halfWidth * 0.98, Math.min(halfWidth * 0.98, targetLz));
          lateralOffset = clamped - lz;
        }

        // 吹矸检测：belt2 吹矸区 + 矸石 + 分拣机开启 → 气吹离带（吹嘴脉冲点亮）
        // 用上帧→本帧 lx 区间相交判定（低帧率下 lx 跳变可能整帧跳过窄窗口，区间相交任何帧率必命中）
        if (onBelt === 'belt2' && matState.type === 'stone' && state.separator?.active) {
          const lastLx = lastPosRef.current ? worldToLocal(lastPosRef.current, onBelt).lx : lx;
          const lo = Math.min(lastLx, lx), hi = Math.max(lastLx, lx);
          if (hi >= PHYSICS.BLOW_ZONE_START_LX && lo <= PHYSICS.BLOW_ZONE_END_LX) {
            state.setBlowFlash(true);
            setTimeout(() => useBeltStore.getState().setBlowFlash(false), 500);
            setPhase(id, 'blown');
            break;
          }
        }

        // 到达皮带末端 → transitioning
        if (lx > getBeltLength(onBelt) / 2 - PHYSICS.BELT_DETECT_X_TOLERANCE) {
          setPhase(id, 'transitioning');
          break;
        }

        // 正常移动：沿皮带方向，Y 锁定在皮带表面，整列区叠加横向修正
        const targetY = getBeltSurfaceY(onBelt, scale);
        const latDirX = -Math.sin(layout.rotation);
        const latDirZ = Math.cos(layout.rotation);
        rbRef.current.setNextKinematicTranslation({
          x: pos.x + dirX * speed + latDirX * lateralOffset,
          y: targetY,
          z: pos.z + dirZ * speed + latDirZ * lateralOffset,
        });
        break;
      }
      case 'transitioning': {
        // 手动 kinematic 抛物线滑出（保持 kinematic，绕开 dynamic 速度不生效问题）
        const f = flightRef.current;
        if (f.phase !== 'transitioning') {
          f.phase = 'transitioning';
          f.t = 0;
          f.x0 = pos.x; f.y0 = pos.y; f.z0 = pos.z;
          f.lastX = pos.x; f.lastY = pos.y; f.lastZ = pos.z;
          f.destBelt = null; f.tLand = -1;
          f.boxKind = null; f.boxT = -1;
          if (bodyTypeRef.current !== 2) {
            rbRef.current.setBodyType(2 as const, true);
            bodyTypeRef.current = 2;
            rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
          // —— 解析求解（帧率无关）——
          const prevBelt = matState.onBelt;
          const speed = prevBelt ? THROW_SPEEDS[prevBelt] : undefined;
          const vx = speed?.[0] ?? 0, vy = speed?.[1] ?? 0, vz = speed?.[2] ?? 0;
          const halfSize = (MATERIAL_SIZE * scale) / 2;
          // 1) 目标带落点：y(t)=y0+vy·t-4.9t² = 目标带面+半高，解出落带时刻并校验落点在带内
          const destBelt = prevBelt === 'belt1' ? ('belt2' as BeltName) : prevBelt === 'belt2' ? ('belt4' as BeltName) : null;
          if (destBelt) {
            const dstY = BELT_SURFACE_Y[destBelt] + halfSize;
            const disc = vy * vy + 19.6 * (f.y0 - dstY);
            if (disc >= 0) {
              const tLand = (vy + Math.sqrt(disc)) / 9.8;
              if (tLand > 0) {
                const land = { x: f.x0 + vx * tLand, y: 0, z: f.z0 + vz * tLand };
                const { lx: llx, lz: llz } = worldToLocal(land, destBelt);
                if (Math.abs(llx) < getBeltLength(destBelt) / 2 + 0.15 && Math.abs(llz) < BELT_WIDTH / 2 + 0.12) {
                  f.destBelt = destBelt; f.tLand = tLand;
                }
              }
            }
          }
          // 2) 末端抛送入箱：y 回落穿过箱顶（y=0.3）时校验 x/z 是否在收集容器范围内
          if (prevBelt === 'belt3') {
            // 小料箱（belt3 末端）
            const tBox = Math.sqrt(Math.max(0, (f.y0 - 0.3) / 4.9));
            if (tBox > 0 && Math.abs(f.x0 + vx * tBox - SMALL_PARTICLE_BOX_POSITION[0]) < PHYSICS.BOX_DETECT_XZ_RANGE
              && Math.abs(f.z0 + vz * tBox - SMALL_PARTICLE_BOX_POSITION[2]) < PHYSICS.BOX_DETECT_XZ_RANGE) {
              f.boxKind = 'small'; f.boxT = tBox;
            }
          } else if (prevBelt === 'belt4') {
            // 大料框（belt4 尽头）
            const tBox = Math.sqrt(Math.max(0, (f.y0 - 0.3) / 4.9));
            if (tBox > 0 && Math.abs(f.x0 + vx * tBox - COLLECTION_BOX_POSITION[0]) < PHYSICS.BOX_DETECT_XZ_RANGE
              && Math.abs(f.z0 + vz * tBox - COLLECTION_BOX_POSITION[2]) < PHYSICS.BOX_DETECT_XZ_RANGE) {
              f.boxKind = 'coal'; f.boxT = tBox;
            }
          }
        }
        const prevBelt = matState.onBelt;
        const speed = prevBelt ? THROW_SPEEDS[prevBelt] : undefined;
        f.t += delta;
        const np = {
          x: f.x0 + (speed ? speed[0] : 0) * f.t,
          y: f.y0 + (speed ? (speed[1] ?? 0) : 0) * f.t - 4.9 * f.t * f.t,
          z: f.z0 + (speed ? speed[2] : 0) * f.t,
        };
        rbRef.current.setNextKinematicTranslation(np);
        // 解析入箱：到达箱顶时刻立即回收（帧率无关）
        if (f.boxKind && f.t >= f.boxT) {
          incrementCount(f.boxKind === 'coal' ? (matState.type === 'coal' ? 'coal' : 'stone') : 'small');
          removeMaterial(id);
          return;
        }
        // 解析落带：到达目标带面时刻切入 on_belt（Y 锁定带面，不依赖逐帧检测窗口）
        if (f.destBelt && f.t >= f.tLand) {
          updateOnBelt(id, f.destBelt);
          setPhase(id, 'on_belt');
          break;
        }
        f.lastX = np.x; f.lastY = np.y; f.lastZ = np.z;
        if (elapsed > PHYSICS.TRANSITION_TIMEOUT) { removeMaterial(id); }
        break;
      }
      case 'sieving': {
        // 手动 kinematic 垂直漏下（抬离带面 0.03 起始，避免贴面出发）
        const f = flightRef.current;
        if (f.phase !== 'sieving') {
          f.phase = 'sieving';
          f.t = 0;
          f.x0 = pos.x; f.z0 = pos.z;
          f.y0 = pos.y + PHYSICS.THROW_CLEARANCE;
          f.lastX = pos.x; f.lastY = f.y0; f.lastZ = pos.z;
          if (bodyTypeRef.current !== 2) {
            rbRef.current.setBodyType(2 as const, true);
            bodyTypeRef.current = 2;
            rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        f.t += delta;
        const np = { x: f.x0, y: f.y0 - PHYSICS.SIEVE_FALL_VELOCITY_Y * f.t, z: f.z0 };
        rbRef.current.setNextKinematicTranslation(np);
        // 落到 belt3 带面上方 0.15m 内即锁定（帧率无关）
        const mid = { x: (f.lastX + np.x) / 2, y: (f.lastY + np.y) / 2, z: (f.lastZ + np.z) / 2 };
        const dstSurfaceY = BELT_SURFACE_Y.belt3;
        const detected = (np.y < dstSurfaceY + 0.15 ? detectBelt(np, ['belt3']) : null) ?? (mid.y < dstSurfaceY + 0.15 ? detectBelt(mid, ['belt3']) : null);
        if (detected && detected.belt === 'belt3') {
          updateOnBelt(id, 'belt3');
          setPhase(id, 'on_belt');
          break;
        }
        f.lastX = np.x; f.lastY = np.y; f.lastZ = np.z;
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
      case 'blown': {
        // 手动 kinematic 气吹抛物线：vx 横向吹离 +x 侧，vy 抬升飞越带面，重力回落进矸石箱
        const f = flightRef.current;
        if (f.phase !== 'blown') {
          f.phase = 'blown';
          f.t = 0;
          f.x0 = pos.x; f.y0 = pos.y + PHYSICS.THROW_CLEARANCE; f.z0 = pos.z;
          f.boxKind = null; f.boxT = -1;
          if (bodyTypeRef.current !== 2) {
            rbRef.current.setBodyType(2 as const, true);
            bodyTypeRef.current = 2;
            rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
          // —— 解析入箱时刻（帧率无关）：y(t)=y0+vy·t-4.9t² 回落穿过箱顶 y=0.3 时，x 已在矸石箱范围 ——
          const disc = PHYSICS.BLOW_VELOCITY_Y * PHYSICS.BLOW_VELOCITY_Y + 19.6 * (f.y0 - 0.3);
          if (disc >= 0) {
            const tBox = (PHYSICS.BLOW_VELOCITY_Y + Math.sqrt(disc)) / 9.8;
            if (tBox > 0 && Math.abs(f.x0 + PHYSICS.BLOW_VELOCITY_X * tBox - IMPURITY_BOX_POSITION[0]) < PHYSICS.BOX_DETECT_XZ_RANGE
              && Math.abs(f.z0 - IMPURITY_BOX_POSITION[2]) < PHYSICS.BOX_DETECT_XZ_RANGE) {
              f.boxKind = 'stone'; f.boxT = tBox;
            }
          }
        }
        f.t += delta;
        const np = {
          x: f.x0 + PHYSICS.BLOW_VELOCITY_X * f.t,
          y: f.y0 + PHYSICS.BLOW_VELOCITY_Y * f.t - 4.9 * f.t * f.t,
          z: f.z0,
        };
        rbRef.current.setNextKinematicTranslation(np);
        // 解析入箱：到达箱顶时刻立即回收（帧率无关）
        if (f.boxKind && f.t >= f.boxT) {
          incrementCount('stone');
          removeMaterial(id);
          return;
        }
        if (elapsed > PHYSICS.BLOW_TIMEOUT) { removeMaterial(id); }
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
