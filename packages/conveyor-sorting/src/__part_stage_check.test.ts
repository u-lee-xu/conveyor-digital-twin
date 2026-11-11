/**
 * 传送带分拣「部件展台」防回退自检。
 *
 * 参照自动配药 __assembly_check.test.ts 的口径，固化四条硬约束：
 *  1. ASSEMBLY / PART_INSTANCES 是整机部件位置的唯一来源，且从既有 LAYOUT 常量派生；
 *  2. PART_STAGES 与 ASSEMBLY 键集合、原点契约一一对应；
 *  3. 展台与整机**复用同一批组件**（形状/尺寸/材质零复制），展台不挂动态刚体；
 *  4. 机位短路、?stage= 深链、UI 下拉、共享容器的地面/缩放下限都有显式接线。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSEMBLY, PART_INSTANCES, PART_STAGES, PART_STAGE_ORIGIN, isPartStage,
  VIEW_BUTTONS, VIEW_PRESETS, SCENE_TARGET,
  CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION, COMPONENT,
  type PartKind,
} from './scenes/conveyor-sorting/constants';
import { resolveViewGoal } from './scenes/conveyor-sorting/cameraGoals';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');

const constantsSource = src('scenes/conveyor-sorting/constants.ts');
const sceneSource = src('scenes/conveyor-sorting/SceneContent.tsx');
const goalsSource = src('scenes/conveyor-sorting/cameraGoals.ts');
const rigSource = src('scenes/conveyor-sorting/CameraRig.tsx');
const storeSource = src('stores/useConveyorViewStore.ts');
const switcherSource = src('platform/ConveyorViewSwitcher.tsx');
const wrapperSource = src('platform/ConveyorSceneWrapper.tsx');
const physicsSceneSource = src('../../shared/src/components/PhysicsScene.tsx');
const cylinderSource = src('scenes/conveyor-sorting/components/PhysicsCylinder.tsx');

const PART_COMPONENTS = [
  'PhysicsConveyorBelt', 'PhysicsSortChute', 'PhysicsMaterialTable',
  'PhysicsCylinder', 'PhysicsSensor', 'PhysicsSignalTower', 'PhysicsVfdDrive',
];

/** 取某个函数声明到下一个常量声明之间的源码，用于精确判断「展台里有什么」 */
function bodyOf(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + 1);
  expect(a, `${start} 缺失`).toBeGreaterThan(-1);
  expect(b, `${end} 缺失`).toBeGreaterThan(a);
  return source.slice(a, b);
}

const mountedBody = bodyOf(sceneSource, 'function renderMountedPart', 'function renderBarePart');
const bareBody = bodyOf(sceneSource, 'function renderBarePart', 'const CYLINDER_LABELS');

describe('装配表：整机部件位置只有一个来源', () => {
  it('ASSEMBLY / PART_STAGES / PART_STAGE_ORIGIN 键集合严格一致', () => {
    const kinds = Object.keys(PART_STAGES) as PartKind[];
    expect(kinds).toHaveLength(7);
    expect(Object.keys(ASSEMBLY).sort()).toEqual([...kinds].sort());
    expect(Object.keys(PART_STAGE_ORIGIN).sort()).toEqual([...kinds].sort());
    kinds.forEach((k) => {
      expect(ASSEMBLY[k].position).toHaveLength(3);
      expect(ASSEMBLY[k].origin.length).toBeGreaterThan(8);
      expect(PART_STAGE_ORIGIN[k]).toBe(ASSEMBLY[k].origin);
    });
  });

  it('装配位置从既有 LAYOUT / COMPONENT 常量派生，零漂移', () => {
    expect(ASSEMBLY.table.position).toEqual(MATERIAL_TABLE_POSITION);
    expect(ASSEMBLY.cylinder.position).toEqual(CYLINDER_POSITIONS.feed);
    expect(ASSEMBLY.sensor.position).toEqual(SENSOR_POSITIONS.feed);
    expect(ASSEMBLY.tower.position).toEqual(COMPONENT.TOWER_POSITION);
    expect(ASSEMBLY.belt.position).toEqual([0, 0, 0]);
    expect(ASSEMBLY.chute.position).toEqual([0, 0, 0]);
    expect(PART_INSTANCES.cylinder).toEqual(CYLINDER_POSITIONS);
    expect(PART_INSTANCES.sensor).toEqual(SENSOR_POSITIONS);
    expect(constantsSource).toContain('...CYLINDER_POSITIONS.feed');
    expect(constantsSource).toContain('...SENSOR_POSITIONS.feed');
    expect(constantsSource).toContain('...MATERIAL_TABLE_POSITION');
  });

  it('五个既有整机机位一个不动', () => {
    expect(VIEW_BUTTONS).toEqual(['overview', 'top', 'feed', 'sorting', 'tower']);
    expect(VIEW_PRESETS.overview.target).toBe(SCENE_TARGET);
  });
});

describe('展台定义：1:1 近景 + 0.1m 标尺网格', () => {
  it('每个展台都有标签、相机、观察点、FOV 与网格，且相机在目标上方', () => {
    (Object.keys(PART_STAGES) as PartKind[]).forEach((k) => {
      const p = PART_STAGES[k];
      expect(p.label.length, `${k} label`).toBeGreaterThan(1);
      expect(p.camera).toHaveLength(3);
      expect(p.target).toHaveLength(3);
      expect(p.fov).toBeGreaterThanOrEqual(30);
      expect(p.fov).toBeLessThanOrEqual(60);
      expect(p.camera[1]).toBeGreaterThan(p.target[1]); // maxPolarAngle = π/2
      expect(p.grid).toBeGreaterThan(0);
      expect(Number.isFinite(p.gridY)).toBe(true);
      // 网格固定 0.1m 一格（浮点容差）
      const cells = p.grid / 0.1;
      expect(Math.abs(cells - Math.round(cells)), `${k} 网格不是 0.1m/格`).toBeLessThan(1e-6);
      // 相机距离必须落在展台容器的 [minDistance, maxDistance] 内
      const d = Math.hypot(
        p.camera[0] - p.target[0], p.camera[1] - p.target[1], p.camera[2] - p.target[2],
      );
      expect(d, `${k} 近景被 minDistance 推远`).toBeGreaterThan(0.12);
      expect(d, `${k} 超出 maxDistance`).toBeLessThan(20);
    });
  });

  it('isPartStage 用 hasOwnProperty，挡住原型链上的伪键', () => {
    (Object.keys(PART_STAGES) as PartKind[]).forEach((k) => expect(isPartStage(k)).toBe(true));
    ['__proto__', 'constructor', 'toString', 'nope', '', null, undefined]
      .forEach((k) => expect(isPartStage(k as string | null)).toBe(false));
    expect(constantsSource).toContain('Object.prototype.hasOwnProperty.call(PART_STAGES, name)');
  });
});

describe('机位短路：展台优先于整机 view', () => {
  it('resolveViewGoal 命中展台时忽略 view', () => {
    const g = resolveViewGoal('overview', 'sensor');
    const p = PART_STAGES.sensor;
    expect(g.position.toArray()).toEqual(p.camera);
    expect(g.target.toArray()).toEqual(p.target);
    expect(g.fov).toBe(p.fov);
    const g2 = resolveViewGoal('tower', 'sensor');
    expect(g2.position.toArray()).toEqual(g.position.toArray());
  });

  it('无展台 / 非法展台都回落到整机机位', () => {
    const g = resolveViewGoal('feed', null);
    expect(g.position.toArray()).toEqual(VIEW_PRESETS.feed.camera);
    expect(g.target.toArray()).toEqual(VIEW_PRESETS.feed.target);
    expect(resolveViewGoal('feed', '__proto__').position.toArray()).toEqual(g.position.toArray());
    expect(goalsSource).toContain('isPartStage(stage)');
    expect(goalsSource).toContain('PART_STAGES[stage]');
    expect(rigSource).toContain('resolveViewGoal(activeView, activeStage)');
    expect(rigSource).toContain('[activeView, activeStage, controls]');
  });
});

describe('场景层：展台与整机同源，不复制几何、不挂动态刚体', () => {
  it('renderMountedPart 与 renderBarePart 调用同一批组件', () => {
    PART_COMPONENTS.forEach((c) => {
      expect(mountedBody, `整机缺 ${c}`).toContain(c);
      expect(bareBody, `展台缺 ${c}`).toContain(c);
    });
    expect(mountedBody).toContain('ASSEMBLY.table.position');
    expect(mountedBody).toContain('PART_INSTANCES.cylinder');
    expect(mountedBody).toContain('PART_INSTANCES.sensor');
    expect(bareBody).toContain('position={[0, 0, 0]}');
  });

  it('气缸展台固定展示伸出姿态，整机仍只读共享快照、不写设备状态', () => {
    expect(bareBody).toContain('previewExtension={CYLINDER_EXTEND_POS_FEED}');
    expect(mountedBody).not.toContain('previewExtension');
    expect(cylinderSource).toContain('previewExtension ?? readCylinderExtensions()[name]');
    expect(cylinderSource).toContain('readCylinderExtensions()');
  });

  it('展台里不渲染动态工件 / 场景标签 / 整机标签', () => {
    expect(bareBody).not.toMatch(/<PhysicsMaterial\s*\/>/);
    expect(bareBody).not.toContain('<PhysicsLabel');
    // 动态工件只出现在整机分支
    expect(sceneSource).toContain('<PhysicsMaterial />');
  });

  it('展台分支、标尺网格与局部原点契约都在场景入口', () => {
    expect(sceneSource).toContain('<PartStageView kind={activeStage} />');
    expect(sceneSource).toContain('isPartStage(activeStage)');
    expect(sceneSource).toContain('<AssembledScene />');
    expect(sceneSource).toContain('<gridHelper');
    expect(sceneSource).toContain('Math.round(stage.grid / 0.1)');
    expect(sceneSource).toContain('PART_STAGE_ORIGIN[kind]');
    expect(sceneSource).toContain('<CylinderMotionDriver />');
  });
});

describe('交互与容器：?stage= 深链、UI 下拉、共享容器默认值不回退', () => {
  it('store 解析 ?stage= 并写回地址栏，且保留平台壳的 history.state', () => {
    expect(storeSource).toContain("q.get('stage')");
    expect(storeSource).toContain('isPartStage(s)');
    expect(storeSource).toContain('activeStage: PartKind | null');
    expect(storeSource).toContain('window.history.replaceState(window.history.state');
    expect(storeSource).toContain('set({ activeView, activeStage: null })');
    expect(storeSource).toContain('syncUrl(get().activeView, stage, get().stageSensor)');
  });

  it('工具栏保留五个机位，并新增部件展台下拉与返回整机', () => {
    expect(switcherSource).toContain('部件展台');
    expect(switcherSource).toContain('<select');
    expect(switcherSource).toContain('Object.entries(PART_STAGES)');
    expect(switcherSource).toContain('setStage(e.target.value || null)');
    expect(switcherSource).toContain('返回整机');
    expect(switcherSource).toContain('!activeStage && activeView === key');
    expect(switcherSource).toContain('VIEW_BUTTONS.map');
    // CDP 验收用的稳定锚点，避免靠中文文案猜 DOM
    expect(switcherSource).toContain('data-dt-stage-select');
    expect(switcherSource).toContain('data-dt-stage-back');
    expect(switcherSource).toContain('data-dt-stage-banner');
  });

  it('展台下关掉整机地面并放开近景缩放，其它设备默认值不变', () => {
    expect(wrapperSource).toContain('PART_STAGES[activeStage]');
    expect(wrapperSource).toContain('showGround={!stage}');
    expect(wrapperSource).toContain('minDistance={stage ? 0.12 : 2}');
    expect(wrapperSource).toContain('orbitTarget={stage ? stage.target : SCENE_TARGET}');
    expect(wrapperSource).toContain('timeStep={1 / 60}');

    expect(physicsSceneSource).toContain('showGround?: boolean');
    expect(physicsSceneSource).toContain('minDistance?: number');
    expect(physicsSceneSource).toContain('showGround = true');
    expect(physicsSceneSource).toContain('minDistance = 2');
    expect(physicsSceneSource).toContain('{showGround && <PhysicsGround />}');
    expect(physicsSceneSource).toContain('minDistance={minDistance}');
    expect(physicsSceneSource).toContain('timeStep = 1 / 30');
  });
});
