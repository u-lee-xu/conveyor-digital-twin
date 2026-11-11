/**
 * 汇川龙门 XY 象棋分拣 3D 场景。
 *
 * 全部几何自建（不加载 Inovance.glb），结构与旧 inovance-control 的
 * GantryModel / Chessboard 一致：底座棋盘格、XY 直角坐标横梁与滑块、
 * 滑块上的 Z 气缸与吸盘、棋盘上的象棋棋子。
 *
 * 动画联动只读取 store 的 position 坐标变量（x.position / y.position / z），
 * 不在 3D 里另算位置，保证「PLC / 面板 / 三维读数同源」。
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

/** 横梁高度：让 Z 气缸下降 Z_STROKE 后吸盘底面正好贴住棋子顶面，不悬空也不穿模 */
const FRAME_H = toM(170);
const BOARD_Y = 0.012;
const RAIL_X = toM(GANTRY_AXIS.X_TRAVEL);
const RAIL_Y = toM(GANTRY_AXIS.Y_TRAVEL);
const CELL = toM(GANTRY_BOARD.CELL_SPACING);
const BOARD_X = toM(GANTRY_BOARD.OFFSET_X);
const BOARD_Z = toM(GANTRY_BOARD.OFFSET_Y);

const COLORS = {
  frame: '#64748b', rail: '#94a3b8', slider: '#38bdf8', cylinder: '#f59e0b',
  cup: '#22d3ee', boardLight: '#e7c9a0', boardDark: '#9a6b42', grid: '#4b3423',
  red: '#dc2626', black: '#1f2937', servo: '#334155', shaft: '#cbd5e1',
};

function Servo({ position, axis }: { position: [number, number, number]; axis: 'x' | 'y' }) {
  const fan = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const s = useGantryStore.getState();
    const speed = axis === 'x' ? s.x.speed : s.y.speed;
    if (fan.current) fan.current.rotation.z += Math.min(dt, 0.05) * speed * 0.02;
  });
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.07, 0.07, 0.07]} /><meshStandardMaterial color={COLORS.servo} /></mesh>
      <mesh ref={fan} position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.008, 12]} />
        <meshStandardMaterial color={axis === 'x' ? COLORS.slider : COLORS.servo} />
      </mesh>
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
            <meshStandardMaterial color={p.side === 'red' ? COLORS.red : COLORS.black} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[CELL * 0.24, CELL * 0.24, 0.003, 32]} />
            <meshStandardMaterial color={p.held ? COLORS.cup : '#f8fafc'} />
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
          <meshStandardMaterial color={(r + c) % 2 === 0 ? COLORS.boardLight : COLORS.boardDark} />
        </mesh>,
      );
    }
  }
  return <>{cells}</>;
}

export function GantrySceneContent() {
  const yBridge = useRef<Group>(null);
  const xSlider = useRef<Group>(null);
  const zHead = useRef<Group>(null);

  useFrame(() => {
    const s = useGantryStore.getState();
    // Y 轴：整根 X 横梁沿机器 Y（3D 的 Z）移动
    if (yBridge.current) yBridge.current.position.z = toM(s.y.position);
    // X 轴：滑块在横梁上沿机器 X 移动
    if (xSlider.current) xSlider.current.position.x = toM(s.x.position);
    // Z 气缸：下降量为正，向下（-Y）
    if (zHead.current) zHead.current.position.y = -toM(s.z);
  });

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[1.2, 1.8, 0.9]} intensity={1.5} />
      <directionalLight position={[-0.9, 1.1, -0.7]} intensity={0.55} color="#bcd4f0" />
      <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.1} cellColor="#334155" sectionColor="#1d4ed8" fadeDistance={4} infiniteGrid />

      {/* 底座 + 棋盘格 */}
      <mesh position={[RAIL_X / 2, -0.006, RAIL_Y / 2]}>
        <boxGeometry args={[RAIL_X + 0.12, 0.02, RAIL_Y + 0.12]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <Chessboard />
      <ChessPieces />

      {/* 四角立柱 + 两条 Y 导轨 */}
      {[[0, 0], [RAIL_X, 0], [0, RAIL_Y], [RAIL_X, RAIL_Y]].map(([x, z], i) => (
        <mesh key={`post-${i}`} position={[x, FRAME_H / 2, z]}>
          <boxGeometry args={[0.024, FRAME_H, 0.024]} />
          <meshStandardMaterial color={COLORS.frame} />
        </mesh>
      ))}
      {[0, RAIL_X].map((x, i) => (
        <mesh key={`yrail-${i}`} position={[x, FRAME_H, RAIL_Y / 2]}>
          <boxGeometry args={[0.026, 0.026, RAIL_Y]} />
          <meshStandardMaterial color={COLORS.rail} />
        </mesh>
      ))}
      <Servo position={[0, FRAME_H + 0.055, RAIL_Y]} axis="y" />

      {/* Y 移动组：X 横梁 + X 滑块 + Z 气缸 + 吸盘 */}
      <group ref={yBridge}>
        <mesh position={[RAIL_X / 2, FRAME_H, 0]}>
          <boxGeometry args={[RAIL_X, 0.03, 0.03]} />
          <meshStandardMaterial color={COLORS.rail} />
        </mesh>
        <Servo position={[RAIL_X, FRAME_H + 0.055, 0]} axis="x" />

        <group ref={xSlider} position={[0, FRAME_H, 0]}>
          <mesh position={[0, -0.024, 0]}>
            <boxGeometry args={[0.075, 0.045, 0.075]} />
            <meshStandardMaterial color={COLORS.slider} />
          </mesh>
          {/* 气缸缸体 */}
          <mesh position={[0, -0.075, 0]}>
            <cylinderGeometry args={[0.021, 0.021, 0.085, 16]} />
            <meshStandardMaterial color={COLORS.cylinder} />
          </mesh>
          {/* Z 运动头：活塞杆 + 吸盘 */}
          <group ref={zHead}>
            <mesh position={[0, -0.145, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.075, 12]} />
              <meshStandardMaterial color={COLORS.shaft} />
            </mesh>
            <mesh position={[0, -0.188, 0]}>
              <coneGeometry args={[0.032, 0.032, 20]} />
              <meshStandardMaterial color={COLORS.cup} transparent opacity={0.9} />
            </mesh>
          </group>
        </group>
      </group>

      {/* 棋盘格线（细线勾边） */}
      {Array.from({ length: GANTRY_BOARD.ROWS + 1 }, (_, i) => (
        <mesh key={`gx-${i}`} position={[BOARD_X + (GANTRY_BOARD.COLS * CELL) / 2, BOARD_Y + 0.005, BOARD_Z + i * CELL]}>
          <boxGeometry args={[GANTRY_BOARD.COLS * CELL, 0.001, 0.002]} />
          <meshStandardMaterial color={COLORS.grid} />
        </mesh>
      ))}
      {Array.from({ length: GANTRY_BOARD.COLS + 1 }, (_, i) => (
        <mesh key={`gz-${i}`} position={[BOARD_X + i * CELL, BOARD_Y + 0.005, BOARD_Z + (GANTRY_BOARD.ROWS * CELL) / 2]}>
          <boxGeometry args={[0.002, 0.001, GANTRY_BOARD.ROWS * CELL]} />
          <meshStandardMaterial color={COLORS.grid} />
        </mesh>
      ))}
    </>
  );
}
