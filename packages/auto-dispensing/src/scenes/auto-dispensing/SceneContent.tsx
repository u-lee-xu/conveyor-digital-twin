import { useEffect, useMemo, type ReactNode } from 'react';
import { Physics } from '@react-three/rapier';
import { applyProceduralTextures } from '../../components/scene/shared/materials';
import { isViewerRuntime } from '@digital-twin/shared';
import { PhysicsGround } from '@digital-twin/shared/components/PhysicsGround';
import { useDispensingStore } from '../../stores/useDispensingStore';
import { useAppStore } from '../../stores/useAppStore';
import { CameraRig } from './CameraRig';
import { PhysicsWorld } from './PhysicsWorld';
import { installDispensingDiagnostics } from './diagnostics';
import { PHYSICS } from './physicsGeometry';
import {
  PILL_R, PILL_H, VISUAL, SCENE_SCALE,
  HOPPER_CENTER_Z, HOPPER_OPEN_Y, MAG_TUBE_TOP_Y,
  BIN_TOP_Y, DUMP_LAND_Y,
  DUMP_MOUTH_X, DUMP_MOUTH_Y, DUMP_MOUTH_Z,
  LIGHT_TOWER_X, CABINET_POSITION,
  ASSEMBLY, MAGAZINE_ASSEMBLY, PART_STAGES, SENSOR, SENSOR_WORLD,
  type Vec3, type MagazineId,
} from './constants';
import { MachineFrame, EncoderStage } from './components/MachineFrame';
import { MagazineRack } from './components/MagazineRack';
import { MagazineUnit } from './components/MagazineUnit';
import { SliderHopper } from './components/SliderHopper';
import { CollectBin } from './components/CollectBin';
import { ControlCabinet, LightTower } from './components/ControlCabinet';
import { PhysicsLabel } from './components/PhysicsLabel';

// ============================================================
// 装配层：部件一律通过 Mount 按 ASSEMBLY / MAGAZINE_ASSEMBLY 摆放
// ============================================================

function Mount({ at, children }: { at: Vec3; children: ReactNode }) {
  return <group position={at}>{children}</group>;
}

/** 滑块是唯一位姿随动画变化的部件：X 由 store 覆盖装配表的基准值 */
function SliderMount() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const at = ASSEMBLY.sliderHopper.position;
  return <Mount at={[sliderX, at[1], at[2]]}><SliderHopper /></Mount>;
}

/** 按装配表渲染单个部件（整机 / ?part= 视图共用） */
function renderMountedPart(name: string): ReactNode {
  switch (name) {
    case 'frame': return <Mount at={ASSEMBLY.frame.position}><MachineFrame /></Mount>;
    case 'rack': return <Mount at={ASSEMBLY.magazineRack.position}><MagazineRack /></Mount>;
    case 'unit': return <Mount at={MAGAZINE_ASSEMBLY.A}><MagazineUnit mag="A" /></Mount>;
    case 'hopper': return <SliderMount />;
    case 'bin': return <Mount at={ASSEMBLY.collectBin.position}><CollectBin /></Mount>;
    case 'cabinet': return <Mount at={ASSEMBLY.cabinet.position}><ControlCabinet /></Mount>;
    case 'tower': return <Mount at={ASSEMBLY.lightTower.position}><LightTower /></Mount>;
    default: return null;
  }
}

/** 部件在自身局部坐标下的裸视图（展台专用，不套装配位姿） */
function renderBarePart(name: string): ReactNode {
  switch (name) {
    case 'frame': return <MachineFrame />;
    case 'rack': return <MagazineRack />;
    case 'unit': return <MagazineUnit mag="A" />;
    case 'hopper': return <SliderHopper />;
    case 'bin': return <CollectBin />;
    case 'cabinet': return <ControlCabinet />;
    case 'tower': return <LightTower />;
    // 轴末端编码器不属于独立 ASSEMBLY 条目，只在展台里以裸视图出现；
    // 整机中它作为 MachineFrame 的一部分渲染，避免两套几何漂移。
    case 'encoder': return <EncoderStage />;
    default: return null;
  }
}

/**
 * 部件展台（?stage=<name>）：部件居中于自身原点、1:1 真实尺度、
 * 底部铺 0.1m 标尺网格，配 PART_STAGES 的专用近景相机。
 * 先把每个部件的形状/方向/比例逐个核对，再按 ASSEMBLY 拼回整机。
 */
function PartStageView({ name }: { name: string }) {
  const stage = PART_STAGES[name];
  return (
    <group>
      <gridHelper
        args={[stage.grid, Math.round(stage.grid / 0.1), '#94a3b8', '#475569']}
        position={[0, stage.gridY, 0]}
      />
      {renderBarePart(name)}
    </group>
  );
}

// ============================================================
// 场景层动画特效
//
// 接药段（料筒 → 斜槽 → 料斗）已改为 Rapier 刚体，见 PhysicsWorld.tsx /
// DispensingSceneContent 里的 <Physics>；此处只保留倒药段的可视化轨迹。
// ============================================================

/** 倒药飞行：料斗翻到开口朝 +X 后，药片从斗口抛落到取药仓 */
function DumpingPills() {
  const pills = useDispensingStore((s) => s.dumpingPills);
  const sliderX = useDispensingStore((s) => s.sliderX);
  if (pills.length === 0) return null;
  const x0 = sliderX + DUMP_MOUTH_X;
  const binX = ASSEMBLY.collectBin.position[0];
  return (
    <>
      {pills.map((p, i) => {
        const t = p.progress;
        const spread = (i - (pills.length - 1) / 2) * 0.012;
        const x = x0 + (binX - x0) * t;
        const y = DUMP_MOUTH_Y + (DUMP_LAND_Y - DUMP_MOUTH_Y) * t * t;
        const z = DUMP_MOUTH_Z * (1 - t) + spread;
        const rot = -Math.PI / 2 * (1 - t);
        return (
          <mesh key={p.id} position={[x, y, z]} rotation={[0, 0, rot]}>
            <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 12]} />
            <meshStandardMaterial color={VISUAL.PILL_COLOR[p.mag]} />
          </mesh>
        );
      })}
    </>
  );
}

/** 各部件彩色标签（世界坐标，属场景层） */
function PartLabels() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const frameCX = ((0.25 - 0.1) + (1.95 + 0.25)) / 2;
  const magTopY = MAG_TUBE_TOP_Y + 0.04;
  return (
    <>
      <PhysicsLabel key="frame" text="传送丝杆台" position={[frameCX, 0.1, 0]} offset={[0, 0.2, 0]} color="gray" />
      {/* 两个位置传感器：原点兼作增量编码器 Z 相回零基准 */}
      <PhysicsLabel key="origin-sensor" text="原点传感器 · Z相回零" position={SENSOR_WORLD.ORIGIN} offset={[0, SENSOR.LABEL_Y, 0.04]} color="green" />
      <PhysicsLabel key="end-sensor" text="终点传感器" position={SENSOR_WORLD.END} offset={SENSOR.LABEL_END_OFFSET} color="yellow" />
      <PhysicsLabel key="hopper" text="取药料斗" position={[sliderX, HOPPER_OPEN_Y, HOPPER_CENTER_Z]} offset={[0, 0.25, 0]} color="purple" />
      {(['A', 'B', 'C', 'D'] as MagazineId[]).map((m) => (
        <PhysicsLabel
          key={`mag-${m}`}
          text={`${m}药仓`}
          position={[MAGAZINE_ASSEMBLY[m][0], magTopY, 0]}
          offset={[0, 0.1, 0]}
          color={m === 'A' ? 'red' : m === 'B' ? 'green' : m === 'C' ? 'blue' : 'purple'}
        />
      ))}
      <PhysicsLabel key="bin" text="取药仓" position={[ASSEMBLY.collectBin.position[0], BIN_TOP_Y, 0]} offset={[0, 0.35, 0]} color="orange" />
      <PhysicsLabel key="cabinet" text="控制柜" position={[...CABINET_POSITION]} offset={[0, 0.35, 0]} color="blue" />
      <PhysicsLabel key="tower" text="信号灯塔" position={[LIGHT_TOWER_X, 0, 0]} offset={[0, 1.5, 0]} color="yellow" />
    </>
  );
}

/** 整机：只做「按表摆放 + 绑定动画」，不含任何部件内部几何 */
function AssembledScene() {
  const mags = useMemo(() => ['A', 'B', 'C', 'D'] as MagazineId[], []);
  // 镜像布局只在场景层做 X 负缩放，装配表 / 几何常量 / 自检一律不动
  const mirrored = useAppStore((s) => s.mirrored);
  return (
    <group scale={[SCENE_SCALE * (mirrored ? -1 : 1), SCENE_SCALE, SCENE_SCALE]}>
      {renderMountedPart('frame')}
      {renderMountedPart('rack')}
      {mags.map((m) => (
        <Mount key={m} at={MAGAZINE_ASSEMBLY[m]}>
          <MagazineUnit mag={m} />
        </Mount>
      ))}
      {renderMountedPart('hopper')}
      {renderMountedPart('bin')}
      {renderMountedPart('cabinet')}
      {renderMountedPart('tower')}
      <DumpingPills />
      <PartLabels />
    </group>
  );
}

function SceneBody({ stage, part }: { stage: string | null; part: string | null }) {
  // 展台优先：1:1 尺度、单个部件、带标尺网格
  if (stage && PART_STAGES[stage]) return <PartStageView name={stage} />;

  if (part === 'frame') {
    return (
      <group scale={SCENE_SCALE}>
        {renderMountedPart('frame')}
        {renderMountedPart('hopper')}
        <PartLabels />
      </group>
    );
  }
  if (part === 'hopper') {
    return (
      <group scale={SCENE_SCALE}>
        {renderMountedPart('hopper')}
        <PartLabels />
      </group>
    );
  }
  if (part === 'magazine') {
    return (
      <group scale={SCENE_SCALE}>
        {renderMountedPart('rack')}
        {(['A', 'B', 'C', 'D'] as MagazineId[]).map((m) => (
          <Mount key={m} at={MAGAZINE_ASSEMBLY[m]}>
            <MagazineUnit mag={m} />
          </Mount>
        ))}
        <PartLabels />
      </group>
    );
  }
  if (part === 'bin') {
    return (
      <group scale={SCENE_SCALE}>
        {renderMountedPart('bin')}
        {renderMountedPart('hopper')}
        <DumpingPills />
        <PartLabels />
      </group>
    );
  }
  return <AssembledScene />;
}

/**
 * 场景入口：视图状态一律从 store 读（URL 只在初始化时解析一次），
 * 因此界面上切换机位/展台/镜像无需刷新页面；CameraRig 常驻做相机平滑过渡。
 *
 * <Physics> 放在这里而不是 App.tsx / DispensingSceneWrapper 里，两个入口才能共用
 * 同一个物理世界。刚体与静态碰撞体用放大后的世界坐标（PhysicsWorld.tsx），
 * 不受整机 group 的 X 负缩放（镜像布局）影响。
 * 展台是 1:1 局部尺度，物理地面会遮住 y<0 的台座/立柱，故展台下不渲染。
 */
/** 观众端不挂 Rapier，但仍安装与主控同一份只读诊断入口，供 CDP 复核快照跟随 */
function ViewerDiagnostics() {
  useEffect(() => { installDispensingDiagnostics(); }, []);
  return null;
}

export function DispensingSceneContent() {
  // 与龙门场景一致：程序化表面纹理只在首次渲染本场景时惰性烘焙一次
  // 必须放在观众端提前返回之前，保证主从两端的材质表现一致
  useMemo(() => { applyProceduralTextures(); return true; }, []);
  const stage = useAppStore((s) => s.activeStage);
  const part = useAppStore((s) => s.activePart);
  // 观众端（智能电视 / 手机）是只读镜像，不加载 Rapier WASM、不建刚体与碰撞体
  if (isViewerRuntime()) {
    return (
      <>
        <ViewerDiagnostics />
        <CameraRig />
        <SceneBody stage={stage} part={part} />
      </>
    );
  }
  return (
    <>
      <CameraRig />
      <Physics
        gravity={[0, PHYSICS.GRAVITY, 0]}
        timeStep={PHYSICS.TIME_STEP}
        debug={false}
      >
        {!stage && <PhysicsGround />}
        {!stage && <PhysicsWorld />}
        <SceneBody stage={stage} part={part} />
      </Physics>
    </>
  );
}
