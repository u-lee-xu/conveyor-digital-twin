/**
 * 气缸 / 传感器拟真几何防回退自检。
 *
 * 固化四条口径：
 *  1. 所有可见尺寸走 CYLINDER_DETAIL / SENSOR_DETAIL，几何走 geometries.ts，颜色走 VISUAL；
 *  2. 上料 / 物料是同型号漫反射光电，色标是独立颜色传感器，靠光窗与示教件区分而非小色块；
 *  3. 展台专用的 previewExtension / previewMount 只在裸视图出现，整机一律不传；
 *  4. 传感器展台能切换三个型号，并支持 ?sensor= 深链。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CYLINDER_DETAIL, SENSOR_DETAIL, SENSOR_VARIANTS, PART_STAGES,
  SENSOR_POSITIONS, isSensorVariant,
} from './scenes/conveyor-sorting/constants';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');

const constantsSource = src('scenes/conveyor-sorting/constants.ts');
const geoSource = src('components/scene/shared/geometries.ts');
const matSource = src('components/scene/shared/materials.ts');
const cylinderSource = src('scenes/conveyor-sorting/components/PhysicsCylinder.tsx');
const sensorSource = src('scenes/conveyor-sorting/components/PhysicsSensor.tsx');
const sceneSource = src('scenes/conveyor-sorting/SceneContent.tsx');
const storeSource = src('stores/useConveyorViewStore.ts');
const switcherSource = src('platform/ConveyorViewSwitcher.tsx');

function bodyOf(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + 1);
  expect(a, `${start} 缺失`).toBeGreaterThan(-1);
  expect(b, `${end} 缺失`).toBeGreaterThan(a);
  return source.slice(a, b);
}

const mountedBody = bodyOf(sceneSource, 'function renderMountedPart', 'function renderBarePart');
const bareBody = bodyOf(sceneSource, 'function renderBarePart', 'const CYLINDER_LABELS');

describe('拟真几何：尺寸、几何体、颜色各有唯一来源', () => {
  it('constants.ts 同时提供气缸与传感器细节尺寸表，geometries.ts 全部派生引用', () => {
    expect(constantsSource).toContain('export const SENSOR_DETAIL');
    expect(constantsSource).toContain('export const SENSOR_VARIANTS');
    expect(constantsSource).toContain('isSensorVariant');
    expect(geoSource).toContain('CYLINDER_DETAIL');
    expect(geoSource).toContain('SENSOR_DETAIL');
    expect(geoSource).toContain('SURFACE_GAP');
    expect(geoSource).toContain('D.ROD_R');
    expect(geoSource).toContain('S.BODY_W');
    expect(geoSource).toContain('S.COLOR_BODY_W');
  });

  it('尺寸落在合理区间，且确实比旧版更拟真', () => {
    expect(CYLINDER_DETAIL.ROD_R).toBeLessThan(0.035);       // 旧版 φ70 深色粗棒
    expect(CYLINDER_DETAIL.MAGSWITCH_LEN).toBeGreaterThan(0);
    expect(CYLINDER_DETAIL.MAGSWITCH_T).toBeLessThan(0.02);  // 侧面细长条而非顶面 8cm 方块
    expect(SENSOR_DETAIL.COLOR_BODY_W).toBeGreaterThan(SENSOR_DETAIL.BODY_W);
    expect(SENSOR_DETAIL.COLOR_BODY_H).toBeGreaterThan(SENSOR_DETAIL.BODY_H);
    expect(SENSOR_DETAIL.WINDOW_W).toBeGreaterThan(SENSOR_DETAIL.LENS_R * 2);
    expect(CYLINDER_DETAIL.STAND_Y).toBe(PART_STAGES.cylinder.gridY);
  });

  it('新增表面材质只在 materials.ts 定义，颜色仍取自 VISUAL', () => {
    ['sensorOptics', 'sensorBeam', 'rubberBumper'].forEach((m) => {
      expect(matSource, `${m} 缺定义`).toContain(`${m}:`);
    });
    expect(matSource).toContain('VISUAL.PROFILE_SLOT_COLOR');
    expect(matSource).toContain('VISUAL.MATERIAL_BLUE_COLOR');
  });
});

describe('传感器：上料 / 物料共用光电，色标独立造型', () => {
  it('按 name 分成两套外壳，检测态语义不变', () => {
    expect(sensorSource).toContain("name === 'color'");
    expect(sensorSource).toContain('DiffusePhotoEye');
    expect(sensorSource).toContain('ColorMarkSensor');
    expect(sensorSource).toContain('materials.lampDark');
    expect(sensorSource).toContain('materials.brass');
    expect(sensorSource).not.toContain('SENSOR_ACTIVE_COLOR');
  });

  it('透镜 / 宽光窗 / 光斑 / 示教键都走共享几何，组件里不再内联方盒', () => {
    [
      'geometries.sensorLens', 'geometries.sensorWindow', 'geometries.sensorSpot',
      'geometries.sensorTeach', 'geometries.sensorBar', 'geometries.sensorDisplay',
      'geometries.sensorColorBody', 'materials.sensorOptics', 'materials.sensorBeam',
    ].forEach((g) => expect(sensorSource, `缺 ${g}`).toContain(g));
    expect(sensorSource).not.toContain('<boxGeometry');
    expect(geoSource).toContain('sensorWindow:');
    expect(geoSource).toContain('sensorLens:');
  });

  it('色标机身更厚，背面状态条 / 出线 / 类型色标都按机型取背面 Z', () => {
    expect(sensorSource).toContain('backZ={-S.COLOR_BODY_D / 2}');
    expect(sensorSource).toContain('backZ={S.BACK_Z}');
    expect(sensorSource).toContain('SensorStand backZ={backZ}');
    expect(sensorSource).toContain('backZ - S.LABEL_D / 2 - SURFACE_GAP');
  });

  it('三个型号键与整机传感器点位严格一致，原型链伪键挡住', () => {
    expect(Object.keys(SENSOR_VARIANTS).sort()).toEqual(Object.keys(SENSOR_POSITIONS).sort());
    expect(SENSOR_VARIANTS.color).toContain('色标');
    ['feed', 'color', 'material'].forEach((k) => expect(isSensorVariant(k)).toBe(true));
    ['__proto__', 'constructor', 'nope', '', null, undefined]
      .forEach((k) => expect(isSensorVariant(k as string | null)).toBe(false));
    expect(constantsSource).toContain('Object.prototype.hasOwnProperty.call(SENSOR_VARIANTS, name)');
  });
});

describe('气缸：展台垫实、磁开关入槽、活塞杆亮银、推板有安装细节', () => {
  it('展示底座与导向套只在展台渲染，整机仍用 MountBracket', () => {
    expect(cylinderSource).toContain('previewMount');
    expect(cylinderSource).toContain('PreviewStand');
    expect(cylinderSource).toContain('GuideBushings');
    expect(bareBody).toContain('previewMount');
    expect(bareBody).toContain('previewExtension={CYLINDER_EXTEND_POS_FEED}');
    expect(mountedBody).not.toContain('previewMount');
    expect(mountedBody).not.toContain('previewExtension');
    expect(cylinderSource).toContain('MountBracket');
    expect(cylinderSource).toContain('GuideRods');
    expect(cylinderSource).toContain('readCylinderExtensions()');
  });

  it('磁性开关贴在侧面 T 槽，活塞杆改亮银，推板补螺栓与缓冲垫', () => {
    expect(cylinderSource).toContain('D.MAGSWITCH_T');
    expect(cylinderSource).toContain('[-1, 1].flatMap((side)');
    expect(cylinderSource).not.toContain('led1Ref');
    expect(cylinderSource).toContain('paintLed(ledMats[0]');
    expect(cylinderSource).toContain('geometries.magneticSwitchCable');
    expect(cylinderSource).toContain('materials.brightSilver');
    expect(cylinderSource).not.toContain('materials.cylinderRod');
    expect(cylinderSource).toContain('geometries.plateBolt');
    expect(cylinderSource).toContain('geometries.plateBumper');
    expect(geoSource).toContain('magneticSwitch: new THREE.BoxGeometry(D.MAGSWITCH_T');
  });

  it('展台取景放宽到能同时看到缸体、推杆、推板与底座', () => {
    expect(PART_STAGES.cylinder.grid).toBe(2);
    expect(PART_STAGES.sensor.grid).toBe(0.3);
    const p = PART_STAGES.cylinder;
    expect(Math.hypot(p.camera[0] - p.target[0], p.camera[1] - p.target[1], p.camera[2] - p.target[2]))
      .toBeGreaterThan(0.12);
  });
});

describe('展台型号切换：store 深链、UI 锚点、场景同源', () => {
  it('store 解析 ?sensor= 并写回地址栏，切机位不影响型号', () => {
    expect(storeSource).toContain("q.get('sensor')");
    expect(storeSource).toContain('isSensorVariant');
    expect(storeSource).toContain('stageSensor: SensorVariant');
    expect(storeSource).toContain('setStageSensor');
    expect(storeSource).toContain('window.history.replaceState(window.history.state');
    expect(storeSource).toContain('set({ activeView, activeStage: null })');
  });

  it('工具栏提供稳定锚点，场景把型号传给同一个组件', () => {
    expect(switcherSource).toContain('data-dt-stage-sensor');
    expect(switcherSource).toContain('Object.entries(SENSOR_VARIANTS)');
    expect(switcherSource).toContain('setStageSensor(e.target.value)');
    expect(sceneSource).toContain('s.stageSensor');
    expect(sceneSource).toContain('renderBarePart(kind, signalTower, stageSensor)');
    expect(bareBody).toContain('name={sensorVariant}');
  });
});
