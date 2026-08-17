import { materials } from '../../../components/scene/shared/materials';

/**
 * 旋转气缸输出盘（独立部件）：扁圆柱盘体，绕自身轴（Y）摆动 90°
 *
 * 盘面朝上（+Y），安装于气缸基座顶部宽面；尺寸按 0.74 比例缩小
 */
export function OutputDisc({ angle, position }: { angle: number; position: [number, number, number] }) {
  // 缩小后盘体半径/厚度
  const R = 0.028;
  const TH = 0.014;
  return (
    <group position={position} rotation={[0, angle * Math.PI / 2 - Math.PI / 4, 0]}>
      {/* 盘体（银色，轴线沿 Y） */}
      <mesh material={materials.endCap}>
        <cylinderGeometry args={[R, R, TH, 24]} />
      </mesh>
      {/* 盘缘包边（深灰蓝，环面与盘面平行：法线朝 Y） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.sleeve}>
        <torusGeometry args={[R, 0.003, 10, 24]} />
      </mesh>
      {/* 刻度线 ×12（盘面放射刻度，沿盘面径向，位于 XZ 平面） */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={`scl_${i}`} position={[Math.sin(a) * R * 0.86, TH / 2 + 0.001, Math.cos(a) * R * 0.86]} rotation={[0, a, 0]} material={materials.darkMetal}>
            <boxGeometry args={[0.0012, 0.002, 0.0055]} />
          </mesh>
        );
      })}
      {/* 螺栓孔 ×8（盘缘沉孔，极薄圆片平贴盘面：位于 XZ 平面、法线朝 Y，任何角度不可见厚度） */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return (
          <mesh key={`bolt_${i}`} position={[Math.sin(a) * R * 0.71, TH / 2 + 0.0001, Math.cos(a) * R * 0.71]} rotation={[Math.PI / 2, 0, 0]} material={materials.darkMetal}>
            <circleGeometry args={[0.0032, 12]} />
          </mesh>
        );
      })}
      {/* 中心内六角（深色六角薄片，平贴盘面） */}
      <mesh position={[0, TH / 2 + 0.0001, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.magSwitch}>
        <circleGeometry args={[0.007, 6]} />
      </mesh>
      {/* 转轴中心帽（琥珀色，旋转输出位） */}
      <mesh material={materials.flange}>
        <cylinderGeometry args={[0.009, 0.009, TH + 0.006, 16]} />
      </mesh>
    </group>
  );
}