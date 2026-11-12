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
 * 典型直角坐标龙门，Z 气缸装在 X 滑块上。
 *
 * 建模标准对齐自动配药 / 传送带场景：
 *   - 材质走 scenes/shared/gantryMaterials.ts 单例（metalness / roughness 分层），
 *     颜色展开自 @digital-twin/shared 的 INDUSTRIAL_VISUAL；
 *   - 零件走 scenes/shared/GantryParts.tsx 复用组件：铝挤型带 T 槽 + 端盖 +
 *     等距螺栓，线性模组带亮银导轨与滚珠丝杆，伺服带散热筋与接线盒，
 *     笔形气缸带双导杆与黄铜接头，黑色波纹吸盘分层，棋子带刻字环；
 *   - 贴面统一 GAP 错开 + polygonOffset，castShadow / receiveShadow 到位。
 *
 * 按用户要求做减法：坦克链、浅绿支撑柱、原点感应片、伺服彩色风扇、
 * HMI 屏盒、PLC 按钮板、绿色接线端子与青色软管均已移除。
 *
 * 动画只读取 store 的 position 坐标变量，PLC / 面板 / 三维读数同源。
 * 教学落点仍是 3x3（A1~C3），视觉棋盘 8x8，落点落在左上 3x3 区。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { Group } from 'three';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_AXIS, GANTRY_BOARD, GANTRY_VISUAL, GANTRY_SENSOR } from '../constants/gantryConstants';
import { M, GAP } from './shared/gantryMaterials';
import {
  Profile, LinearModule, ServoHousing, PenCylinder, SuctionHead,
  ChessPieceMesh, WeldedTable, ChessboardTable, Bolt, LimitSensor,
} from './shared/GantryParts';

const L = GANTRY_VISUAL.SCENE_LIGHTING;

/** 视觉放大系数：mm→m 再放大，纯显示用，不改变变量坐标 */
const S = 2;
const toM = (mm: number) => mm * GANTRY_AXIS.MM2M * S;

const RAIL_X = toM(GANTRY_AXIS.X_TRAVEL);
const RAIL_Y = toM(GANTRY_AXIS.Y_TRAVEL);
const CELL = toM(GANTRY_BOARD.CELL_SPACING);
const BOARD_X = toM(GANTRY_BOARD.OFFSET_X);
const BOARD_Z = toM(GANTRY_BOARD.OFFSET_Y);

/** 台体高度、棋盘面、棋子顶面；横梁高度按 Z 行程标定 */
const TABLE_H = 0.16;
const BOARD_Y = TABLE_H + 0.028;
const PIECE_TOP = BOARD_Y + 0.037;
const FRAME_H = 0.52;
const Z_HEAD_BASE = -0.104;
const Z_STROKE_M = toM(GANTRY_AXIS.Z_STROKE);
/** 两端竖立支撑：把 X 模组横梁架到 Y 模组滑座 / D20 滑块上 */
const POST_BOTTOM = TABLE_H + 0.09;
const POST_TOP = FRAME_H - 0.031;
const POST_H = POST_TOP - POST_BOTTOM;
const POST_MID = (POST_TOP + POST_BOTTOM) / 2;

function ChessPieces() {
  const pieces = useGantryStore((s) => s.pieces);
  return (
    <>
      {pieces.map((p) => (
        <group key={p.id} position={[toM(p.x), BOARD_Y + toM(p.z) + 0.012, toM(p.y)]}>
          <ChessPieceMesh side={p.side} held={p.held} cell={CELL} />
        </group>
      ))}
    </>
  );
}

/** Y 模组上的 3 个接近开关：1 原点（左/绿）+ 2 终端限位（右/黄） */
function AxisSensors({ sensorY }: { sensorY: number }) {
  const sensors = useGantryStore((s) => s.sensors);
  const s = GANTRY_SENSOR;
  return (
    <>
      <LimitSensor kind="origin" side={-1} on={sensors.origin}
        position={[-s.SIDE_X, sensorY, toM(s.ORIGIN_MM)]} />
      <LimitSensor kind="endMinus" side={1} on={sensors.endMinus}
        position={[s.SIDE_X, sensorY, toM(s.END_MINUS_MM)]} />
      <LimitSensor kind="endPlus" side={1} on={sensors.endPlus}
        position={[s.SIDE_X, sensorY, toM(s.END_PLUS_MM)]} />
    </>
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
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.keyPosition} intensity={L.key} castShadow />
      <directionalLight position={L.fillPosition} intensity={L.fill} color={L.fillColor} />
      <Grid position={[0, -0.002, 0]} args={[4, 4]} cellSize={0.1} cellColor="#334155" sectionColor="#1d4ed8" fadeDistance={4} infiniteGrid />

      {/* 焊接台体（铝银灰整板 + 细 T 槽线）与深棕多格棋盘独立小桌 */}
      <WeldedTable railX={RAIL_X} railY={RAIL_Y} tableH={TABLE_H} />
      <ChessboardTable boardX={BOARD_X} boardZ={BOARD_Z} cell={CELL} boardY={BOARD_Y} tableH={TABLE_H} />
      <ChessPieces />

      {/* Y 轴线性模组-600：左侧驱动侧，端部 HG-KR43 伺服 + 3 个接近开关 */}
      <LinearModule length={RAIL_Y} axis="z" position={[0, TABLE_H + 0.05, RAIL_Y / 2]} />
      <ServoHousing position={[0, TABLE_H + 0.05, RAIL_Y + 0.045]} axis="z" label="Y轴 HG-KR43 伺服" />
      <AxisSensors sensorY={TABLE_H + 0.05} />

      {/* 另一侧从动：导轨固定板 + D20 直线导轨 600 */}
      <mesh position={[RAIL_X, TABLE_H + 0.02, RAIL_Y / 2]} material={M.base}>
        <boxGeometry args={[0.07, 0.02, RAIL_Y]} />
      </mesh>
      <Profile length={RAIL_Y} section={0.026} axis="z" position={[RAIL_X, TABLE_H + 0.047, RAIL_Y / 2]} bolts={false} />
      <mesh position={[RAIL_X, TABLE_H + 0.066, RAIL_Y / 2]} material={M.silver}>
        <boxGeometry args={[0.009, 0.004, RAIL_Y - 0.03]} />
      </mesh>

      {/* Y 移动组：两侧滑座 + X 直线模组-450 横梁 + X 滑块 + 气缸 + 吸盘 */}
      <group ref={yBridge}>
        {/* 左：Y 模组滑座；右：d20 滑块 */}
        <mesh position={[0, TABLE_H + 0.078, 0]} castShadow material={M.slider}>
          <boxGeometry args={[0.09, 0.04, 0.105]} />
        </mesh>
        <mesh position={[RAIL_X, TABLE_H + 0.075, 0]} castShadow material={M.slider}>
          <boxGeometry args={[0.06, 0.035, 0.08]} />
        </mesh>
        {[-1, 1].map((s) => (
          <Bolt key={`slide-bolt-${s}`} position={[0, TABLE_H + 0.1, s * 0.035]} r={0.004} h={0.004} />
        ))}

        {/* 两端宽立板端座：实物里 X 横梁两端是坐在 Y 滑座上的白色宽板/连接座，
            不是后侧一根细柱 + 黑色方块。整体放在滑座后缘，向 +Z 伸出法兰托住横梁，
            与 z=0 的包梁式 X 滑块在深度上分离，X=0 时也不重叠。 */}
        {[0, RAIL_X].map((x, i) => (
          <group key={`gantry-end-support-${i}`} position={[x, 0, -0.075]}>
            <mesh position={[0, POST_MID, 0]} castShadow receiveShadow material={M.base}>
              <boxGeometry args={[0.085, POST_H, 0.05]} />
            </mesh>
            {/* 下连滑座、上托横梁的两块亮银法兰，颜色与结构件一致，不用黑块 */}
            <mesh position={[0, POST_BOTTOM + 0.015, 0.0375]} material={M.slider}>
              <boxGeometry args={[0.09, 0.03, 0.075]} />
            </mesh>
            <mesh position={[0, POST_TOP, 0.0375]} material={M.endCap}>
              <boxGeometry args={[0.09, 0.014, 0.075]} />
            </mesh>
            {[-1, 1].map((s) => (
              <Bolt key={`end-bolt-${s}`} position={[s * 0.028, POST_TOP + 0.008, 0.0375]} r={0.004} h={0.003} />
            ))}
          </group>
        ))}

        {/* X 模组横梁 + 三菱 200W 伺服 */}
        <LinearModule length={RAIL_X} axis="x" position={[RAIL_X / 2, FRAME_H, 0]} />
        <ServoHousing position={[RAIL_X + 0.045, FRAME_H, 0]} axis="x" label="X轴 三菱200W 伺服" />

        {/* X 滑块：包住横梁的单一滑座，Z 气缸 / 吸盘都在同一条 z=0 轴线上，
            不再用「前侧大立板 + 下方水平板」两块分离件造成错位。 */}
        <group ref={xSlider} position={[0, FRAME_H, 0]}>
          <mesh castShadow receiveShadow material={M.slider}>
            <boxGeometry args={[0.075, 0.062, 0.09]} />
          </mesh>
          <mesh position={[0, 0.031 + GAP, 0]} material={M.decal}>
            <boxGeometry args={[0.06, 0.0012, 0.07]} />
          </mesh>
          {[-1, 1].map((sx) => [-1, 1].map((sz) => (
            <Bolt key={`carriage-${sx}-${sz}`} position={[sx * 0.025, 0.032 + GAP * 2, sz * 0.03]} r={0.0035} h={0.003} />
          )))}
          <mesh position={[0, -0.055, 0]} material={M.endCap}>
            <boxGeometry args={[0.055, 0.012, 0.06]} />
          </mesh>
          <PenCylinder position={[0, -0.092, 0]} />
          <group ref={zHead} position={[0, Z_HEAD_BASE, 0]}>
            <SuctionHead />
          </group>
        </group>
      </group>

      {/* 高度标定记录：吸盘下降 Z_STROKE 后底面贴近棋子顶面，供自检核对 */}
      <group visible={false} userData={{
        suctionBottomUp: FRAME_H + Z_HEAD_BASE - 0.091,
        suctionBottomDown: FRAME_H + Z_HEAD_BASE - 0.091 - Z_STROKE_M,
        pieceTop: PIECE_TOP,
      }} />
    </>
  );
}
