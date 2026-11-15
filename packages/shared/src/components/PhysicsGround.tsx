/**
 * 带物理碰撞的地面：只有真正挂 <Physics> 的场景才引用本模块。
 * 与纯视觉 Ground 拆开，是「无物理设备不下载 Rapier」的前提。
 */
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Ground, GROUND_SIZE, type GroundProps } from './Ground';

export function PhysicsGround({ size = GROUND_SIZE, ...rest }: GroundProps) {
  return (
    <RigidBody type="fixed" position={[0, -0.01, 0]} colliders={false}>
      <CuboidCollider args={[size / 2, 0.01, size / 2]} collisionGroups={(0x0001 << 16) | 0x0003} />
      <Ground size={size} {...rest} />
    </RigidBody>
  );
}
