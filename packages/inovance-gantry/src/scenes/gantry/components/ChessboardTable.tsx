/** 深棕 8x8 棋盘独立小桌：木格 + 暗刻线 + 边框 + 四条细腿 + 黑色地脚 */
import { M, GAP } from '../../shared/gantryMaterials';
import { GANTRY_BOARD } from '../../../constants/gantryConstants';

export function ChessboardTable({ boardX, boardZ, cell, boardY, tableH }: {
  boardX: number; boardZ: number; cell: number; boardY: number; tableH: number;
}) {
  const vr = GANTRY_BOARD.VISUAL_ROWS;
  const vc = GANTRY_BOARD.VISUAL_COLS;
  const cx = boardX + (vc * cell) / 2;
  const cz = boardZ + (vr * cell) / 2;
  const tiles = [];
  for (let r = 0; r < vr; r += 1) {
    for (let c = 0; c < vc; c += 1) {
      tiles.push(
        <mesh key={`tile-${r}-${c}`}
          position={[boardX + (c + 0.5) * cell, boardY, boardZ + (r + 0.5) * cell]}
          material={(r + c) % 2 === 0 ? M.boardLight : M.boardDark}>
          <boxGeometry args={[cell * 0.985, 0.008, cell * 0.985]} />
        </mesh>,
      );
    }
  }
  const legs: [number, number][] = [
    [boardX + 0.012, boardZ + 0.012],
    [boardX + vc * cell - 0.012, boardZ + 0.012],
    [boardX + 0.012, boardZ + vr * cell - 0.012],
    [boardX + vc * cell - 0.012, boardZ + vr * cell - 0.012],
  ];
  return (
    <group>
      <mesh position={[cx, boardY - 0.012, cz]} castShadow receiveShadow material={M.boardEdge}>
        <boxGeometry args={[vc * cell + 0.02, 0.016, vr * cell + 0.02]} />
      </mesh>
      {tiles}
      {Array.from({ length: vr + 1 }, (_, i) => (
        <mesh key={`grid-z-${i}`} position={[cx, boardY + 0.004 + GAP, boardZ + i * cell]} material={M.boardGrid}>
          <boxGeometry args={[vc * cell, 0.0012, 0.002]} />
        </mesh>
      ))}
      {Array.from({ length: vc + 1 }, (_, i) => (
        <mesh key={`grid-x-${i}`} position={[boardX + i * cell, boardY + 0.004 + GAP, cz]} material={M.boardGrid}>
          <boxGeometry args={[0.002, 0.0012, vr * cell]} />
        </mesh>
      ))}
      {legs.map(([x, z], i) => (
        <group key={`leg-${i}`}>
          <mesh position={[x, (boardY + tableH) / 2 - 0.01, z]} material={M.silver}>
            <cylinderGeometry args={[0.006, 0.006, boardY - tableH - 0.012, 12]} />
          </mesh>
          <mesh position={[x, tableH + 0.006, z]} material={M.bolt}>
            <cylinderGeometry args={[0.03, 0.03, 0.008, 18]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
