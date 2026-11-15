/**
 * 液体混装场景：纯组装层 + 机位 / 部件展台短路（与汇川龙门同款）。
 *
 * 只做「按表摆放 + 绑定真值」，部件几何在 scenes/components/LiquidParts.tsx，
 * 材质在 scenes/shared/liquidMaterials.ts，视图状态在 stores/useLiquidViewStore.ts。
 *
 * ?view=<key> 切整机机位，?stage=<kind> 切 1:1 部件展台；展台复用同一批组件、
 * 居中于自身局部原点 + 标尺网格 + 专用近景相机，切换不刷新页面、不改设备真值。
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Grid } from '@react-three/drei';
import {
  LIQUID_VISUAL as V, LIQUID_TANKS, LIQUID_GEOM as G, LIQUID_PART_STAGES,
  LIQUID_PART_STAGE_ORIGIN, TANK_IDS, type LiquidPartKind,
} from '../constants/liquidConstants';
import { useLiquidStore } from '../stores/useLiquidStore';
import { useLiquidViewStore } from '../stores/useLiquidViewStore';
import { GAP, applyLiquidProceduralTextures } from './shared/liquidMaterials';
import {
  TankAssembly, Agitator, BallValve, PumpUnit, PipeRun, PlatformFrame, LiquidCameraRig,
  TankShell, LiquidColumn, SightWindow, ScaleRule, ReadoutPlate,
  type Vec3,
} from './components/LiquidParts';

const L = V.SCENE_LIGHTING;
const TA = LIQUID_TANKS.a;
const TB = LIQUID_TANKS.b;
const TM = LIQUID_TANKS.mix;
const TP = LIQUID_TANKS.product;

/* 管路走向全部由 LIQUID_TANKS / LIQUID_GEOM 派生，无裸尺寸数字 */
const FEED_Y = TA.baseY + G.PIPE_R * 2;
const RISER_Y = TM.baseY + TM.height + G.PIPE_R * 5;
const RISER_OUT_Y = TP.baseY + TP.height + G.PIPE_R * 5;
const MIX_IN_Z = TM.radius * 0.6;
const MIX_TOP_Y = TM.baseY + TM.height;
const PRODUCT_TOP_Y = TP.baseY + TP.height;

const pumpXA = TA.position[0] + TA.radius + G.PIPE_R * 6;
const valveXA = pumpXA + G.PUMP_R * 3;
const pumpXB = TB.position[0] + TB.radius + G.PIPE_R * 6;
const valveXB = pumpXB + G.PUMP_R * 3;
const dischargeValveX = (TM.position[0] + TP.position[0]) / 2;

/** A 罐底 → 泵 → 进料球阀 → 上升 → 混合罐顶（B 路镜像 z） */
const PIPE_A: Vec3[] = [
  [TA.position[0] + TA.radius + GAP, FEED_Y, TA.position[2]],
  [pumpXA, FEED_Y, TA.position[2]],
  [valveXA, FEED_Y, TA.position[2]],
  [valveXA, RISER_Y, TA.position[2]],
  [TM.position[0], RISER_Y, -MIX_IN_Z],
  [TM.position[0], MIX_TOP_Y + GAP, -MIX_IN_Z],
];
const PIPE_B: Vec3[] = [
  [TB.position[0] + TB.radius + GAP, FEED_Y, TB.position[2]],
  [pumpXB, FEED_Y, TB.position[2]],
  [valveXB, FEED_Y, TB.position[2]],
  [valveXB, RISER_Y, TB.position[2]],
  [TM.position[0], RISER_Y, MIX_IN_Z],
  [TM.position[0], MIX_TOP_Y + GAP, MIX_IN_Z],
];
/** 混合罐底 → 出料球阀 → 上升 → 成品罐顶 */
const PIPE_OUT: Vec3[] = [
  [TM.position[0] + TM.radius + GAP, FEED_Y, 0],
  [dischargeValveX, FEED_Y, 0],
  [dischargeValveX, RISER_OUT_Y, 0],
  [TP.position[0], RISER_OUT_Y, 0],
  [TP.position[0], PRODUCT_TOP_Y + GAP, 0],
];
/** 展台管路：1:1 局部尺度的一小段折线 */
const STAGE_PIPE: Vec3[] = [
  [0, 0, 0],
  [G.PUMP_R * 4, 0, 0],
  [G.PUMP_R * 4, G.PUMP_R * 4, 0],
  [G.PUMP_R * 8, G.PUMP_R * 4, 0],
];

/** 整机装配视图 */
function AssembledScene() {
  const valveA = useLiquidStore((s) => s.outputs.valveA);
  const valveB = useLiquidStore((s) => s.outputs.valveB);
  const discharge = useLiquidStore((s) => s.outputs.discharge);
  return (
    <group>
      <Grid position={[0, -GAP, 0]} args={[4, 4]} cellSize={0.1}
        cellColor={V.STRUCT_COLOR} sectionColor={V.LIQUID_A}
        fadeDistance={4} infiniteGrid />
      <PlatformFrame />
      {/* 四罐：五件液位可视要素齐备，体积 / 去皮 / 配比全从 useLiquidStore 读 */}
      {TANK_IDS.map((t) => (
        <group key={t} position={LIQUID_TANKS[t].position}>
          <TankAssembly tank={t} />
        </group>
      ))}
      {/* 混合罐顶搅拌器 */}
      <group position={TM.position}><Agitator /></group>
      {/* 两路进料泵 / 球阀 + 混合罐底出料球阀 */}
      <group position={[pumpXA, FEED_Y, TA.position[2]]}><PumpUnit /></group>
      <group position={[pumpXB, FEED_Y, TB.position[2]]}><PumpUnit /></group>
      <group position={[valveXA, FEED_Y, TA.position[2]]}><BallValve open={valveA} /></group>
      <group position={[valveXB, FEED_Y, TB.position[2]]}><BallValve open={valveB} /></group>
      <group position={[dischargeValveX, FEED_Y, 0]}><BallValve open={discharge} /></group>
      {/* 管路：圆柱拼接 + 拐点球接头 */}
      <PipeRun points={PIPE_A} supports />
      <PipeRun points={PIPE_B} supports />
      <PipeRun points={PIPE_OUT} supports />
    </group>
  );
}

/** 部件展台裸视图：与整机复用同一批组件，不套装配位姿 */
function renderBarePart(kind: LiquidPartKind, valveOpen: boolean): ReactNode {
  switch (kind) {
    case 'tank':
      return <TankAssembly tank="a" />;
    case 'window':
      return (
        <>
          <TankShell tank="a" />
          <LiquidColumn tank="a" />
          <SightWindow tank="a" />
          <ScaleRule tank="a" />
          <ReadoutPlate tank="a" />
        </>
      );
    case 'agitator':
      return <Agitator />;
    case 'valve':
      // 展台跟随 A 进料阀真值：手动模式点阀即可在放大视图里直观看开关色与手柄角度
      return <BallValve open={valveOpen} />;
    case 'pump':
      return <PumpUnit />;
    case 'pipe':
      // 展台与整机同源：管卡 / 拐点法兰环 / 立管支架都要在放大视图里可见
      return <PipeRun points={STAGE_PIPE} supports />;
    default:
      return null;
  }
}

/** 部件展台：1:1 真实尺度 + 标尺网格，居中于自身局部原点 */
function PartStageView({ kind }: { kind: LiquidPartKind }) {
  const stage = LIQUID_PART_STAGES[kind];
  const valveOpen = useLiquidStore((s) => s.outputs.valveA);
  return (
    <group userData={{ part: kind, origin: LIQUID_PART_STAGE_ORIGIN[kind], scale: 1 }}>
      <gridHelper
        args={[stage.grid, Math.round(stage.grid / 0.1), '#94a3b8', '#475569']}
        position={[0, stage.gridY, 0]}
      />
      {renderBarePart(kind, valveOpen)}
    </group>
  );
}

export function LiquidSceneContent() {
  // 惰性烘焙程序化金属拉丝纹理：只在首次渲染挂载一次（幂等）
  useMemo(() => { applyLiquidProceduralTextures(); return true; }, []);
  const activeStage = useLiquidViewStore((s) => s.activeStage);
  return (
    <>
      {/* 三点布光：环境光 + 暖白主光 + 冷蓝补光，参数取 LIQUID_VISUAL.SCENE_LIGHTING */}
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.keyPosition} intensity={L.key} castShadow />
      <directionalLight position={L.fillPosition} intensity={L.fill} color={L.fillColor} />
      <LiquidCameraRig />
      {activeStage ? <PartStageView kind={activeStage} /> : <AssembledScene />}
    </>
  );
}
