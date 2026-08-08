import { useMemo } from 'react';
import { Ground } from '@digital-twin/shared';
import { SceneContainer } from './components/SceneContainer';
import { RobotArm } from './components/RobotArm';
import { PhysicsLabel } from './components/PhysicsLabel';
import { computeKinematics } from './constants';
import { useRobotStore } from './useRobotStore';
import * as THREE from 'three';

/** 物料地面位置 */
const WORKPIECE_SPAWN: [number, number, number] = [0, 0.03, 0.69];   // A 工位（取料）
const WORKPIECE_PLACE: [number, number, number] = [0, 0.03, 1.02];   // B 工位（放料）
const ringMatA = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.3, emissive: '#f59e0b', emissiveIntensity: 0.6 });
const ringMatB = new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.3, emissive: '#3b82f6', emissiveIntensity: 0.6 });

/** 升降气缸标签（跟随前后气缸前伸） */
function LiftLabel() {
  const forwardPos = useRobotStore((s) => s.cylinders.forward.position);
  const kin = computeKinematics(forwardPos, 0);
  return <PhysicsLabel key="lift-cylinder" text="升降气缸" position={[0, kin.liftWorldY, kin.liftWorldZ]} offset={[0.2, 0, 0]} color="blue" />;
}

/** 夹爪标签（跟随前后气缸 + 升降气缸） */
function GripperLabel() {
  const forwardPos = useRobotStore((s) => s.cylinders.forward.position);
  const liftPos = useRobotStore((s) => s.cylinders.lift.position);
  const kin = computeKinematics(forwardPos, liftPos);
  return <PhysicsLabel key="gripper" text="夹爪" position={[0, kin.gripperY, kin.gripperZ]} offset={[-0.2, 0, 0]} color="blue" />;
}

/** 生成 "A" 文字 Canvas 纹理 */
function useLabelTexture(text: string, size: number, color: string) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = `bold ${size * 0.85}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [text, size, color]);
}

export function PneumaticRobotSceneContent() {
  const aTex = useLabelTexture('A', 128, '#f59e0b');
  const bTex = useLabelTexture('B', 128, '#3b82f6');
  const kin = computeKinematics(0, 0);

  return (
    <SceneContainer>
      <RobotArm />

      {/* 场景标签（与传送带场景 UI 一致，位于 UI 面板下层） */}
      <PhysicsLabel key="forward-cylinder" text="前后气缸" position={[0, kin.fwdWorldY, kin.fwdWorldZ]} offset={[0.2, 0, 0]} color="blue" />
      <LiftLabel />
      <GripperLabel />
      <PhysicsLabel key="signal-tower" text="信号灯塔" position={[0, kin.towerY, kin.towerZ]} offset={[0, 0.2, 0]} color="yellow" />
      <PhysicsLabel key="spawn-station" text="取料工位" position={WORKPIECE_SPAWN} offset={[0, 0.1, 0]} color="orange" />
      <PhysicsLabel key="place-station" text="放料工位" position={WORKPIECE_PLACE} offset={[0, 0.1, 0]} color="blue" />
      {/* 地面 — 与父容器背景色一致，融合无边界 */}
      <Ground />

      {/* ===== 物料位置标记 A 圈 ===== */}
      <mesh
        position={[WORKPIECE_SPAWN[0], 0.002, WORKPIECE_SPAWN[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={ringMatA}
      >
        <torusGeometry args={[0.08, 0.006, 16, 48]} />
      </mesh>
      {/* A 标签 — Canvas 纹理平铺地面 */}
      <mesh
        position={[WORKPIECE_SPAWN[0], 0.003, WORKPIECE_SPAWN[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.1, 0.1]} />
        <meshBasicMaterial map={aTex} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* ===== 物料位置标记 B 圈 ===== */}
      <mesh
        position={[WORKPIECE_PLACE[0], 0.002, WORKPIECE_PLACE[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={ringMatB}
      >
        <torusGeometry args={[0.08, 0.006, 16, 48]} />
      </mesh>
      {/* B 标签 */}
      <mesh
        position={[WORKPIECE_PLACE[0], 0.003, WORKPIECE_PLACE[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.1, 0.1]} />
        <meshBasicMaterial map={bTex} transparent side={THREE.DoubleSide} />
      </mesh>
    </SceneContainer>
  );
}