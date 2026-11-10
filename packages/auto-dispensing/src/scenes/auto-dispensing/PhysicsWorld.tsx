import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  RigidBody, CuboidCollider, CylinderCollider, type RapierRigidBody,
} from '@react-three/rapier';
import { useDispensingStore } from '../../stores/useDispensingStore';
import { useAppStore } from '../../stores/useAppStore';
import {
  PILL_R, PILL_H, SCENE_SCALE, VISUAL, type Vec3, type MagazineId,
} from './constants';
import {
  PHYSICS, allStaticColliders, pillSpawnWorld, crossedHopperMouth,
  hopperCenterWorld, hopperColliderParts,
  setPhysicsActive, getPhysicsStats, getPillTrace,
  notePillFrame, notePillSpawned, notePillLanded, notePillResolvedByFallback,
  type WorldPoint,
} from './physicsGeometry';
import {
  installDispensingDiagnostics, type DiagnosticsWindow,
} from './diagnostics';

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

/**
 * 静态物理世界：四条水平托板 + 四条落料斜槽 + 八根侧导轨。
 * 全部由 constants.ts 的装配几何推导，和 MagazineUnit 里可见的 box 一一对应；
 * 不套镜像负缩放 group，坐标由 physicsGeometry.ts 换算成世界坐标。
 */
function StaticColliders({ mirrored }: { mirrored: boolean }) {
  const boxes = useMemo(
    () => MAGS.flatMap((mag) =>
      allStaticColliders(mag, mirrored).map((box, i) => ({ ...box, key: `${mag}-${i}` })),
    ),
    [mirrored],
  );
  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
      {boxes.map((box) => (
        <CuboidCollider
          key={box.key}
          args={box.half}
          position={box.position}
          rotation={box.rotation}
          friction={PHYSICS.FRICTION}
          restitution={0}
        />
      ))}
    </RigidBody>
  );
}

/**
 * 取药料斗的物理内腔（跟随滑块 X）。
 * 用 kinematicPosition + setNextKinematicTranslation 每帧对齐滑块，
 * 接药期间滑块静止，药片滑出斜槽后被 +Z 壁挡住、落到底板上。
 * 视觉料斗仍在镜像 group 里，这里只补看不见的碰撞体。
 */
function HopperCatcher({ mirrored }: { mirrored: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const parts = useMemo(() => hopperColliderParts(), []);
  const initial = useMemo(
    () => hopperCenterWorld(useDispensingStore.getState().sliderX, mirrored),
    [mirrored],
  );

  useFrame(() => {
    const rb = body.current;
    if (!rb) return;
    const p = hopperCenterWorld(
      useDispensingStore.getState().sliderX,
      useAppStore.getState().mirrored,
    );
    rb.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={initial}>
      {parts.map((part, i) => (
        <CuboidCollider
          key={`hopper-${i}`}
          args={part.half}
          position={part.center}
          friction={0.5}
          restitution={0.02}
        />
      ))}
    </RigidBody>
  );
}

interface PillInit {
  spawn: Vec3;
  mirrored: boolean;
  /** 生成瞬间的滑块 X：接药期间滑块静止，料斗口位置据此确定 */
  hopperX: number;
}

/**
 * 单粒药的刚体：被退药气缸以 PUSH_SPEED 沿 +Z 推出料筒 →
 * 受重力沿斜槽下滑 → 脱离槽口后越过料斗口平面 → 结算计入料斗。
 *
 * 落斗由「位置穿越」判定而不是定时器，因此药片真的走完物理轨迹才算入斗；
 * 若低帧率/异常导致刚体没落进去，useDispenseLoop 的兜底超时会清掉它，状态机不会卡死。
 */
function PillBody({ id, mag, mirrored }: { id: string; mag: MagazineId; mirrored: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const prev = useRef<WorldPoint | null>(null);
  const landed = useRef(false);
  // 生成瞬间快照：中途切镜像/展台不会把在途刚体瞬移到另一侧
  const [init] = useState<PillInit>(() => ({
    spawn: pillSpawnWorld(mag, mirrored),
    mirrored,
    hopperX: useDispensingStore.getState().sliderX,
  }));

  useEffect(() => {
    notePillSpawned();
    return () => { if (!landed.current) notePillResolvedByFallback(); };
  }, []);

  useFrame(() => {
    const rb = body.current;
    if (!rb || landed.current) return;
    const t = rb.translation();
    const cur: WorldPoint = { x: t.x, y: t.y, z: t.z };
    notePillFrame(id, cur);
    const last = prev.current;
    prev.current = cur;
    if (!last) return;
    if (crossedHopperMouth(last, cur, init.hopperX, init.mirrored)) {
      landed.current = true;
      notePillLanded();
      useDispensingStore.getState().landPill(id);
    }
  });

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={init.spawn}
      linearVelocity={[0, 0, PHYSICS.PUSH_SPEED]}
      linearDamping={0.02}
      angularDamping={PHYSICS.ANGULAR_DAMPING}
      ccd
      canSleep={false}
    >
      <CylinderCollider
        args={[PILL_H / 2 * SCENE_SCALE, PILL_R * SCENE_SCALE]}
        friction={PHYSICS.FRICTION}
        restitution={PHYSICS.RESTITUTION}
      />
      <mesh castShadow>
        <cylinderGeometry args={[PILL_R * SCENE_SCALE, PILL_R * SCENE_SCALE, PILL_H * SCENE_SCALE, 14]} />
        <meshStandardMaterial color={VISUAL.PILL_COLOR[mag]} metalness={0.15} roughness={0.5} />
      </mesh>
    </RigidBody>
  );
}

/** 订阅推出事件：pendingPills 里每一项对应一个刚体，落斗后由 landPill 移除 */
function PhysicsPills({ mirrored }: { mirrored: boolean }) {
  const pills = useDispensingStore((s) => s.pendingPills);
  return (
    <>
      {pills.map((p) => (
        <PillBody key={p.id} id={p.id} mag={p.mag} mirrored={mirrored} />
      ))}
    </>
  );
}

/**
 * 物理世界根组件：由 DispensingSceneContent 挂在 <Physics> 内。
 * 独立 App 与统一入口平台因此共用同一套刚体与碰撞体。
 */
export function PhysicsWorld() {
  const mirrored = useAppStore((s) => s.mirrored);
  useEffect(() => {
    setPhysicsActive(true);
    if (typeof window !== 'undefined') {
      const w = window as DiagnosticsWindow;
      w.__dtPhysics = getPhysicsStats;
      w.__dtPillTrace = getPillTrace;
      installDispensingDiagnostics();
    }
    return () => setPhysicsActive(false);
  }, []);
  return (
    <>
      <StaticColliders mirrored={mirrored} />
      <HopperCatcher mirrored={mirrored} />
      <PhysicsPills mirrored={mirrored} />
    </>
  );
}
