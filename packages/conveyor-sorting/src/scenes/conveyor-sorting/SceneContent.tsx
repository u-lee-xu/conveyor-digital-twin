import { Fragment, useMemo, type ReactNode } from 'react';
import { applyProceduralTextures } from '../../components/scene/shared/materials';
import { useDeviceStore, useConveyorViewStore } from '../../stores';
import type { CylinderName, SensorName } from '../../types/device';
import {
  ASSEMBLY, PART_INSTANCES, PART_STAGES, PART_STAGE_ORIGIN,
  SORT_CHUTE, CYLINDER_EXTEND_POS_FEED, isPartStage, type PartKind, type SensorVariant,
} from './constants';
import { PhysicsConveyorBelt } from './components/PhysicsConveyorBelt';
import { PhysicsSensor } from './components/PhysicsSensor';
import { PhysicsCylinder } from './components/PhysicsCylinder';
import { PhysicsMaterial } from './components/PhysicsMaterial';
import { PhysicsMaterialTable } from './components/PhysicsMaterialTable';
import { PhysicsSignalTower } from './components/PhysicsSignalTower';
import { PhysicsLabel } from './components/PhysicsLabel';
import { PhysicsSortChute } from './components/PhysicsSortChute';
import { CameraRig } from './CameraRig';
import { CylinderMotionDriver } from './CylinderMotionDriver';
import { BIN_CENTER_Z, sortSlotX } from './sortChute';

type TowerState = { red: boolean; green: boolean; yellow: boolean };

// ============================================================
// 装配层：整机与部件展台共用同一批组件，绝不复制几何
//
// renderMountedPart() 把部件按 ASSEMBLY / PART_INSTANCES 摆到整机世界坐标；
// renderBarePart() 把同一个组件放到自身局部原点（裸视图）。
// 两者的差异只有「位置」「有没有其它部件」，以及气缸展台固定展示伸出姿态；
// 形状 / 尺寸 / 材质永远同源，展台不写任何设备状态。
// ============================================================

/** 整机：按装配表摆放单个部件 */
function renderMountedPart(kind: PartKind, instance: string, tower: TowerState): ReactNode {
  switch (kind) {
    case 'belt': return <PhysicsConveyorBelt />;
    case 'chute': return <PhysicsSortChute />;
    case 'table': return <PhysicsMaterialTable position={ASSEMBLY.table.position} />;
    case 'cylinder':
      return (
        <PhysicsCylinder
          name={instance as CylinderName}
          position={PART_INSTANCES.cylinder[instance as CylinderName]}
        />
      );
    case 'sensor':
      return (
        <PhysicsSensor
          name={instance}
          position={PART_INSTANCES.sensor[instance as SensorName]}
        />
      );
    case 'tower':
      return (
        <PhysicsSignalTower
          position={ASSEMBLY.tower.position}
          red={tower.red} green={tower.green} yellow={tower.yellow}
        />
      );
    default: return null;
  }
}

/** 展台：同一个部件放在自身局部原点，1:1 真实尺度 */
function renderBarePart(kind: PartKind, tower: TowerState, sensorVariant: SensorVariant): ReactNode {
  switch (kind) {
    case 'belt': return <PhysicsConveyorBelt />;
    case 'chute': return <PhysicsSortChute />;
    case 'table': return <PhysicsMaterialTable position={[0, 0, 0]} />;
    // 固定伸出 + 展示底座：缩回时推杆几乎全藏进缸体，展台里看不出推板 / 双导杆安装链
    case 'cylinder':
      return (
        <PhysicsCylinder
          name="feed"
          position={[0, 0, 0]}
          previewExtension={CYLINDER_EXTEND_POS_FEED}
          previewMount
        />
      );
    // 三只型号可切换：色标传感器不再被写死成上料光电
    case 'sensor': return <PhysicsSensor name={sensorVariant} position={[0, 0, 0]} />;
    case 'tower':
      return (
        <PhysicsSignalTower
          position={[0, 0, 0]}
          red={tower.red} green={tower.green} yellow={tower.yellow}
        />
      );
    default: return null;
  }
}

const CYLINDER_LABELS: Record<CylinderName, { text: string; color: string }> = {
  feed: { text: '上料气缸', color: 'blue' },
  sorting1: { text: '分拣1', color: 'purple' },
  sorting2: { text: '分拣2', color: 'purple' },
};

const SENSOR_LABELS: Record<SensorName, { text: string; color: string }> = {
  feed: { text: '上料传感器', color: 'green' },
  color: { text: '色标传感器', color: 'orange' },
  material: { text: '物料传感器', color: 'green' },
};

/** 各部件彩色标签（世界坐标，属场景层，展台下不渲染） */
function PartLabels() {
  return (
    <>
      {SORT_CHUTE.SLOTS.map((slot, i) => (
        <PhysicsLabel
          key={`chute-${slot}`}
          text={`${i + 1}号分拣槽`}
          position={[sortSlotX(slot), SORT_CHUTE.BIN_FLOOR_Y + 0.3, BIN_CENTER_Z]}
          offset={[0, 0.22, 0]}
          color={i === 0 ? 'orange' : 'blue'}
        />
      ))}
      <PhysicsLabel
        key="material-table" text="物料台"
        position={ASSEMBLY.table.position} offset={[0, 0.2, 0]} color="gray"
      />
      {(Object.keys(SENSOR_LABELS) as SensorName[]).map((name) => (
        <PhysicsLabel
          key={`sensor-${name}`}
          text={SENSOR_LABELS[name].text}
          position={PART_INSTANCES.sensor[name]}
          offset={[0, 0.2, 0]}
          color={SENSOR_LABELS[name].color}
        />
      ))}
      {(Object.keys(CYLINDER_LABELS) as CylinderName[]).map((name) => (
        <PhysicsLabel
          key={`cylinder-${name}`}
          text={CYLINDER_LABELS[name].text}
          position={PART_INSTANCES.cylinder[name]}
          offset={[0, 0.3, 0]}
          color={CYLINDER_LABELS[name].color}
        />
      ))}
      <PhysicsLabel
        key="signal-tower" text="信号灯塔"
        position={ASSEMBLY.tower.position} offset={[0, 1.1, 0]} color="yellow"
      />
    </>
  );
}

/** 整机：按装配表摆放 + 绑定动画，不含任何部件内部几何 */
function AssembledScene() {
  const signalTower = useDeviceStore((s) => s.signalTower);
  return (
    <>
      {renderMountedPart('belt', 'belt', signalTower)}
      {renderMountedPart('chute', 'chute', signalTower)}
      {renderMountedPart('table', 'table', signalTower)}
      {(Object.keys(SENSOR_LABELS) as SensorName[]).map((name) => (
        <Fragment key={`sensor-part-${name}`}>
          {renderMountedPart('sensor', name, signalTower)}
        </Fragment>
      ))}
      {(Object.keys(CYLINDER_LABELS) as CylinderName[]).map((name) => (
        <Fragment key={`cylinder-part-${name}`}>
          {renderMountedPart('cylinder', name, signalTower)}
        </Fragment>
      ))}
      <PhysicsMaterial />
      {renderMountedPart('tower', 'tower', signalTower)}
      <PartLabels />
    </>
  );
}

/**
 * 部件展台（?stage=<name>）：部件居中于自身原点、1:1 真实尺度，
 * 底部铺 0.1m 标尺网格，配 PART_STAGES 的专用近景相机。
 * 局部原点定义见 PART_STAGE_ORIGIN，便于逐个核对形状 / 方向 / 比例。
 */
function PartStageView({ kind }: { kind: PartKind }) {
  const stage = PART_STAGES[kind];
  const signalTower = useDeviceStore((s) => s.signalTower);
  const stageSensor = useConveyorViewStore((s) => s.stageSensor);
  return (
    <group userData={{ part: kind, origin: PART_STAGE_ORIGIN[kind], scale: 1 }}>
      <gridHelper
        args={[stage.grid, Math.round(stage.grid / 0.1), '#94a3b8', '#475569']}
        position={[0, stage.gridY, 0]}
      />
      {renderBarePart(kind, signalTower, stageSensor)}
    </group>
  );
}

/**
 * 传送带分拣场景内容（在 Physics 容器内渲染）。
 * 视图状态一律从 store 读（URL 只在初始化时解析一次），
 * 因此界面上切换机位 / 展台无需刷新页面；CameraRig 常驻做相机平滑过渡。
 */
export function ConveyorSortingSceneContent() {
  // 与龙门场景一致：程序化表面纹理只在首次渲染本场景时惰性烘焙一次
  useMemo(() => { applyProceduralTextures(); return true; }, []);
  const activeStage = useConveyorViewStore((s) => s.activeStage);
  return (
    <>
      {/* 必须排在所有消费者之前：统一推进三个气缸行程并写入共享快照 */}
      <CylinderMotionDriver />
      <CameraRig />
      {isPartStage(activeStage)
        ? <PartStageView kind={activeStage} />
        : <AssembledScene />}
    </>
  );
}
