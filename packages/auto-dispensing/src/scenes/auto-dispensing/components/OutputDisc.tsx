import { materials } from '../../../components/scene/shared/materials';

/**
 * [已弃用] 旧版旋转气缸输出盘，当前场景不再引用，保留供造型对照。
 *
 * 现行装配见 SliderHopper.tsx：气缸侧立、盘面朝 +Z、输出轴沿 Z，
 * 料斗经连接支架固定在盘面上，随盘绕 Z 轴摆动 -90° 倒药。
 * 几何常量统一由 constants.ts 的 ROTARY_* / HOPPER_* 提供。
 */
export function OutputDisc({ position }: { position: [number, number, number] }) {
  const R = 0.028;
  const TH = 0.014;
  return (
    <group position={position}>
      {/* 盘体（银色，轴线沿 Y） */}
      <mesh material={materials.endCap}>
        <cylinderGeometry args={[R, R, TH, 24]} />
      </mesh>
      {/* 盘缘包边（深灰蓝，环面与盘面平行：法线朝 Y） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.sleeve}>
        <torusGeometry args={[R, 0.003, 10, 24]} />
      </mesh>
      {/* 刻度线 ×12（盘面放射刻度） */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={`scl_${i}`} position={[Math.sin(a) * R * 0.86, TH / 2 + 0.001, Math.cos(a) * R * 0.86]} rotation={[0, a, 0]} material={materials.darkMetal}>
            <boxGeometry args={[0.0012, 0.002, 0.0055]} />
          </mesh>
        );
      })}
      {/* 螺栓孔 ×8（盘缘沉孔） */}
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
