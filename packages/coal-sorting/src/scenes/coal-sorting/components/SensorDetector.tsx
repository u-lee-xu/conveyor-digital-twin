import { useFrame } from '@react-three/fiber';
import { useBeltStore, type BeltName, type BeltSensorName } from '../useBeltStore';
import { getAllMaterialPositions } from '../materialRegistry';
import { worldToLocal } from './helpers';
import { BELT_LENGTH, BELT3_LENGTH, PHYSICS } from '../constants';

/** 入口/出口检测区宽度（皮带端部 0.3 范围内） */
const ENTRY_ZONE = 0.3;
const ZONE_EDGE: Record<BeltName, number> = {
  belt1: BELT_LENGTH / 2 - ENTRY_ZONE,
  belt2: BELT_LENGTH / 2 - ENTRY_ZONE,
  belt3: BELT3_LENGTH / 2 - ENTRY_ZONE,
  belt4: BELT_LENGTH / 2 - ENTRY_ZONE,
};

/** 运行指示传感器：对应皮带运行 + 皮带上存在物料 */
const RUN_SENSORS: [BeltSensorName, BeltName][] = [
  ['s2_belt1_run', 'belt1'],
  ['s5_belt2_run', 'belt2'],
  ['s8_belt3_run', 'belt3'],
];

/**
 * 传感器集中检测（无渲染副作用）
 * 每帧依据所有物料当前位置全量计算传感器真值，与 store 对比后差量更新，
 * 修复物料离开检测区后传感器不复位的问题
 */
export function SensorDetector() {
  useFrame(() => {
    const store = useBeltStore.getState();
    // 预填全部传感器为 false，物料离开检测区时才能复位
    const desired = Object.fromEntries(
      Object.keys(store.sensors).map((k) => [k, false]),
    ) as Record<BeltSensorName, boolean>;
    const beltHasMaterial: Record<BeltName, boolean> = { belt1: false, belt2: false, belt3: false, belt4: false };
    let belt1EntryBlocked = false;
    let xrayHit = false;

    for (const [id, pos] of getAllMaterialPositions()) {
      const m = store.materials.find((mm) => mm.id === id);
      if (!m || !m.onBelt) continue;
      const belt = m.onBelt;
      beltHasMaterial[belt] = true;
      const { lx } = worldToLocal(pos, belt);

      if (belt === 'belt1') {
        if (lx > -BELT_LENGTH / 2 && lx < -ZONE_EDGE.belt1) {
          desired.s1_belt1_entry = true;
          belt1EntryBlocked = true;
        }
        if (lx > ZONE_EDGE.belt1) desired.s3_belt1_exit = true;
      } else if (belt === 'belt2') {
        if (lx < -ZONE_EDGE.belt2) desired.s4_belt2_entry = true;
        if (lx > ZONE_EDGE.belt2) desired.s6_belt2_exit = true;
        // X光检测：分拣机开启且矸石进入检测区（早于吹矸区）
        if (m.type === 'stone' && store.separator?.active && lx >= PHYSICS.DETECT_ZONE_START_LX && lx <= PHYSICS.BLOW_ZONE_END_LX) {
          xrayHit = true;
        }
      } else if (belt === 'belt3') {
        if (lx < -ZONE_EDGE.belt3) desired.s7_belt3_entry = true;
        if (lx > ZONE_EDGE.belt3) desired.s9_belt3_exit = true;
      }
    }

    for (const [sensorName, beltName] of RUN_SENSORS) {
      if (store.belts[beltName].running && beltHasMaterial[beltName]) {
        desired[sensorName] = true;
      }
    }

    // 堆料检测：1# 皮带入口有物料但皮带未运行
    if (belt1EntryBlocked && !store.belts.belt1.running) {
      desired.s10_pileup = true;
    }

    // 与当前状态差量对比，仅提交变化的传感器
    const diff: Partial<Record<BeltSensorName, boolean>> = {};
    for (const [name, value] of Object.entries(desired) as [BeltSensorName, boolean][]) {
      if (store.sensors[name] !== value) diff[name] = value;
    }
    if (Object.keys(diff).length > 0) {
      store.setSensors(diff);
    }
    // X光检测到指示（差量更新，避免每帧重渲染）
    if (store.xrayHit !== xrayHit) {
      store.setXrayHit(xrayHit);
    }
  });

  return null;
}
