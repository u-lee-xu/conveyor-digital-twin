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
  LIQUID_PART_STAGE_ORIGIN, LIQUID_VIEW_PRESETS, TANK_IDS, type LiquidPartKind,
} from '../constants/liquidConstants';
import { useLiquidStore } from '../stores/useLiquidStore';
import { useLiquidViewStore } from '../stores/useLiquidViewStore';
import { GAP, applyLiquidProceduralTextures } from './shared/liquidMaterials';
import {
  TankAssembly, Agitator, BallValve, PumpUnit, PipeRun, PlatformFrame, LiquidCameraRig,
  TankShell, LiquidColumn, SightWindow, ScaleRule, ReadoutPlate, TowerLamp,
  type Vec3,
} from './components/LiquidParts';
import { OperatorCabinet } from './components/OperatorCabinet';

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

/** 四罐包围盒：所有近景设备落点由它派生，不写裸坐标 */
const ALL_TANKS = [TA, TB, TM, TP];
const TANK_X_MAX = Math.max(...ALL_TANKS.map((t) => t.position[0] + t.radius));
const TANK_Z_MID = (
  Math.min(...ALL_TANKS.map((t) => t.position[2] - t.radius))
  + Math.max(...ALL_TANKS.map((t) => t.position[2] + t.radius))
) / 2;

/**
 * 操作台开关柜落点：机架右侧、罐体纵向中部的地面，柜脚落地、门板转向观察者。
 * 控制柜是要走到跟前按按钮的设备，必须放在观察者一侧——原来缩在机架右后角地面，
 * 默认机位下离得远又小；现在整组前移到近景，柜面元件第一眼就能看清。
 * x 退到罐体最右之外（与台面边缘留 PIPE_R 以上净距），z 收到罐体纵向中部，
 * 与成品罐、台面都不相交；门板朝向取整机默认机位，保证默认视图正对柜面。
 */
const CABINET_X = TANK_X_MAX + G.PIPE_R * 13;
const CABINET_Z = TANK_Z_MID + G.PIPE_R * 6;
const CABINET_ROT_Y = Math.atan2(
  LIQUID_VIEW_PRESETS.overview.position[0] - CABINET_X,
  LIQUID_VIEW_PRESETS.overview.position[2] - CABINET_Z,
);

/**
 * 三色灯塔落点：柜体左前方的地面，比柜体更靠观察者一侧。
 * 三色灯是「给人看」的信号件，藏在机架后角等于没装；挪到近景并与柜体并排，
 * 两者在默认机位下同处画面下方，互不遮挡、也不压住任何罐体视窗。
 */
const LAMP_X = TANK_X_MAX + G.PIPE_R * 6;
const LAMP_Z = CABINET_Z + G.PIPE_R * 21;
/** 灯塔已随柜体移出机架，底面直接落在车间地面 */
const LAMP_Y = 0;

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
      {/* 三色灯塔：柜体左前方地面近景，绿 / 黄 / 红灯罩由 PLC 三个线圈或手动面板控制 */}
      <group position={[LAMP_X, LAMP_Y, LAMP_Z]}><TowerLamp /></group>
      {/* 操作台开关柜：柜脚落地，五个点动按钮 + 手自动旋钮 + 三盏指示灯（镜像塔灯） */}
      <group position={[CABINET_X, 0, CABINET_Z]} rotation={[0, CABINET_ROT_Y, 0]}>
        <OperatorCabinet />
      </group>
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
    case 'cabinet':
      // 1:1 展台：按钮 / 旋钮 / 指示灯 / 铭牌都能近距逐个核对，与整机同一组件
      return <OperatorCabinet />;
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
