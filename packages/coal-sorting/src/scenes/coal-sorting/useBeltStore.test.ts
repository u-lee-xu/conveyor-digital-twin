import { describe, it, expect, beforeEach } from 'vitest';
import { useBeltStore } from './useBeltStore';
import { MAX_MATERIALS } from './constants';

describe('useBeltStore - 皮带与传感器状态', () => {
  beforeEach(() => {
    useBeltStore.getState().reset();
  });

  it('setBeltRunning 联动运行指示灯', () => {
    useBeltStore.getState().setBeltRunning('belt1', true);
    expect(useBeltStore.getState().belts.belt1.running).toBe(true);
    expect(useBeltStore.getState().indicators.belt1_run).toBe(true);

    useBeltStore.getState().setBeltRunning('belt1', false);
    expect(useBeltStore.getState().indicators.belt1_run).toBe(false);
  });

  it('setBeltFault 停止皮带并联动故障指示与蜂鸣器', () => {
    useBeltStore.getState().setBeltRunning('belt1', true);
    useBeltStore.getState().setBeltFault('belt1', true);

    const state = useBeltStore.getState();
    expect(state.belts.belt1.running).toBe(false);
    expect(state.belts.belt1.fault).toBe(true);
    expect(state.indicators.fault).toBe(true);
    expect(state.buzzer).toBe(true);
  });

  it('故障消除后指示灯与蜂鸣器复位', () => {
    useBeltStore.getState().setBeltFault('belt1', true);
    useBeltStore.getState().setBeltFault('belt1', false);

    const state = useBeltStore.getState();
    expect(state.indicators.fault).toBe(false);
    expect(state.buzzer).toBe(false);
  });

  it('setSensors 批量差量更新，无变化时不触发状态变更', () => {
    const { setSensors } = useBeltStore.getState();
    setSensors({ s1_belt1_entry: true, s3_belt1_exit: true });
    let sensors = useBeltStore.getState().sensors;
    expect(sensors.s1_belt1_entry).toBe(true);
    expect(sensors.s3_belt1_exit).toBe(true);

    // 无变化调用：返回的 state 引用应保持不变（不触发订阅）
    const before = useBeltStore.getState().sensors;
    setSensors({ s1_belt1_entry: true, s3_belt1_exit: true });
    expect(useBeltStore.getState().sensors).toBe(before);
    sensors = useBeltStore.getState().sensors;
    expect(sensors.s2_belt1_run).toBe(false);
  });
});

describe('useBeltStore - 物料生成', () => {
  beforeEach(() => {
    useBeltStore.getState().reset();
  });

  it('spawnMaterial 生成指定类型与尺寸', () => {
    useBeltStore.getState().spawnMaterial('coal', 'small');
    const [m] = useBeltStore.getState().materials;
    expect(m).toBeDefined();
    expect(m.type).toBe('coal');
    expect(m.size).toBe('small');
    expect(m.onBelt).toBe('belt1');
    expect(m.phase).toBe('on_belt');
  });

  it('混合投料按煤石比例随机', () => {
    useBeltStore.getState().setCoalRatio(100);
    useBeltStore.getState().setAutoFeedType('mixed');
    for (let i = 0; i < 10; i++) {
      useBeltStore.getState().spawnMaterial();
    }
    const materials = useBeltStore.getState().materials;
    expect(materials).toHaveLength(10);
    expect(materials.every((m) => m.type === 'coal')).toBe(true);
  });

  it('物料数量达到上限后不再生成', () => {
    const { spawnMaterial } = useBeltStore.getState();
    for (let i = 0; i < MAX_MATERIALS + 5; i++) {
      spawnMaterial();
    }
    expect(useBeltStore.getState().materials).toHaveLength(MAX_MATERIALS);
  });

  it('removeMaterial 与 clearMaterials', () => {
    useBeltStore.getState().spawnMaterial('coal', 'medium');
    useBeltStore.getState().spawnMaterial('stone', 'large');
    const [first, second] = useBeltStore.getState().materials;

    useBeltStore.getState().removeMaterial(first.id);
    const materials = useBeltStore.getState().materials;
    expect(materials).toHaveLength(1);
    expect(materials[0].id).toBe(second.id);

    useBeltStore.getState().clearMaterials();
    expect(useBeltStore.getState().materials).toHaveLength(0);
  });

  it('setMaterialPhase 记录阶段进入时间且幂等', () => {
    useBeltStore.getState().spawnMaterial('coal', 'medium');
    const m = useBeltStore.getState().materials[0];

    useBeltStore.getState().setMaterialPhase(m.id, 'sieving');
    let updated = useBeltStore.getState().materials[0];
    expect(updated.phase).toBe('sieving');

    const phaseStart = updated.phaseStart;
    useBeltStore.getState().setMaterialPhase(m.id, 'sieving');
    updated = useBeltStore.getState().materials[0];
    expect(updated.phaseStart).toBe(phaseStart);
  });
});
