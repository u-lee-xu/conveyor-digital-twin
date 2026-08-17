import { useDispensingStore } from '../../../stores/useDispensingStore';
import { COLLECT_BIN_X, COLLECT_BIN_SIZE, PILL_R, PILL_H, VISUAL } from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/** 取药仓：接住翻转倒出的药片，人工取药（确认按钮）清空 */
export function CollectBin() {
  const binHasDrug = useDispensingStore((s) => s.sensors.binHasDrug);
  const total = useDispensingStore((s) => Object.values(s.binPills).reduce((a, b) => a + b, 0));
  const maxShow = Math.min(total, 10);
  const pills = [];
  for (let i = 0; i < maxShow; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    pills.push(
      <mesh
        key={i}
        position={[-0.03 + col * 0.035, 0.02 + row * 0.013, (row % 2 === 0 ? -0.02 : 0.02)]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 12]} />
        <meshStandardMaterial color={row % 2 === 0 ? VISUAL.PILL_COLOR.A : VISUAL.PILL_COLOR.B} />
      </mesh>,
    );
  }

  return (
    <group position={[COLLECT_BIN_X, 0, 0]}>
      {/* 柜体（顶面开口） */}
      <mesh position={[0, COLLECT_BIN_SIZE[1] / 2, 0]} castShadow material={materials.bin}>
        <boxGeometry args={COLLECT_BIN_SIZE} />
      </mesh>
      {/* 顶框（划分开口） */}
      <mesh position={[0, COLLECT_BIN_SIZE[1], 0]} material={materials.darkMetal}>
        <boxGeometry args={[COLLECT_BIN_SIZE[0] + 0.01, 0.012, COLLECT_BIN_SIZE[2] + 0.01]} />
      </mesh>
      {/* 有药指示灯 */}
      <mesh position={[0, COLLECT_BIN_SIZE[1] + 0.06, 0]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial
          color={binHasDrug ? VISUAL.LAMP_YELLOW : VISUAL.LAMP_DARK}
          emissive={binHasDrug ? VISUAL.LAMP_YELLOW : '#000000'}
          emissiveIntensity={2}
        />
      </mesh>
      {/* 仓内药片 */}
      {pills}
    </group>
  );
}