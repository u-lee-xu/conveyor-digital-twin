/**
 * 纯视觉地面：暗色平面 + 辅助网格，无物理碰撞。
 * 刻意不 import Rapier —— 物理版拆在 PhysicsGround.tsx，避免无物理设备
 * 仅因画一个地面就把 2.26MB 的 rapier chunk 拉进自己的分包。
 */
export const GROUND_SIZE = 20;
export const GROUND_COLOR = 0x334155;
export const GROUND_GRID_COLOR = 0x475569;

export interface GroundProps {
  size?: number;
  divisions?: number;
  color?: number | string;
  gridColor?: number | string;
  subColor?: number | string;
}

/** 统一地面：暗色平面 + 辅助网格（无物理碰撞） */
export function Ground({ size = GROUND_SIZE, divisions = 40, color = GROUND_COLOR, gridColor = GROUND_GRID_COLOR, subColor = GROUND_GRID_COLOR }: GroundProps) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <gridHelper args={[size, divisions, gridColor, subColor]} position={[0, 0.001, 0]} />
    </group>
  );
}
