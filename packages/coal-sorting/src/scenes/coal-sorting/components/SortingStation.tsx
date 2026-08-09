import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { useBeltStore } from '../useBeltStore';
import { SceneLabel } from './SceneLabel';
import {
  SORTING_STATIONS, HOPPER_POSITION, FEED_CYLINDER_POSITION,
  VISUAL, COMPONENT, PHYSICS,
} from '../constants';

export function Hopper() {
  return (
    <group position={HOPPER_POSITION}>
      <mesh position={[0, COMPONENT.HOPPER_BODY_Y, 0]}><boxGeometry args={[COMPONENT.HOPPER_BODY_SIZE, COMPONENT.HOPPER_BODY_SIZE, COMPONENT.HOPPER_BODY_SIZE]} /><meshStandardMaterial color={VISUAL.HOPPER_BODY_COLOR} /></mesh>
      <mesh position={[0, COMPONENT.HOPPER_RIM_Y, 0]}><boxGeometry args={[COMPONENT.HOPPER_RIM_SIZE, COMPONENT.HOPPER_RIM_THICKNESS, COMPONENT.HOPPER_RIM_SIZE]} /><meshStandardMaterial color={VISUAL.HOPPER_RIM_COLOR} /></mesh>
      {/* 下料溜槽 — 料斗底部斜向皮带表面 */}
      <mesh position={[0, COMPONENT.HOPPER_CHUTE_Y, 0]} rotation={[0, 0, -COMPONENT.HOPPER_CHUTE_ANGLE]}>
        <boxGeometry args={[COMPONENT.HOPPER_CHUTE_LENGTH, COMPONENT.HOPPER_CHUTE_THICKNESS, COMPONENT.HOPPER_CHUTE_WIDTH]} />
        <meshStandardMaterial color={VISUAL.FRAME_COLOR} />
      </mesh>
      <SceneLabel text="料斗" position={[0, COMPONENT.HOPPER_LABEL_Y, 0]} />
    </group>
  );
}

export function FeedCylinder() {
  const cylinder = useBeltStore((s) => s.feedCylinder);
  const plateRef = useRef<RapierRigidBody>(null);
  const extRef = useRef(cylinder?.currentExtension || -0.15);
  const target = cylinder?.extended ? 0.15 : -0.15;

  useFrame(() => {
    const diff = target - extRef.current;
    if (Math.abs(diff) > COMPONENT.CYLINDER_THRESHOLD) {
      extRef.current += diff * COMPONENT.CYLINDER_SMOOTH_FACTOR;
      if (plateRef.current) {
        plateRef.current.setNextKinematicTranslation({
          x: FEED_CYLINDER_POSITION[0] + extRef.current + 0.3,
          y: FEED_CYLINDER_POSITION[1],
          z: FEED_CYLINDER_POSITION[2] + 0.35
        });
      }
    }
  });

  return (
    <group>
      <RigidBody ref={plateRef} type="kinematicPosition" position={[FEED_CYLINDER_POSITION[0] - 0.15 + 0.3, FEED_CYLINDER_POSITION[1], FEED_CYLINDER_POSITION[2] + 0.35]}>
        <CuboidCollider args={[COMPONENT.CYLINDER_COLLIDER_HALF_X, COMPONENT.CYLINDER_COLLIDER_HALF_Y, COMPONENT.CYLINDER_COLLIDER_HALF_Z]} collisionGroups={PHYSICS.BELT_COLLISION_GROUP} />
        <mesh><boxGeometry args={[COMPONENT.CYLINDER_PLATE_THICKNESS, COMPONENT.CYLINDER_PLATE_HEIGHT, COMPONENT.CYLINDER_PLATE_WIDTH]} /><meshStandardMaterial color={VISUAL.CYLINDER_PLATE_COLOR} /></mesh>
      </RigidBody>
      <SceneLabel text="上料气缸" position={[FEED_CYLINDER_POSITION[0] + 0.3, FEED_CYLINDER_POSITION[1] + 0.15, FEED_CYLINDER_POSITION[2] + 0.35]} />
    </group>
  );
}

export function SortingStations() {
  // 三段指示：X光开启（皮带运行，光束常亮绿）→ X光检测到矸石（光束脉冲闪烁）→ 喷吹（喷嘴亮+气流）
  const belt2Running = useBeltStore((s) => s.belts?.belt2?.running || false);
  const blowFlash = useBeltStore((s) => s.blowFlash);
  const xrayHit = useBeltStore((s) => s.xrayHit);
  const beamMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    const mat = beamMatRef.current;
    if (!mat) return;
    if (!belt2Running) {
      mat.color.set(VISUAL.XRAY_INACTIVE_COLOR);
      mat.emissiveIntensity = 0;
      return;
    }
    if (xrayHit) {
      // 检测到矸石：脉冲闪烁（绿 ↔ 亮白绿，发光强度交替）
      const pulse = Math.floor(Date.now() / 220) % 2 === 0;
      mat.color.set(pulse ? 0x9dfcc0 : VISUAL.XRAY_ACTIVE_COLOR);
      mat.emissiveIntensity = pulse ? 3.5 : 1.2;
    } else {
      // 开启状态：常亮绿
      mat.color.set(VISUAL.XRAY_ACTIVE_COLOR);
      mat.emissiveIntensity = 1.2;
    }
  });

  return (
    <group>
      {/* V形整列 - 旋转π/2匹配belt2方向，翻转板角度使宽口朝上游、窄口朝下游 */}
      <group position={SORTING_STATIONS.aligner.position} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, COMPONENT.ALIGNER_Y, -COMPONENT.ALIGNER_OFFSET]} rotation={[0, COMPONENT.ALIGNER_ANGLE, 0]}><boxGeometry args={[COMPONENT.ALIGNER_BOARD_LENGTH, COMPONENT.ALIGNER_BOARD_HEIGHT, COMPONENT.ALIGNER_BOARD_THICKNESS]} /><meshStandardMaterial color={VISUAL.ALIGNER_COLOR} /></mesh>
        <mesh position={[0, COMPONENT.ALIGNER_Y, COMPONENT.ALIGNER_OFFSET]} rotation={[0, -COMPONENT.ALIGNER_ANGLE, 0]}><boxGeometry args={[COMPONENT.ALIGNER_BOARD_LENGTH, COMPONENT.ALIGNER_BOARD_HEIGHT, COMPONENT.ALIGNER_BOARD_THICKNESS]} /><meshStandardMaterial color={VISUAL.ALIGNER_COLOR} /></mesh>
        <SceneLabel text="V形整列器" position={[0, 0.15, 0]} />
      </group>
      {/* X射线龙门：光束 = 开启指示（绿）/ 检测到指示（脉冲闪烁） */}
      <group position={SORTING_STATIONS.xrayGate.position} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, COMPONENT.XRAY_PILLAR_Y, -COMPONENT.XRAY_PILLAR_OFFSET]}><boxGeometry args={[COMPONENT.XRAY_PILLAR_SIZE, COMPONENT.XRAY_PILLAR_HEIGHT, COMPONENT.XRAY_PILLAR_SIZE]} /><meshStandardMaterial color={VISUAL.XRAY_FRAME_COLOR} /></mesh>
        <mesh position={[0, COMPONENT.XRAY_PILLAR_Y, COMPONENT.XRAY_PILLAR_OFFSET]}><boxGeometry args={[COMPONENT.XRAY_PILLAR_SIZE, COMPONENT.XRAY_PILLAR_HEIGHT, COMPONENT.XRAY_PILLAR_SIZE]} /><meshStandardMaterial color={VISUAL.XRAY_FRAME_COLOR} /></mesh>
        <mesh position={[0, COMPONENT.XRAY_BEAM_Y, 0]}><boxGeometry args={[COMPONENT.XRAY_BEAM_WIDTH, COMPONENT.XRAY_BEAM_HEIGHT, COMPONENT.XRAY_BEAM_LENGTH]} /><meshStandardMaterial ref={beamMatRef} emissive={VISUAL.XRAY_ACTIVE_COLOR} emissiveIntensity={0} transparent opacity={0.9} /></mesh>
        {/* 设备状态灯：X光装置上电指示 */}
        <mesh position={[0, COMPONENT.XRAY_PILLAR_HEIGHT + 0.16, 0]}><sphereGeometry args={[0.025, 12, 12]} /><meshStandardMaterial color={belt2Running ? VISUAL.XRAY_ACTIVE_COLOR : VISUAL.INDICATOR_OFF} emissive={belt2Running ? VISUAL.XRAY_ACTIVE_COLOR : 0} emissiveIntensity={belt2Running ? 2 : 0} /></mesh>
        <SceneLabel text="X射线检测" position={[0, COMPONENT.XRAY_LABEL_Y, 0]} />
      </group>
      {/* 气阀阵列 — 皮带 -x 侧喷嘴，喷吹瞬间喷嘴亮 + 气流射向 +x 侧矸石箱 */}
      <group position={SORTING_STATIONS.airValveArray.position}>
        {Array.from({ length: SORTING_STATIONS.airValveArray.count }).map((_, i) => {
          const z = (i - (SORTING_STATIONS.airValveArray.count - 1) / 2) * SORTING_STATIONS.airValveArray.spacing;
          return (
            <mesh key={i} position={[0, 0, z]} rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[COMPONENT.AIR_VALVE_RADIUS_TOP, COMPONENT.AIR_VALVE_RADIUS_BOTTOM, COMPONENT.AIR_VALVE_LENGTH, 8]} />
              <meshStandardMaterial color={blowFlash ? VISUAL.XRAY_ACTIVE_COLOR : VISUAL.XRAY_FRAME_COLOR} />
            </mesh>
          );
        })}
        {/* 喷吹气流可视化：矸石被吹瞬间从喷嘴喷出的半透明气流 */}
        {blowFlash && (
          <>
            <mesh position={[0.28, 0.03, 0]}><boxGeometry args={[0.56, 0.018, 0.018]} /><meshStandardMaterial color={0x38bdf8} emissive={0x38bdf8} emissiveIntensity={2.5} transparent opacity={0.55} /></mesh>
            <mesh position={[0.14, 0.03, 0]}><boxGeometry args={[0.28, 0.045, 0.045]} /><meshStandardMaterial color={0x7dd3fc} emissive={0x7dd3fc} emissiveIntensity={1.5} transparent opacity={0.35} /></mesh>
          </>
        )}
      </group>
      <SceneLabel text="气阀喷吹阵列" position={SORTING_STATIONS.airValveArray.position} offset={[0, 0.15, 0]} />
    </group>
  );
}

export function CollectionBox({ position, color, label }: { position: [number, number, number]; color: number; label: string }) {
  return (
    <group position={position}>
      <mesh position={[0, COMPONENT.BOX_HEIGHT / 2, 0]}><boxGeometry args={[COMPONENT.BOX_SIZE, COMPONENT.BOX_HEIGHT, COMPONENT.BOX_SIZE]} /><meshStandardMaterial color={color} transparent opacity={VISUAL.BOX_OPACITY} /></mesh>
      <SceneLabel text={label} position={[0, COMPONENT.BOX_LABEL_Y, 0]} />
    </group>
  );
}
