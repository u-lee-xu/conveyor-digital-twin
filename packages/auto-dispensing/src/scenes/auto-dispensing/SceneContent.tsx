import { useMemo } from 'react';
import { useDispensingStore } from '../../stores/useDispensingStore';
import {
  MAGAZINE_X, PILL_R, PILL_H, VISUAL, CHUTE_Y, HOPPER_OPEN_Y,
  SLIDER_TOP_Y, SLIDER_SIZE, COLLECT_BIN_X, LIGHT_TOWER_X, CABINET_POSITION,
  type MagazineId,
} from './constants';
import { MachineFrame } from './components/MachineFrame';
import { SliderHopper } from './components/SliderHopper';
import { DrugMagazine } from './components/DrugMagazine';
import { CollectBin } from './components/CollectBin';
import { ControlCabinet, LightTower } from './components/ControlCabinet';
import { PhysicsLabel } from './components/PhysicsLabel';

/** 全场景等比放大系数（模型整体放大，含相机视野在内由 App 侧配合调整） */
export const SCENE_SCALE = 1.5;

/** 飞行中的药片：从药仓出口（CHUTE_Y）垂直落进料斗（HOPPER_OPEN_Y） */
function FlyingPills() {
  const pills = useDispensingStore((s) => s.pendingPills);
  if (pills.length === 0) return null;
  return (
    <>
      {pills.map((p) => {
        const y = CHUTE_Y - (CHUTE_Y - HOPPER_OPEN_Y) * p.progress;
        return (
          <mesh
            key={p.id}
            position={[MAGAZINE_X[p.mag], y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 12]} />
            <meshStandardMaterial color={VISUAL.PILL_COLOR[p.mag]} />
          </mesh>
        );
      })}
    </>
  );
}

/** 各部件彩色标签（与传送分拣场景同款） */
function PartLabels() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const frameCX = ((0.25 - 0.1) + (1.95 + 0.25)) / 2;
  const magTopY = CHUTE_Y + 0.32;
  return (
    <>
      <PhysicsLabel key="frame" text="传送丝杆台" position={[frameCX, 0.1, 0]} offset={[0, 0.2, 0]} color="gray" />
      <PhysicsLabel key="hopper" text="送料料斗" position={[sliderX, SLIDER_TOP_Y + SLIDER_SIZE[1], 0]} offset={[0, 0.3, 0]} color="purple" />
      {(['A', 'B', 'C'] as MagazineId[]).map((m) => (
        <PhysicsLabel
          key={`mag-${m}`}
          text={`${m}药仓`}
          position={[MAGAZINE_X[m], magTopY, 0]}
          offset={[0, 0.1, 0]}
          color={m === 'A' ? 'red' : m === 'B' ? 'green' : 'blue'}
        />
      ))}
      <PhysicsLabel key="bin" text="取药仓" position={[COLLECT_BIN_X, 0, 0]} offset={[0, 0.35, 0]} color="orange" />
      <PhysicsLabel key="cabinet" text="控制柜" position={[...CABINET_POSITION]} offset={[0, 0.35, 0]} color="blue" />
      <PhysicsLabel key="tower" text="信号灯塔" position={[LIGHT_TOWER_X, 0, 0]} offset={[0, 1.5, 0]} color="yellow" />
    </>
  );
}

export function DispensingSceneContent() {
  const mags = useMemo(() => ['A', 'B', 'C'] as MagazineId[], []);
  // 部件预览：?part=frame | hopper | magazine | bin | cabinet（无参数=完整拼接）
  const part = useMemo(() => new URLSearchParams(window.location.search).get('part'), []);
  const scene = (
    <group>
      <MachineFrame />
      <SliderHopper />
      {mags.map((m) => <DrugMagazine key={m} mag={m} />)}
      <CollectBin />
      <ControlCabinet />
      <LightTower />
      <FlyingPills />
      <PartLabels />
    </group>
  );

  if (part === 'frame') {
    return (
      <group scale={SCENE_SCALE}>
        <MachineFrame />
        <SliderHopper />
        <PartLabels />
      </group>
    );
  }
  if (part === 'hopper') {
    return (
      <group scale={SCENE_SCALE}>
        <SliderHopper />
        <PartLabels />
      </group>
    );
  }
  return <group scale={SCENE_SCALE}>{scene}</group>;
}