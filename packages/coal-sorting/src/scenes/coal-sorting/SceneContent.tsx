import { useMemo } from 'react';
import { useBeltStore, type BeltSensorName } from './useBeltStore';
import {
  SENSOR_POSITIONS, INDICATOR_POSITIONS,
  COLLECTION_BOX_POSITION, SMALL_PARTICLE_BOX_POSITION,
  type IndicatorName, VISUAL, COMPONENT,
} from './constants';
import { BeltConveyor, IndicatorLight } from './components/BeltConveyor';
import { Hopper, FeedCylinder, SortingStations, CollectionBox } from './components/SortingStation';
import { BeltMaterialItem } from './components/BeltMaterialItem';
import { SensorDetector } from './components/SensorDetector';
import { SceneLabel } from './components/SceneLabel';

// ===== 传感器名称映射 =====
const SENSOR_LABELS: Record<string, string> = {
  s1_belt1_entry: '入口传感器',
  s3_belt1_exit: '1# 出口传感器',
  s4_belt2_entry: '2# 入口传感器',
  s6_belt2_exit: '2# 出口传感器',
  s7_belt3_entry: '3# 入口传感器',
  s9_belt3_exit: '3# 出口传感器',
  s2_belt1_run: '1# 运行指示',
  s5_belt2_run: '2# 运行指示',
  s8_belt3_run: '3# 运行指示',
  s10_pileup: '堆料传感器',
};

export function ThreeStageBeltSceneContent() {
  const materials = useBeltStore((s) => s.materials);
  const indicators = useBeltStore((s) => s.indicators);
  const sensors = useBeltStore((s) => s.sensors);
  const materialIds = useMemo(() => materials.map(m => m.id), [materials]);

  return (
    <group>
      <BeltConveyor beltName="belt1" /><BeltConveyor beltName="belt2" />
      <BeltConveyor beltName="belt3" /><BeltConveyor beltName="belt4" />

      {/* 筛下皮带 belt3 位于 2# 筛分皮带正下方，承接漏下小料 */}

      <Hopper /><FeedCylinder /><SortingStations />
      <CollectionBox position={COLLECTION_BOX_POSITION} color={VISUAL.LARGE_BOX_COLOR} label="大料收集框" />
      <CollectionBox position={SMALL_PARTICLE_BOX_POSITION} color={VISUAL.SMALL_BOX_COLOR} label="小料收集箱" />

      {Object.entries(indicators).map(([name, active]) => {
        const pos = INDICATOR_POSITIONS[name as IndicatorName];
        return name.includes('_run') && pos ? (
          <IndicatorLight key={name} position={pos} active={!!active} color={VISUAL.INDICATOR_RUN_COLOR} />
        ) : null;
      })}
      <IndicatorLight position={INDICATOR_POSITIONS.fault} active={!!indicators.fault} color={VISUAL.INDICATOR_FAULT_COLOR} />

      {(Object.entries(SENSOR_POSITIONS) as [BeltSensorName, [number, number, number]][]).map(([name, pos]) => (
        <group key={name}>
          <mesh position={pos}><sphereGeometry args={[COMPONENT.SENSOR_RADIUS, 8, 8]} /><meshStandardMaterial color={sensors[name] ? VISUAL.SENSOR_ON_COLOR : VISUAL.SENSOR_OFF_COLOR} /></mesh>
          <SceneLabel text={SENSOR_LABELS[name] || name} position={pos} offset={[0, 0.1, 0]} />
        </group>
      ))}

      {materialIds.map((id) => <BeltMaterialItem key={id} id={id} />)}

      {/* 传感器集中检测（修复不复位问题） */}
      <SensorDetector />
    </group>
  );
}
