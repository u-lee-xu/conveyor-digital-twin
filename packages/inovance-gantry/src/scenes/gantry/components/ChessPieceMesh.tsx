/** 象棋棋子：圆柱本体 + 顶面亮银刻字环 + 侧壁刻线 */
import { M, GAP } from '../../shared/gantryMaterials';

export function ChessPieceMesh({ side, held, cell }: {
  side: 'red' | 'black'; held: boolean; cell: number;
}) {
  const body = side === 'red' ? M.pieceRed : M.pieceBlack;
  return (
    <group>
      <mesh castShadow material={body}>
        <cylinderGeometry args={[cell * 0.30, cell * 0.32, 0.022, 36]} />
      </mesh>
      <mesh position={[0, 0.0115 + GAP, 0]} material={M.pieceFace}>
        <cylinderGeometry args={[cell * 0.24, cell * 0.24, 0.0012, 36]} />
      </mesh>
      <mesh position={[0, 0.0115 + GAP * 2, 0]} material={held ? M.decal : body}>
        <cylinderGeometry args={[cell * 0.19, cell * 0.19, 0.0012, 36]} />
      </mesh>
      <mesh position={[0, 0.002, 0]} material={M.decalDark}>
        <cylinderGeometry args={[cell * 0.321, cell * 0.321, 0.0012, 36]} />
      </mesh>
    </group>
  );
}
