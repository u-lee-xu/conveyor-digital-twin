/**
 * 汇川龙门 XY 象棋分拣 3D 场景。
 *
 * 结构依据 inovance/Inovance.STEP 的真实装配树（77 个 PRODUCT 名称解码后）：
 *   汇川运动控制总图
 *     ├─ 台体_默认<按焊接> / 底板 / 底板2 / 棋盘 / 象棋
 *     ├─ Y轴线性模组-600（GTH12 本体-650 / 滑座 / HG-KR43 伺服 / 光遮断器+感应片）
 *     ├─ 20总装（d20导轨 + d20滑块）+ 导轨固定板   ← 另一侧从动支撑
 *     ├─ X直线模组-450（横跨两侧，带三菱 200W 伺服与滑座）
 *     └─ 气缸总装（气缸 + 气缸活塞杆）+ 气缸固定板 / 气缸吸盘支架 / 吸盘
 *
 * 即「一侧 Y 模组驱动 + 另一侧 D20 导轨从动、X 模组横梁跨在两侧滑座上」的
 * 典型直角坐标龙门，不是四立柱挂两根光杆。Z 气缸装在 X 滑块上。
 *
 * 几何全自建：GLB 的 7 个 mesh 是重复整机、节点名只有 Node0~7，无法按名拆轴。
 * 动画只读取 store 的 position 坐标变量，PLC / 面板 / 三维读数同源。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_AXIS, GANTRY_BOARD } from '../constants/gantryConstants';

/** 视觉放大系数：mm→m 再放大，纯显示用，不改变变量坐标 */
const S = 2;
const toM = (mm: number) => mm * GANTRY_AXIS.MM2M * S;

const RAIL_X = toM(GANTRY_AXIS.X_TRAVEL);
const RAIL_Y = toM(GANTRY_AXIS.Y_TRAVEL);
const CELL = toM(GANTRY_BOARD.CELL_SPACING);
const BOARD_X = toM(GANTRY_BOARD.OFFSET_X);
const BOARD_Z = toM(GANTRY_BOARD.OFFSET_Y);

/** 焊接台体高度、棋盘面、棋子顶面；横梁高度按 Z 行程标定 */
const TABLE_H = 0.16;
const BOARD_Y = TABLE_H + 0.012;
const PIECE_TOP = BOARD_Y + 0.037;
const FRAME_H = 0.52;
const Z_HEAD_BASE = -0.12;
const Z_STROKE_M = toM(GANTRY_AXIS.Z_STROKE);
/** 两端竖立支撑：把 X 模组横梁架到 Y 模组滑座 / D20 滑块上（真实龙门不是悬空横梁） */
const POST_BOTTOM = TABLE_H + 0.09;
const POST_TOP = FRAME_H - 0.031;
const POST_H = POST_TOP - POST_BOTTOM;
const POST_MID = (POST_TOP + POST_BOTTOM) / 2;

const C = {
  frame: '#475569', table: '#334155', tableTop: '#3f4d60',
  module: '#b8c4d2', moduleDark: '#8c9aab', rail: '#64748b',
  slider: '#38bdf8', servo: '#334155', servoCap: '#1e293b',
  cylinder: '#f59e0b', rod: '#cbd5e1', bracket: '#94a3b8',
  cup: '#22d3ee', sensor: '#facc15',
  boardLight: '#e7c9a0', boardDark: '#9a6b42', grid: '#4b3423',
  red: '#dc2626', black: '#1f2937',
};

/** 模组端部伺服（含可转风扇，转速跟随对应轴 speed） */
function Servo({ position, axis, label }: { position: [number, number, number]; axis: 'x' | 'y'; label: string }) {
  const fan = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const s = useGantryStore.getState();
    const speed = axis === 'x' ? s.x.speed : s.y.speed;
    if (fan.current) fan.current.rotation.z += Math.min(dt, 0.05) * speed * 0.02;
  });
  return (
    <group position={position} userData={{ label }}>
      <mesh>
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshStandardMaterial color={C.servo} />
      </mesh>
      <mesh position={[0, 0, 0.038]}>
        <boxGeometry args={[0.05, 0.05, 0.006]} />
        <meshStandardMaterial color={C.servoCap} />
      </mesh>
      <mesh ref={fan} position={[0, 0, 0.043]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.006, 12]} />
        <meshStandardMaterial color={axis === 'x' ? C.slider : C.sensor} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[0.055, 0.012, 0.055]} />
        <meshStandardMaterial color={C.moduleDark} />
      </mesh>
    </group>
  );
}

/** 原点 / 限位：光遮断器固定片 + 感应片 */
function Sensor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.018, 0.026, 0.004]} /><meshStandardMaterial color={C.sensor} /></mesh>
      <mesh position={[0.012, 0, 0]}><boxGeometry args={[0.004, 0.012, 0.012]} /><meshStandardMaterial color={C.moduleDark} /></mesh>
    </group>
  );
}

function ChessPieces() {
  const pieces = useGantryStore((s) => s.pieces);
  return (
    <>
      {pieces.map((p) => (
        <group key={p.id} position={[toM(p.x), BOARD_Y + toM(p.z) + 0.012, toM(p.y)]}>
          <mesh>
            <cylinderGeometry args={[CELL * 0.30, CELL * 0.32, 0.022, 32]} />
            <meshStandardMaterial color={p.side === 'red' ? C.red : C.black} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[CELL * 0.24, CELL * 0.24, 0.003, 32]} />
            <meshStandardMaterial color={p.held ? C.cup : '#f8fafc'} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Chessboard() {
  const cells = [];
  for (let r = 0; r < GANTRY_BOARD.ROWS; r += 1) {
    for (let c = 0; c < GANTRY_BOARD.COLS; c += 1) {
      cells.push(
        <mesh key={`${r}-${c}`} position={[BOARD_X + (c + 0.5) * CELL, BOARD_Y, BOARD_Z + (r + 0.5) * CELL]}>
          <boxGeometry args={[CELL * 0.96, 0.008, CELL * 0.96]} />
          <meshStandardMaterial color={(r + c) % 2 === 0 ? C.boardLight : C.boardDark} />
        </mesh>,
      );
    }
  }
  return <>{cells}</>;
}

/** 焊接台体：四条方管腿 + 上下层框 + 台面板 */
function WeldedTable() {
  const legs: [number, number][] = [[0, 0], [RAIL_X, 0], [0, RAIL_Y], [RAIL_X, RAIL_Y]];
  return (
    <group>
      {legs.map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, TABLE_H / 2, z]}>
          <boxGeometry args={[0.035, TABLE_H, 0.035]} />
          <meshStandardMaterial color={C.frame} />
        </mesh>
      ))}
      {[0, RAIL_X].map((x, i) => (
        <mesh key={`side-${i}`} position={[x, TABLE_H * 0.25, RAIL_Y / 2]}>
          <boxGeometry args={[0.025, 0.025, RAIL_Y]} />
          <meshStandardMaterial color={C.frame} />
        </mesh>
      ))}
      {[0, RAIL_Y].map((z, i) => (
        <mesh key={`end-${i}`} position={[RAIL_X / 2, TABLE_H * 0.25, z]}>
          <boxGeometry args={[RAIL_X, 0.025, 0.025]} />
          <meshStandardMaterial color={C.frame} />
        </mesh>
      ))}
      <mesh position={[RAIL_X / 2, TABLE_H - 0.012, RAIL_Y / 2]}>
        <boxGeometry args={[RAIL_X + 0.1, 0.024, RAIL_Y + 0.1]} />
        <meshStandardMaterial color={C.table} />
      </mesh>
      <mesh position={[RAIL_X / 2, TABLE_H + 0.002, RAIL_Y / 2]}>
        <boxGeometry args={[RAIL_X + 0.06, 0.004, RAIL_Y + 0.06]} />
        <meshStandardMaterial color={C.tableTop} />
      </mesh>
    </group>
  );
}

export function GantrySceneContent() {
  const yBridge = useRef<Group>(null);
  const xSlider = useRef<Group>(null);
  const zHead = useRef<Group>(null);

  useFrame(() => {
    const s = useGantryStore.getState();
    // 机器 Y：X 横梁连同两侧滑座沿 Y 模组 / D20 导轨移动（3D 的 Z 轴）
    if (yBridge.current) yBridge.current.position.z = toM(s.y.position);
    // 机器 X：滑块在 X 模组横梁上移动
    if (xSlider.current) xSlider.current.position.x = toM(s.x.position);
    // 机器 Z：气缸活塞杆 + 吸盘头下降
    if (zHead.current) zHead.current.position.y = Z_HEAD_BASE - toM(s.z);
  });

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[1.2, 1.8, 0.9]} intensity={1.5} />
      <directionalLight position={[-0.9, 1.1, -0.7]} intensity={0.55} color="#bcd4f0" />
      <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.1} cellColor="#334155" sectionColor="#1d4ed8" fadeDistance={4} infiniteGrid />

      <WeldedTable />
      <Chessboard />
      <ChessPieces />

      {/* Y 轴线性模组-600：左侧驱动侧，铝型材本体 + 端部 HG-KR43 伺服 + 原点感应片 */}
      <group position={[0, TABLE_H + 0.05, 0]}>
        <mesh position={[0, 0, RAIL_Y / 2]}>
          <boxGeometry args={[0.062, 0.062, RAIL_Y]} />
          <meshStandardMaterial color={C.module} />
        </mesh>
        <mesh position={[0, 0.033, RAIL_Y / 2]}>
          <boxGeometry args={[0.03, 0.006, RAIL_Y - 0.02]} />
          <meshStandardMaterial color={C.moduleDark} />
        </mesh>
        <Servo position={[0, 0, RAIL_Y + 0.045]} axis="y" label="Y轴 HG-KR43 伺服" />
        <Sensor position={[0.038, 0.042, 0.03]} />
        <Sensor position={[0.038, 0.042, RAIL_Y - 0.03]} />
      </group>

      {/* 另一侧从动：导轨固定板 + D20 直线导轨 600 */}
      <group position={[RAIL_X, TABLE_H + 0.035, 0]}>
        <mesh position={[0, -0.014, RAIL_Y / 2]}>
          <boxGeometry args={[0.07, 0.02, RAIL_Y]} />
          <meshStandardMaterial color={C.bracket} />
        </mesh>
        <mesh position={[0, 0.012, RAIL_Y / 2]}>
          <boxGeometry args={[0.022, 0.022, RAIL_Y]} />
          <meshStandardMaterial color={C.rail} />
        </mesh>
        <Sensor position={[0.02, 0.03, 0.03]} />
      </group>

      {/* Y 移动组：两侧滑座 + X 直线模组-450 横梁 + X 滑块 + 气缸 + 吸盘 */}
      <group ref={yBridge}>
        <mesh position={[0, TABLE_H + 0.075, 0]}>
          <boxGeometry args={[0.085, 0.035, 0.1]} />
          <meshStandardMaterial color={C.moduleDark} />
        </mesh>
        <mesh position={[RAIL_X, TABLE_H + 0.065, 0]}>
          <boxGeometry args={[0.055, 0.03, 0.075]} />
          <meshStandardMaterial color={C.slider} />
        </mesh>
        {[0, RAIL_X].map((x, i) => (
          <group key={`gantry-post-${i}`} position={[x, 0, -0.045]}>
            {/* 支柱放在滑座后侧，避免 X=0 时挡住 X 滑块上的 Z 气缸与吸盘 */}
            <mesh position={[0, POST_MID, 0]}>
              <boxGeometry args={[0.045, POST_H, 0.05]} />
              <meshStandardMaterial color={C.module} />
            </mesh>
            <mesh position={[0, POST_BOTTOM + 0.035, 0]}>
              <boxGeometry args={[0.07, 0.07, 0.07]} />
              <meshStandardMaterial color={C.moduleDark} />
            </mesh>
            {/* 顶部连接块：支柱 -> X 模组横梁 */}
            <mesh position={[0, POST_TOP, 0.045]}>
              <boxGeometry args={[0.05, 0.035, 0.09]} />
              <meshStandardMaterial color={C.moduleDark} />
            </mesh>
          </group>
        ))}

        <mesh position={[RAIL_X / 2, FRAME_H, 0]}>
          <boxGeometry args={[RAIL_X, 0.062, 0.062]} />
          <meshStandardMaterial color={C.module} />
        </mesh>
        <mesh position={[RAIL_X / 2, FRAME_H + 0.033, 0]}>
          <boxGeometry args={[RAIL_X - 0.02, 0.006, 0.03]} />
          <meshStandardMaterial color={C.moduleDark} />
        </mesh>
        <Servo position={[RAIL_X + 0.045, FRAME_H, 0]} axis="x" label="X轴 三菱200W 伺服" />
        <Sensor position={[0.03, FRAME_H + 0.04, 0.04]} />
        <Sensor position={[RAIL_X - 0.03, FRAME_H + 0.04, 0.04]} />

        <group ref={xSlider} position={[0, FRAME_H, 0]}>
          <mesh position={[0, -0.03, 0]}>
            <boxGeometry args={[0.085, 0.05, 0.085]} />
            <meshStandardMaterial color={C.slider} />
          </mesh>
          <mesh position={[0, -0.062, 0]}>
            <boxGeometry args={[0.075, 0.008, 0.07]} />
            <meshStandardMaterial color={C.bracket} />
          </mesh>
          <mesh position={[0, -0.092, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.055, 16]} />
            <meshStandardMaterial color={C.cylinder} />
          </mesh>

          <group ref={zHead} position={[0, Z_HEAD_BASE, 0]}>
            {/* 活塞杆：从缸体底端连续伸到吸盘支架，不出现断裂 */}
            <mesh position={[0, -0.028, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.06, 12]} />
              <meshStandardMaterial color={C.rod} />
            </mesh>
            <mesh position={[0, -0.058, 0]}>
              <boxGeometry args={[0.06, 0.008, 0.05]} />
              <meshStandardMaterial color={C.bracket} />
            </mesh>
            <mesh position={[0, -0.075, 0]}>
              <coneGeometry args={[0.032, 0.032, 20]} />
              <meshStandardMaterial color={C.cup} transparent opacity={0.9} />
            </mesh>
          </group>
        </group>
      </group>

      {/* 棋盘格线 */}
      {Array.from({ length: GANTRY_BOARD.ROWS + 1 }, (_, i) => (
        <mesh key={`gx-${i}`} position={[BOARD_X + (GANTRY_BOARD.COLS * CELL) / 2, BOARD_Y + 0.005, BOARD_Z + i * CELL]}>
          <boxGeometry args={[GANTRY_BOARD.COLS * CELL, 0.001, 0.002]} />
          <meshStandardMaterial color={C.grid} />
        </mesh>
      ))}
      {Array.from({ length: GANTRY_BOARD.COLS + 1 }, (_, i) => (
        <mesh key={`gz-${i}`} position={[BOARD_X + i * CELL, BOARD_Y + 0.005, BOARD_Z + (GANTRY_BOARD.ROWS * CELL) / 2]}>
          <boxGeometry args={[0.002, 0.001, GANTRY_BOARD.ROWS * CELL]} />
          <meshStandardMaterial color={C.grid} />
        </mesh>
      ))}
      {/* 高度标定记录：吸盘下降 Z_STROKE 后底面贴近棋子顶面，供自检核对 */}
      <group visible={false} userData={{
        suctionBottomUp: FRAME_H + Z_HEAD_BASE - 0.091,
        suctionBottomDown: FRAME_H + Z_HEAD_BASE - 0.091 - Z_STROKE_M,
        pieceTop: PIECE_TOP,
      }} />
    </>
  );
}
