import { RigidBody, CuboidCollider } from '@react-three/rapier';

export const GROUND_SIZE = 20;
export const GROUND_COLOR = 0x334155;
export const GROUND_GRID_COLOR = 0x475569;

interface GroundProps {
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

/** 带物理碰撞的地面（供 rapier 场景使用） */
export function PhysicsGround({ size = GROUND_SIZE, ...rest }: GroundProps) {
  return (
    <RigidBody type="fixed" position={[0, -0.01, 0]} colliders={false}>
      <CuboidCollider args={[size / 2, 0.01, size / 2]} collisionGroups={(0x0001 << 16) | 0x0003} />
      <Ground size={size} {...rest} />
    </RigidBody>
  );
}
