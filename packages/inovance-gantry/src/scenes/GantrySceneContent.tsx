/**
 * 汇川龙门 XY 象棋分拣 —— 纯组装层 + 机位 / 部件展台短路。
 *
 * 部件已按配药项目的组织方式拆到 src/scenes/gantry/components/ 下逐个设计完善；
 * 尺寸单一来源在 gantryConstants.ts（*_DETAIL / GANTRY_SENSOR / VIEW_PRESETS / PART_STAGES），
 * 材质在 scenes/shared/gantryMaterials.ts，视图状态在 stores/useGantryViewStore.ts。
 *
 * ?view=<key> 切整机机位，?stage=<kind> 切 1:1 部件展台（与传送带分拣同款）：
 * 展台复用同一批组件，居中于自身局部原点 + 0.1m 标尺网格 + 专用近景相机，
 * CameraRig 做阻尼过渡，切换不刷新页面也不改设备真值。
 *
 * 结构依据 Inovance.STEP 装配树：焊接台体 + 一侧 Y 轴线性模组驱动 +
 * 一侧 D20 直线导轨从动、X 直线模组横梁跨两侧滑座（两轴等长 500mm）、
 * 导轨固定板 / 气缸吸盘支架 / 笔形气缸与吸盘装在 X 滑块上。
 * X / Y 两轴各 3 个接近开关（两端限位 + 原点在原点侧限位内侧），
 * 开关由 L 形支架固定在型材 T 槽侧面，金属挡片固定在滑块上随动。
 * Z 活塞杆与两根防转导杆都按行程伸缩 / 随动，任何位置都不与缸体脱开。
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { Group } from 'three';
import { useGantryStore } from '../stores/useGantryStore';
import { useGantryViewStore } from '../stores/useGantryViewStore';
import {
  GANTRY_AXIS, GANTRY_BOARD, GANTRY_VISUAL, GANTRY_SENSOR,
  GANTRY_PART_STAGES, GANTRY_PART_STAGE_ORIGIN, toViewM,
  type GantryPartKind,
} from '../constants/gantryConstants';
import { M, applyProceduralTextures } from './shared/gantryMaterials';
import {
  LinearModule, ServoHousing, EndSupport, Carriage, ZAxisAssembly, Z_AXIS_GEOM, ROD_TOP,
  AxisSensorSet, SensorFlag, LimitSensor, WeldedTable, ChessboardTable, ChessPieceMesh,
  Profile, Bolt, GantryCameraRig,
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

/** 整机装配视图 */
function AssembledScene() {
  const sensors = useGantryStore((s) => s.sensors);
  const yBridge = useRef<Group>(null);
  const xSlider = useRef<Group>(null);

  useFrame(() => {
    const s = useGantryStore.getState();
    if (yBridge.current) yBridge.current.position.z = toViewM(s.y.position);
    if (xSlider.current) xSlider.current.position.x = toViewM(s.x.position);
  });

  return (
    <>
      <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.1} cellColor="#334155" sectionColor="#1d4ed8" fadeDistance={4} infiniteGrid />
      <WeldedTable railX={RAIL_X} railY={RAIL_Y} tableH={TABLE_H} />
      <ChessboardTable boardX={BOARD_X} boardZ={BOARD_Z} cell={CELL} boardY={BOARD_Y} tableH={TABLE_H} />
      <ChessPieces />

      {/* Y 轴线性模组 + 伺服 + 3 个带固定支架的接近开关 */}
      <LinearModule length={RAIL_Y} axis="z" position={[0, Y_MODULE_Y, RAIL_Y / 2]} />
      <ServoHousing position={[0, Y_MODULE_Y, RAIL_Y + 0.045]} axis="z" label="Y轴 HG-KR43 伺服" />
      <AxisSensorSet axis="z" mountY={Y_MODULE_Y} side={1}
        states={{ origin: sensors.origin, endMinus: sensors.endMinus, endPlus: sensors.endPlus }} />

      {/* 另一侧从动：导轨固定板 + D20 直线导轨 */}
      <mesh position={[RAIL_X, TABLE_H + 0.02, RAIL_Y / 2]} material={M.base}>
        <boxGeometry args={[0.07, 0.02, RAIL_Y]} />
      </mesh>
      <Profile length={RAIL_Y} section={0.026} axis="z" position={[RAIL_X, TABLE_H + 0.047, RAIL_Y / 2]} bolts={false} />
      <mesh position={[RAIL_X, TABLE_H + 0.066, RAIL_Y / 2]} material={M.silver}>
        <boxGeometry args={[0.009, 0.004, RAIL_Y - 0.03]} />
      </mesh>

      {/* Y 移动组：滑座 + 端座 + X 模组 + X 轴传感器 + 随动挡片 */}
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
        <SensorFlag axis="z" side={1} mountY={Y_MODULE_Y} />

        {[0, RAIL_X].map((x, i) => (
          <EndSupport key={`gantry-end-support-${i}`} x={x}
            postBottom={POST_BOTTOM} postTop={POST_TOP} middle={POST_MID} height={POST_H} />
        ))}

        <LinearModule length={RAIL_X} axis="x" position={[RAIL_X / 2, FRAME_H, 0]} />
        <ServoHousing position={[RAIL_X + 0.045, FRAME_H, 0]} axis="x" label="X轴 三菱200W 伺服" />
        <AxisSensorSet axis="x" mountY={FRAME_H} side={1}
          states={{ origin: sensors.xOrigin, endMinus: sensors.xEndMinus, endPlus: sensors.xEndPlus }} />

        <group ref={xSlider} position={[0, FRAME_H, 0]}>
          <Carriage />
          <ZAxisAssembly />
        </group>
      </group>

      {/* Z 高度标定记录，供自检核对 */}
      <group visible={false} userData={{
        suctionBottomUp: FRAME_H + Z_AXIS_GEOM.HEAD_BASE - Z_AXIS_GEOM.HEAD_LENGTH,
        suctionBottomDown: FRAME_H + Z_AXIS_GEOM.HEAD_BASE - Z_AXIS_GEOM.HEAD_LENGTH - Z_STROKE_M,
        pieceTop: PIECE_TOP,
        rodTop: FRAME_H + ROD_TOP,
      }} />
    </>
  );
}

/** 部件展台：复用同一批组件，放在自身局部原点，1:1 真实尺度 + 0.1m 标尺网格 */
function renderBarePart(kind: GantryPartKind): ReactNode {
  switch (kind) {
    case 'module':
      return (
        <>
          <LinearModule length={0.6} axis="x" position={[0, 0, 0]} />
          <ServoHousing position={[0.34, 0, 0]} axis="x" label="展台 200W 伺服" />
        </>
      );
    case 'carriage':
      return <Carriage />;
    case 'zaxis':
      return <ZAxisAssembly />;
    case 'sensor':
      return (
        <>
          <LimitSensor kind="origin" along={0} axis="x" side={1} on mountY={0} />
          <SensorFlag axis="x" side={1} mountY={0} />
        </>
      );
    case 'endSupport':
      return <EndSupport x={0} postBottom={0.02} postTop={0.45} middle={0.235} height={0.43} />;
    case 'board':
      return <ChessboardTable boardX={-0.32} boardZ={-0.32} cell={CELL} boardY={0} tableH={-0.06} />;
    case 'piece':
      return <ChessPieceMesh side="red" held={false} cell={CELL} />;
    default:
      return null;
  }
}

function PartStageView({ kind }: { kind: GantryPartKind }) {
  const stage = GANTRY_PART_STAGES[kind];
  return (
    <group userData={{ part: kind, origin: GANTRY_PART_STAGE_ORIGIN[kind], scale: 1 }}>
      <gridHelper
        args={[stage.grid, Math.round(stage.grid / 0.1), '#94a3b8', '#475569']}
        position={[0, stage.gridY, 0]}
      />
      {renderBarePart(kind)}
    </group>
  );
}

export function GantrySceneContent() {
  // 惰性烘焙程序化纹理；?noProcTex=1 仅用于性能 A/B，默认行为不变
  const skipProcTex = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('noProcTex');
  useMemo(() => { if (!skipProcTex) applyProceduralTextures(); return true; }, [skipProcTex]);
  const activeStage = useGantryViewStore((s) => s.activeStage);

  return (
    <>
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.keyPosition} intensity={L.key} castShadow />
      <directionalLight position={L.fillPosition} intensity={L.fill} color={L.fillColor} />
      <GantryCameraRig />
      {activeStage ? <PartStageView kind={activeStage} /> : <AssembledScene />}
      <group visible={false} userData={{ sensorsXOriginMm: GANTRY_SENSOR.X_ORIGIN }} />
    </>
  );
}
