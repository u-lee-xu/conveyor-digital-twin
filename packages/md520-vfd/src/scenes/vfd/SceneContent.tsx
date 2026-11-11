/**
 * MD520 独立场景内容：变频器柜 + 三相电机 + 短皮带。
 * 纯视觉装置，不挂 Rapier 刚体；网格与地面只作标尺，不参与任何业务闭环。
 */
import { PhysicsVfdDrive } from './PhysicsVfdDrive';

export function VfdSceneContent() {
  return (
    <>
      <color attach="background" args={['#1b2431']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, -4]} intensity={1.25} />
      <directionalLight position={[-4, 3, 4]} intensity={0.55} color="#9fb4cc" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.052, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#1f2a38" roughness={0.95} />
      </mesh>
      <gridHelper args={[4, 40, '#3a4b60', '#2b3644']} position={[0, -0.048, 0]} />
      <PhysicsVfdDrive />
    </>
  );
}
