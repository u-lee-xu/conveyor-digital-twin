import { useMemo } from 'react';
import { SceneContainer } from './components/SceneContainer';
import { RobotArm } from './components/RobotArm';
import * as THREE from 'three';

/** 物料地面位置 */
const WORKPIECE_SPAWN: [number, number, number] = [0, 0.03, 0.69];   // A 工位（取料）
const WORKPIECE_PLACE: [number, number, number] = [0, 0.03, 1.02];   // B 工位（放料）
const ringMatA = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.3, emissive: '#f59e0b', emissiveIntensity: 0.6 });
const ringMatB = new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.3, emissive: '#3b82f6', emissiveIntensity: 0.6 });

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

  return (
    <SceneContainer>
      <RobotArm />
      {/* 地面 — 与父容器背景色一致，融合无边界 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      <gridHelper args={[20, 40, '#475569', '#334155']} position={[0, 0.001, 0]} />

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