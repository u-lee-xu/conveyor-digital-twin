/**
 * 象棋棋子：圆柱本体 + 顶面一圈暗色刻字环。
 *
 * 红线（用户反馈「不同角度看顶部有时红/白、有时黑/白」）：
 * 旧实现在顶面叠了 3 层薄圆柱贴片，其中两层带深度偏移、一层不带，
 * 且被吸起时中心圆换成亮银白材质；深度偏移不一致会让中心面在不同视角被
 * 亮银贴片盖住，看起来像换色。现在**顶面只有本体一个面**，刻字环是
 * 与之几何不重叠的单面环带（同 y、边界精确相接），只靠 SURFACE_GAP 错开，
 * 全部材质都不带深度偏移，颜色恒为红 / 黑本体色。
 */
import { M, GAP } from '../../shared/gantryMaterials';

export function ChessPieceMesh({ side, cell }: {
  side: 'red' | 'black'; cell: number;
}) {
  const body = side === 'red' ? M.pieceRed : M.pieceBlack;
  return (
    <group>
      <mesh castShadow material={body}>
        <cylinderGeometry args={[cell * 0.30, cell * 0.32, 0.022, 36]} />
      </mesh>
      {/* ringGeometry 默认在 XY 平面法线 +Z，转 -90° 平放使法线朝 +Y */}
      <mesh position={[0, 0.011 + GAP, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.pieceRing}>
        <ringGeometry args={[cell * 0.205, cell * 0.235, 36]} />
      </mesh>
    </group>
  );
}
