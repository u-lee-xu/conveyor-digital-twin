/**
 * 汇川龙门 XY 象棋分拣 —— 纯组装层。
 *
 * 部件已按配药项目的组织方式拆到 src/scenes/gantry/components/ 下逐个设计完善：
 *   IndustrialProfile / LinearModule / EndSupport / Carriage / ZAxisAssembly /
 *   SensorSet / WeldedTable / ChessboardTable / ChessPieceMesh。
 * 尺寸单一来源在 gantryConstants.ts（*_DETAIL 与 GANTRY_SENSOR），材质在
 * scenes/shared/gantryMaterials.ts，程序化纹理在 proceduralTextures.ts。
 *
 * 结构依据 Inovance.STEP 装配树：焊接台体 + 一侧 Y 轴线性模组-600 驱动 +
 * 一侧 D20 直线导轨从动、X 直线模组-450 横梁跨两侧滑座、
 * 导轨固定板 / 气缸吸盘支架 / 笔形气缸与吸盘装在 X 滑块上。
 * X / Y 两轴各 3 个接近开关（两端限位 + 原点在原点侧限位内侧），
 * 开关由 L 形支架固定在型材 T 槽侧面，金属挡片固定在滑块上随动。
 * Z 活塞杆按行程伸缩，任何位置都不与缸体脱开。
 *
 * 动画只读 store 的 position 坐标变量；PLC / 面板 / 三维读数同源。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { Group } from 'three';
import { useGantryStore } from '../stores/useGantryStore';
import {
  GANTRY_AXIS, GANTRY_BOARD, GANTRY_VISUAL, toViewM,
} from '../constants/gantryConstants';
import { M, applyProceduralTextures } from './shared/gantryMaterials';
import {
  LinearModule, ServoHousing, EndSupport, Carriage, ZAxisAssembly, Z_AXIS_GEOM, ROD_TOP,
  AxisSensorSet, SensorFlag, WeldedTable, ChessboardTable, ChessPieceMesh,
  Profile, Bolt,
} from './gantry/components';

const L = GANTRY_VISUAL.SCENE_LIGHTING;
const RAIL_X = toViewM(GANTRY_AXIS.X_TRAVEL);
const RAIL_Y = toViewM(GANTRY_AXIS.Y_TRAVEL);
const CELL = toViewM(GANTRY_BOARD.CELL_SPACING);
const BOARD_X = toViewM(GANTRY_BOARD.OFFSET_X);
const BOARD_Z = toViewM(GANTRY_BOARD.OFFSET_Y);

const TABLE_H = 0.16;
const BOARD_Y = TABLE_H + 0.028;
const PIECE_TOP = BOARD_Y + 0.037;
const FRAME_H = 0.52;
const Z_STROKE_M = toViewM(GANTRY_AXIS.Z_STROKE);
const POST_BOTTOM = TABLE_H + 0.09;
const POST_TOP = FRAME_H - 0.031;
const POST_H = POST_TOP - POST_BOTTOM;
const POST_MID = (POST_TOP + POST_BOTTOM) / 2;
const Y_MODULE_Y = TABLE_H + 0.05;

function ChessPieces() {
  const pieces = useGantryStore((s) => s.pieces);
  return (
    <>
      {pieces.map((p) => (
        <group key={p.id} position={[toViewM(p.x), BOARD_Y + toViewM(p.z) + 0.012, toViewM(p.y)]}>
          <ChessPieceMesh side={p.side} held={p.held} cell={CELL} />
        </group>
      ))}
    </>
  );
}

export function GantrySceneContent() {
  // 惰性烘焙程序化纹理；?noProcTex=1 仅用于性能 A/B，默认行为不变
  const skipProcTex = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('noProcTex');
  useMemo(() => { if (!skipProcTex) applyProceduralTextures(); return true; }, [skipProcTex]);

  const sensors = useGantryStore((s) => s.sensors);
  const yBridge = useRef<Group>(null);
  const xSlider = useRef<Group>(null);

  useFrame(() => {
    const s = useGantryStore.getState();
    // 机器 Y：X 横梁连同两侧滑座沿 Y 模组 / D20 导轨移动（3D 的 Z 轴）
    if (yBridge.current) yBridge.current.position.z = toViewM(s.y.position);
    // 机器 X：滑块在 X 模组横梁上移动（Z 轴伸缩由 ZAxisAssembly 内部管理）
    if (xSlider.current) xSlider.current.position.x = toViewM(s.x.position);
  });

  return (
    <>
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.keyPosition} intensity={L.key} castShadow />
      <directionalLight position={L.fillPosition} intensity={L.fill} color={L.fillColor} />
      <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.1} cellColor="#334155" sectionColor="#1d4ed8" fadeDistance={4} infiniteGrid />

      {/* 台体 / 棋盘 / 棋子 */}
      <WeldedTable railX={RAIL_X} railY={RAIL_Y} tableH={TABLE_H} />
      <ChessboardTable boardX={BOARD_X} boardZ={BOARD_Z} cell={CELL} boardY={BOARD_Y} tableH={TABLE_H} />
      <ChessPieces />

      {/* Y 轴线性模组-600 + HG-KR43 伺服 + 3 个带固定支架的接近开关 */}
      <LinearModule length={RAIL_Y} axis="z" position={[0, Y_MODULE_Y, RAIL_Y / 2]} />
      <ServoHousing position={[0, Y_MODULE_Y, RAIL_Y + 0.045]} axis="z" label="Y轴 HG-KR43 伺服" />
      <AxisSensorSet axis="z" mountY={Y_MODULE_Y} side={1}
        states={{ origin: sensors.origin, endMinus: sensors.endMinus, endPlus: sensors.endPlus }} />

      {/* 另一侧从动：导轨固定板 + D20 直线导轨 600 */}
      <mesh position={[RAIL_X, TABLE_H + 0.02, RAIL_Y / 2]} material={M.base}>
        <boxGeometry args={[0.07, 0.02, RAIL_Y]} />
      </mesh>
      <Profile length={RAIL_Y} section={0.026} axis="z" position={[RAIL_X, TABLE_H + 0.047, RAIL_Y / 2]} bolts={false} />
      <mesh position={[RAIL_X, TABLE_H + 0.066, RAIL_Y / 2]} material={M.silver}>
        <boxGeometry args={[0.009, 0.004, RAIL_Y - 0.03]} />
      </mesh>

      {/* Y 移动组：两侧滑座 + 端座 + X 模组 + X 轴 3 个传感器 + 随动的 Y 挡片 */}
      <group ref={yBridge}>
        <mesh position={[0, TABLE_H + 0.078, 0]} castShadow material={M.slider}>
          <boxGeometry args={[0.09, 0.04, 0.105]} />
        </mesh>
        <mesh position={[RAIL_X, TABLE_H + 0.075, 0]} castShadow material={M.slider}>
          <boxGeometry args={[0.06, 0.035, 0.08]} />
        </mesh>
        {[-1, 1].map((s) => (
          <Bolt key={`slide-bolt-${s}`} position={[0, TABLE_H + 0.1, s * 0.035]} r={0.004} h={0.004} />
        ))}
        {/* 金属挡片固定在 Y 滑座上，随 Y 移动扫过 3 个开关 */}
        <SensorFlag axis="z" side={1} mountY={Y_MODULE_Y} />

        {[0, RAIL_X].map((x, i) => (
          <EndSupport key={`gantry-end-support-${i}`} x={x}
            postBottom={POST_BOTTOM} postTop={POST_TOP} middle={POST_MID} height={POST_H} />
        ))}

        <LinearModule length={RAIL_X} axis="x" position={[RAIL_X / 2, FRAME_H, 0]} />
        <ServoHousing position={[RAIL_X + 0.045, FRAME_H, 0]} axis="x" label="X轴 三菱200W 伺服" />
        <AxisSensorSet axis="x" mountY={FRAME_H} side={1}
          states={{ origin: sensors.xOrigin, endMinus: sensors.xEndMinus, endPlus: sensors.xEndPlus }} />

        {/* X 滑块（含随动的 X 挡片）+ Z 升降总成 */}
        <group ref={xSlider} position={[0, FRAME_H, 0]}>
          <Carriage />
          <ZAxisAssembly />
        </group>
      </group>

      {/* Z 高度标定：吸盘下降 Z_STROKE 后底面正好贴棋子顶面，供自检核对 */}
      <group visible={false} userData={{
        suctionBottomUp: FRAME_H + Z_AXIS_GEOM.HEAD_BASE - Z_AXIS_GEOM.HEAD_LENGTH,
        suctionBottomDown: FRAME_H + Z_AXIS_GEOM.HEAD_BASE - Z_AXIS_GEOM.HEAD_LENGTH - Z_STROKE_M,
        pieceTop: PIECE_TOP,
        rodTop: FRAME_H + ROD_TOP,
      }} />
    </>
  );
}
