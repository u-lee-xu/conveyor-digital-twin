/** 焊接台体：铝银灰整板 + 16 条细 T 槽 + 边框包边 + 角件螺栓 + 四腿 */
import { M, GAP } from '../../shared/gantryMaterials';
import { Bolt } from './IndustrialProfile';

export function WeldedTable({ railX, railY, tableH }: {
  railX: number; railY: number; tableH: number;
}) {
  const legs: [number, number][] = [[0, 0], [railX, 0], [0, railY], [railX, railY]];
  const slots = Array.from({ length: 16 }, (_, i) => (i + 0.5) * (railY / 16));
  return (
    <group>
      {legs.map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, tableH / 2, z]} castShadow material={M.base}>
          <boxGeometry args={[0.035, tableH, 0.035]} />
        </mesh>
      ))}
      <mesh position={[railX / 2, tableH - 0.012, railY / 2]} castShadow receiveShadow material={M.base}>
        <boxGeometry args={[railX + 0.1, 0.024, railY + 0.1]} />
      </mesh>
      <mesh position={[railX / 2, tableH + 0.001, railY / 2]} receiveShadow material={M.base}>
        <boxGeometry args={[railX + 0.1, 0.006, railY + 0.1]} />
      </mesh>
      {slots.map((z, i) => (
        <group key={`slot-${i}`}>
          {/* 贴面两端收进包边内：旧长度 railX+0.09 会横穿 edge-x 边框，
              两者顶面只差 0.0001 且一个带深度偏移、一个不带 → 交叉处闪色。 */}
          <mesh position={[railX / 2, tableH + 0.004 + GAP, z]} material={M.slot}>
            <boxGeometry args={[railX - 0.03, 0.0012, 0.005]} />
          </mesh>
          <mesh position={[railX / 2, tableH + 0.004 + GAP * 2, z]} material={M.decal}>
            <boxGeometry args={[railX - 0.04, 0.0012, 0.0015]} />
          </mesh>
        </group>
      ))}
      {[0, railY].map((z, i) => (
        <mesh key={`edge-z-${i}`} position={[railX / 2, tableH + 0.003, z]} material={M.endCap}>
          <boxGeometry args={[railX + 0.1, 0.008, 0.012]} />
        </mesh>
      ))}
      {[0, railX].map((x, i) => (
        <mesh key={`edge-x-${i}`} position={[x, tableH + 0.003, railY / 2]} material={M.endCap}>
          <boxGeometry args={[0.012, 0.008, railY + 0.1]} />
        </mesh>
      ))}
      {legs.map(([x, z], i) => (
        <Bolt key={`corner-${i}`} position={[x, tableH + 0.008, z]} r={0.006} h={0.004} />
      ))}
    </group>
  );
}
