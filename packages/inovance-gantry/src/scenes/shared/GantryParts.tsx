/**
 * 龙门场景可复用零件 —— 按自动配药 / 传送带场景的建模标准：
 * 铝挤型带 T 槽 + 端盖 + 等距螺栓、直线模组带亮银导轨与丝杆、
 * 伺服带散热筋与接线盒、笔形气缸带双导杆与黄铜接头、波纹吸盘分层。
 *
 * 所有材质取自 gantryMaterials.ts 单例，贴面统一用 GAP 错开，
 * 组件里不再内联 new MeshStandardMaterial。
 */
import type { ReactNode } from 'react';
import { M, GAP } from './gantryMaterials';
import { GANTRY_BOARD, GANTRY_SENSOR } from '../../constants/gantryConstants';

/** 沉头安装螺栓 */
export function Bolt({ position, r = 0.004, h = 0.003 }: {
  position: [number, number, number]; r?: number; h?: number;
}) {
  return (
    <mesh position={position} material={M.bolt}>
      <cylinderGeometry args={[r, r, h, 10]} />
    </mesh>
  );
}

/** 沿长边等距排布的一排螺栓 */
function BoltRow({ length, axis, y, z = 0, x = 0, pitch = 0.09 }: {
  length: number; axis: 'x' | 'z'; y: number; z?: number; x?: number; pitch?: number;
}) {
  const n = Math.max(2, Math.floor(length / pitch));
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => {
        const t = -length / 2 + 0.03 + i * pitch;
        if (t > length / 2 - 0.02) return null;
        const p: [number, number, number] = axis === 'z' ? [x, y, t] : [t, y, z];
        return <Bolt key={`bolt-${i}`} position={p} />;
      })}
    </>
  );
}

/**
 * 铝挤型材：主体 + 四面 T 槽贴面 + 两端端盖 + 顶面螺栓排。
 * axis='z' 长边沿 Z（Y 模组 / D20 导轨），axis='x' 长边沿 X（横梁）。
 */
export function Profile({ length, section = 0.062, axis = 'z', position = [0, 0, 0], bolts = true }: {
  length: number; section?: number; axis?: 'x' | 'z';
  position?: [number, number, number]; bolts?: boolean;
}) {
  const half = section / 2;
  const size: [number, number, number] = axis === 'z'
    ? [section, section, length] : [length, section, section];
  const capSize: [number, number, number] = axis === 'z'
    ? [section + 0.004, section + 0.004, 0.008] : [0.008, section + 0.004, section + 0.004];
  const capAt = (side: number): [number, number, number] => axis === 'z'
    ? [0, 0, side * (length / 2 + 0.004)] : [side * (length / 2 + 0.004), 0, 0];
  // 四面 T 槽：沿长边的暗槽 + 槽内亮银耐磨条
  const slots: ReactNode[] = [];
  for (const side of [-1, 1]) {
    const along = axis === 'z' ? length - 0.012 : length - 0.012;
    const grooveSize: [number, number, number] = axis === 'z'
      ? [0.008, 0.0012, along] : [along, 0.0012, 0.008];
    const topPos: [number, number, number] = axis === 'z'
      ? [side * (half - 0.012), half + GAP, 0] : [0, half + GAP, side * (half - 0.012)];
    const sidePos: [number, number, number] = axis === 'z'
      ? [side * (half + GAP), 0, 0] : [0, 0, side * (half + GAP)];
    const sideGroove: [number, number, number] = axis === 'z'
      ? [0.0012, 0.008, along] : [along, 0.008, 0.0012];
    slots.push(
      <group key={`slot-${side}`}>
        <mesh position={topPos} material={M.slot}><boxGeometry args={grooveSize} /></mesh>
        <mesh position={[topPos[0], topPos[1] + GAP, topPos[2]]} material={M.decal}>
          <boxGeometry args={axis === 'z' ? [0.003, 0.0012, along * 0.92] : [along * 0.92, 0.0012, 0.003]} />
        </mesh>
        <mesh position={sidePos} material={M.slot}><boxGeometry args={sideGroove} /></mesh>
      </group>,
    );
  }
  return (
    <group position={position}>
      <mesh castShadow receiveShadow material={M.base}><boxGeometry args={size} /></mesh>
      {slots}
      {[-1, 1].map((s) => (
        <mesh key={`cap-${s}`} position={capAt(s)} material={M.endCap}>
          <boxGeometry args={capSize} />
        </mesh>
      ))}
      {bolts && (
        <BoltRow length={length} axis={axis} y={half + GAP * 2}
          x={axis === 'z' ? 0 : undefined} z={axis === 'x' ? 0 : undefined} />
      )}
    </group>
  );
}

/** 伺服电机壳体：深色本体 + 散热筋 + 接线盒 + 亮银端盖（无彩色风扇） */
export function ServoHousing({ position, label, axis = 'x' }: {
  position: [number, number, number]; label: string; axis?: 'x' | 'z';
}) {
  const rot: [number, number, number] = axis === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0];
  return (
    <group position={position} rotation={rot} userData={{ label }}>
      <mesh castShadow material={M.servo}>
        <boxGeometry args={[0.075, 0.075, 0.075]} />
      </mesh>
      {/* 散热筋：沿电机长度等距薄片 */}
      {[-0.022, -0.011, 0, 0.011, 0.022].map((x, i) => (
        <mesh key={`rib-${i}`} position={[x, 0.039, 0]} material={M.servoRib}>
          <boxGeometry args={[0.004, 0.006, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.041]} material={M.endCap}>
        <boxGeometry args={[0.055, 0.055, 0.006]} />
      </mesh>
      <mesh position={[0, 0.046, -0.012]} material={M.terminalBox}>
        <boxGeometry args={[0.045, 0.016, 0.038]} />
      </mesh>
      <Bolt position={[0.028, 0, 0.045]} r={0.003} h={0.004} />
    </group>
  );
}

/** 线性模组：铝挤型本体 + 两条亮银滚珠导轨 + 中央丝杆 + 端部轴承座 */
export function LinearModule({ length, axis = 'z', position = [0, 0, 0] }: {
  length: number; axis?: 'x' | 'z'; position?: [number, number, number];
}) {
  const half = 0.031;
  /** 圆柱默认轴沿 Y；转到模组长边方向（Z 或 X） */
  const screwRotation: [number, number, number] = axis === 'z'
    ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
  const railSize: [number, number, number] = axis === 'z'
    ? [0.007, 0.004, length - 0.03] : [length - 0.03, 0.004, 0.007];
  const screwR = 0.006;
  return (
    <group position={position}>
      <Profile length={length} axis={axis} bolts />
      {[-1, 1].map((s, i) => {
        const p: [number, number, number] = axis === 'z'
          ? [s * 0.018, half + GAP, 0] : [0, half + GAP, s * 0.018];
        return (
          <group key={`rail-${i}`}>
            <mesh position={p} material={M.silver}><boxGeometry args={railSize} /></mesh>
            <mesh position={[p[0], p[1] + GAP, p[2]]} material={M.decal}>
              <boxGeometry args={axis === 'z' ? [0.002, 0.0012, length - 0.035] : [length - 0.035, 0.0012, 0.002]} />
            </mesh>
          </group>
        );
      })}
      {/* 滚珠丝杆：亮银主轴，以模组中心为原点沿长边放置，两端收进轴承座内。
          之前误加了 length/2 偏移且旋转矩阵写错，导致丝垂直戳出横梁。 */}
      <mesh position={[0, half + GAP * 2, 0]}
        rotation={screwRotation} material={M.silver}>
        <cylinderGeometry args={[screwR, screwR, length - 0.05, 14]} />
      </mesh>
      {[-1, 1].map((s) => {
        const p: [number, number, number] = axis === 'z'
          ? [0, half + GAP * 2, s * (length / 2 - 0.018)] : [s * (length / 2 - 0.018), half + GAP * 2, 0];
        return (
          <mesh key={`bearing-${s}`} position={p} rotation={screwRotation} material={M.sleeve}>
            <cylinderGeometry args={[0.013, 0.013, 0.014, 14]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 笔形气缸固定部分：缸体 + 上下端盖环 + 双导杆 + 黄铜气接头 */
export function PenCylinder({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow material={M.cylinder}>
        <cylinderGeometry args={[0.016, 0.016, 0.062, 20]} />
      </mesh>
      {[-0.031, 0.031].map((y, i) => (
        <mesh key={`cap-${i}`} position={[0, y, 0]} material={M.endCap}>
          <cylinderGeometry args={[0.018, 0.018, 0.006, 20]} />
        </mesh>
      ))}
      {/* 双导杆：真实笔形气缸/滑台两侧的防转导杆 */}
      {[-1, 1].map((s) => (
        <mesh key={`guide-${s}`} position={[s * 0.026, -0.01, 0]} material={M.rod}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.075, 12]} />
        </mesh>
      ))}
      {/* 黄铜气接头 */}
      <mesh position={[0.02, 0.02, 0.008]} rotation={[0, 0, Math.PI / 2]} material={M.brass}>
        <cylinderGeometry args={[0.005, 0.005, 0.016, 12]} />
      </mesh>
      <mesh position={[0.028, 0.02, 0.008]} material={M.brass}>
        <cylinderGeometry args={[0.007, 0.007, 0.006, 12]} />
      </mesh>
    </group>
  );
}

/** Z 运动头：活塞杆 + 吸盘支架 + 三层黑色波纹吸盘 + 唇边 + 中性气管 */
export function SuctionHead() {
  return (
    <group>
      <mesh position={[0, -0.024, 0]} material={M.rod}>
        <cylinderGeometry args={[0.007, 0.007, 0.052, 14]} />
      </mesh>
      {/* 吸盘支架：带四角螺栓的薄板 */}
      <mesh position={[0, -0.055, 0]} material={M.slider}>
        <boxGeometry args={[0.052, 0.008, 0.042]} />
      </mesh>
      {[-1, 1].map((sx) => [-1, 1].map((sz) => (
        <Bolt key={`bolt-${sx}-${sz}`} position={[sx * 0.02, -0.05 + GAP, sz * 0.015]} r={0.0025} h={0.002} />
      )))}
      {/* 波纹吸盘：三段渐缩 + 唇边 */}
      <mesh position={[0, -0.066, 0]} material={M.cup}>
        <cylinderGeometry args={[0.012, 0.016, 0.014, 20]} />
      </mesh>
      <mesh position={[0, -0.077, 0]} material={M.cup}>
        <cylinderGeometry args={[0.018, 0.014, 0.009, 20]} />
      </mesh>
      <mesh position={[0, -0.086, 0]} material={M.cup}>
        <cylinderGeometry args={[0.026, 0.019, 0.011, 20]} />
      </mesh>
      <mesh position={[0, -0.092, 0]} material={M.cupLip}>
        <cylinderGeometry args={[0.028, 0.028, 0.004, 20]} />
      </mesh>
      {/* 中性色气管（用户要求去掉绿色端子与青色软管） */}
      <mesh position={[0.028, -0.012, 0.012]} rotation={[0, 0, -0.32]} material={M.hose}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.075, 10]} />
      </mesh>
    </group>
  );
}

/**
 * Y 模组上的接近开关（参考配药 MachineFrame.tsx 的 LimitSensor）：
 * L 形吊架把开关固定到模组侧面 + 本体 + 感应面贴片 + 状态 LED。
 * 原点用绿色、两个终端用黄色，未触发为灭态；由 store 的 sensors 驱动。
 */
export function LimitSensor({ kind, position, on, side = 1 }: {
  kind: 'origin' | 'endMinus' | 'endPlus';
  position: [number, number, number];
  on: boolean;
  side?: 1 | -1;
}) {
  const s = GANTRY_SENSOR;
  const led = on ? (kind === 'origin' ? M.ledOrigin : M.ledEnd) : M.ledOff;
  const bx = side * 0.038;
  return (
    <group position={position} userData={{ sensor: kind }}>
      {/* L 形吊架：水平托臂 + 竖直吊板，把开关连到模组侧面而不是悬空 */}
      <mesh position={[side * 0.02, 0.014, 0]} material={M.dark}>
        <boxGeometry args={[0.04, 0.006, 0.026]} />
      </mesh>
      <mesh position={[bx, 0.006, 0]} material={M.dark}>
        <boxGeometry args={[0.006, 0.03, 0.026]} />
      </mesh>
      <mesh position={[bx, -0.01, 0]} castShadow material={M.sleeve}>
        <boxGeometry args={[s.BODY_W, s.BODY_H, s.BODY_D]} />
      </mesh>
      <mesh position={[bx, -0.01 + s.BODY_H / 2 + GAP, 0]} material={M.decal}>
        <boxGeometry args={[s.BODY_W * 0.8, 0.002, s.BODY_D * 0.8]} />
      </mesh>
      <mesh position={[bx, -0.01, s.BODY_D / 2 + GAP]} material={led}>
        <sphereGeometry args={[s.LED_R, 12, 12]} />
      </mesh>
      <Bolt position={[side * 0.02, 0.018, 0]} r={0.003} h={0.003} />
    </group>
  );
}

/** 象棋棋子：圆柱木/胶件 + 顶面亮银刻字环 + 侧壁刻线 */
export function ChessPieceMesh({ side, held, cell }: {
  side: 'red' | 'black'; held: boolean; cell: number;
}) {
  const body = side === 'red' ? M.pieceRed : M.pieceBlack;
  return (
    <group>
      <mesh castShadow material={body}>
        <cylinderGeometry args={[cell * 0.30, cell * 0.32, 0.022, 36]} />
      </mesh>
      {/* 顶面刻字环：两层同心贴面，不共面 */}
      <mesh position={[0, 0.0115 + GAP, 0]} material={M.pieceFace}>
        <cylinderGeometry args={[cell * 0.24, cell * 0.24, 0.0012, 36]} />
      </mesh>
      <mesh position={[0, 0.0115 + GAP * 2, 0]} material={held ? M.decal : body}>
        <cylinderGeometry args={[cell * 0.19, cell * 0.19, 0.0012, 36]} />
      </mesh>
      {/* 侧壁一圈刻线 */}
      <mesh position={[0, 0.002, 0]} material={M.decalDark}>
        <cylinderGeometry args={[cell * 0.321, cell * 0.321, 0.0012, 36]} />
      </mesh>
    </group>
  );
}

/** 焊接台体：铝银灰整板 + 16 条细 T 槽 + 边框包边 + 角件螺栓 + 四腿 */
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
          <mesh position={[railX / 2, tableH + 0.004 + GAP, z]} material={M.slot}>
            <boxGeometry args={[railX + 0.09, 0.0012, 0.005]} />
          </mesh>
          <mesh position={[railX / 2, tableH + 0.004 + GAP * 2, z]} material={M.decal}>
            <boxGeometry args={[railX + 0.08, 0.0012, 0.0015]} />
          </mesh>
        </group>
      ))}
      {/* 台面四边包边 */}
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

/** 深棕 8x8 棋盘独立小桌：木格 + 暗刻线 + 边框 + 四条细腿 + 黑色地脚 */
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
        <mesh key={`grid-z-${i}`}
          position={[cx, boardY + 0.004 + GAP, boardZ + i * cell]} material={M.boardGrid}>
          <boxGeometry args={[vc * cell, 0.0012, 0.002]} />
        </mesh>
      ))}
      {Array.from({ length: vc + 1 }, (_, i) => (
        <mesh key={`grid-x-${i}`}
          position={[boardX + i * cell, boardY + 0.004 + GAP, cz]} material={M.boardGrid}>
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
