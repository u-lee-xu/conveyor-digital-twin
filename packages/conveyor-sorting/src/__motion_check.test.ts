/**
 * 推料运动学 / 分拣槽自检。
 *
 * 用户反馈「演示模式偶发推杆推料穿模、正常推到最后也穿模、推出传送带就消失」，
 * 这里用纯函数 + 源码级断言把修复结论固化下来，防止后续又退回
 * 「两个 useFrame 各算各的行程 + kinematic 撞 dynamic + z<-0.3 立刻消失」。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPONENT, PUSH_KINEMATICS, SORT_CHUTE,
  CYLINDER_POSITIONS, CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
  CYLINDERS, VISUAL, SCENE_CAMERA,
} from './scenes/conveyor-sorting/constants';
import { CYLINDER_EXTEND_POS_SORT as SHARED_CYLINDER_EXTEND_POS_SORT } from './components/scene/shared/constants';
import {
  readCylinderExtensions, writeCylinderExtensions, cylinderTarget, stepExtension,
} from './scenes/conveyor-sorting/cylinderKinematics';
import { getPushPlateCenterZ, getPushedMaterialZ } from './scenes/conveyor-sorting/components/helpers';
import {
  CHUTE_LIFT, CHUTE_PLATE, sortChutePoint, sortSlotX, chuteSurfaceY,
  isAtChuteEntry, BIN_CENTER_Z, BIN_REST_Y,
} from './scenes/conveyor-sorting/sortChute';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');

const materialSource = src('scenes/conveyor-sorting/components/PhysicsMaterial.tsx');
const cylinderSource = src('scenes/conveyor-sorting/components/PhysicsCylinder.tsx');
const driverSource = src('scenes/conveyor-sorting/CylinderMotionDriver.tsx');
const chuteSource = src('scenes/conveyor-sorting/components/PhysicsSortChute.tsx');
const sceneSource = src('scenes/conveyor-sorting/SceneContent.tsx');
const sensorSource = src('scenes/conveyor-sorting/components/PhysicsSensor.tsx');
const geoSource = src('components/scene/shared/geometries.ts');
const matSource = src('components/scene/shared/materials.ts');
const storeSource = src('stores/useDeviceStore.ts');

describe('推板与工件：同一个行程真值、同一个间隙公式', () => {
  it('共享快照是原地修改，任何组件持有的旧引用都能看到本帧新值', () => {
    const held = readCylinderExtensions();
    writeCylinderExtensions({ feed: 0.2, sorting1: 0.1, sorting2: -0.05 });
    expect(held).toBe(readCylinderExtensions());
    expect(held.feed).toBe(0.2);
    expect(held.sorting1).toBe(0.1);
    // 复位，避免污染后续用例
    writeCylinderExtensions({
      feed: CYLINDER_RETRACT_POS, sorting1: CYLINDER_RETRACT_POS, sorting2: CYLINDER_RETRACT_POS,
    });
  });

  it('行程推进有单帧限速且能收敛到目标', () => {
    let ext = CYLINDER_RETRACT_POS;
    for (let i = 0; i < 200; i += 1) ext = stepExtension(ext, CYLINDER_EXTEND_POS_SORT, 1 / 60);
    expect(ext).toBe(CYLINDER_EXTEND_POS_SORT);
    expect(stepExtension(0, CYLINDER_EXTEND_POS_SORT, 1 / 60)).toBeLessThanOrEqual(COMPONENT.CYLINDER_MAX_STEP);
    expect(cylinderTarget('feed', true)).toBe(CYLINDER_EXTEND_POS_FEED);
    expect(cylinderTarget('sorting1', true)).toBe(CYLINDER_EXTEND_POS_SORT);
    expect(cylinderTarget('sorting2', false)).toBe(CYLINDER_RETRACT_POS);
  });

  it('推板与工件中心差恰好等于 FOLLOW_GAP，且不小于两个半厚之和', () => {
    const z = CYLINDER_POSITIONS.sorting1[2];
    const plate = getPushPlateCenterZ(z, 0.1);
    const work = getPushedMaterialZ(z, 0.1);
    expect(plate - work).toBeCloseTo(PUSH_KINEMATICS.FOLLOW_GAP, 6);
    expect(PUSH_KINEMATICS.FOLLOW_GAP).toBeGreaterThan(
      COMPONENT.CYLINDER_PUSH_PLATE_HALF[2] + COMPONENT.MATERIAL_HALF_SIZE,
    );
    expect(PUSH_KINEMATICS.CLEARANCE).toBeGreaterThan(0);
  });

  it('可见几何与碰撞体同源，不再出现看得见 0.075 / 碰得到 0.07', () => {
    expect(geoSource).toContain('C.MATERIAL_HALF_SIZE * 2');
    expect(geoSource).toContain('C.CYLINDER_PUSH_PLATE_HALF');
    expect(COMPONENT.CYLINDER_PUSH_PLATE_HALF[0]).toBeGreaterThan(COMPONENT.MATERIAL_HALF_SIZE);
  });

  it('两个组件都只读共享快照，不再各自算行程', () => {
    expect(materialSource).toContain('readCylinderExtensions()');
    expect(cylinderSource).toContain('readCylinderExtensions()');
    expect(cylinderSource).not.toContain('currentExtensionRef');
    expect(driverSource).toContain('writeCylinderExtensions(next)');
    expect(driverSource).toContain('}, -1)'); // driver 用 priority -1 排到消费者之前
    expect(sceneSource).toContain('<CylinderMotionDriver />');
  });

  it('旧版穿模逻辑已移除：不再靠 !isOnConveyor 跳过接管、不再用写死偏移', () => {
    expect(materialSource).not.toContain('CYLINDER_PUSH_TARGET_OFFSET');
    expect(materialSource).not.toContain('if (!isOnConveyor) { pushingCylinder');
    expect(materialSource).toContain('getPushedMaterialZ');
    expect(materialSource).not.toContain('setInterval(checkPosition');
  });

  it('两处 CYLINDER_EXTEND_POS_SORT 保持同源（评分 / 仿真读的是旧共享常量文件）', () => {
    expect(SHARED_CYLINDER_EXTEND_POS_SORT).toBe(CYLINDER_EXTEND_POS_SORT);
  });
});

describe('气缸建模：紧凑型带导杆比例 + 安装支座', () => {
  it('缸体不再是 0.18×0.8 的细长盒，长宽比落在紧凑气缸区间', () => {
    const width = COMPONENT.CYLINDER_BODY_HALF_XZ * 2;
    const length = COMPONENT.CYLINDER_BODY_HALF_LEN * 2;
    expect(length / width).toBeGreaterThan(2);
    expect(length / width).toBeLessThan(3.2);
    expect(COMPONENT.CYLINDER_PUSH_PLATE_HALF[0] * 2).toBeGreaterThan(COMPONENT.MATERIAL_HALF_SIZE * 2);
  });

  it('双导杆、安装支座与限速常量都接入组件', () => {
    expect(cylinderSource).toContain('GuideRods');
    expect(cylinderSource).toContain('MountBracket');
    expect(cylinderSource).toContain('D.GUIDE_ROD_LEN');
    expect(COMPONENT.CYLINDER_MAX_STEP).toBeGreaterThan(0);
    expect(COMPONENT.CYLINDER_MAX_STEP).toBeLessThan(0.08);
  });
});

describe('分拣槽：推出带面后沿槽滑落入盒，而不是凭空消失', () => {
  it('分拣行程能把工件送到槽口', () => {
    for (const name of ['sorting1', 'sorting2'] as const) {
      const z = getPushedMaterialZ(CYLINDER_POSITIONS[name][2], CYLINDER_EXTEND_POS_SORT);
      expect(isAtChuteEntry(z), `${name} 推板行程不足`).toBe(true);
    }
    // 上料气缸不需要把工件送出带外
    const feedZ = getPushedMaterialZ(CYLINDER_POSITIONS.feed[2], CYLINDER_EXTEND_POS_FEED);
    expect(feedZ).toBeGreaterThan(SORT_CHUTE.ENTRY_Z);
  });

  it('槽位 X 与分拣气缸严格对齐，槽面从带边一路下降到盒口', () => {
    expect(sortSlotX('sorting1')).toBe(CYLINDERS.sorting1);
    expect(sortSlotX('sorting2')).toBe(CYLINDERS.sorting2);
    expect(chuteSurfaceY(SORT_CHUTE.ENTRY_Z)).toBe(SORT_CHUTE.ENTRY_Y);
    expect(chuteSurfaceY(SORT_CHUTE.EXIT_Z)).toBe(SORT_CHUTE.EXIT_Y);
    expect(SORT_CHUTE.EXIT_Y).toBeLessThan(SORT_CHUTE.ENTRY_Y);
    expect(CHUTE_PLATE.length).toBeGreaterThan(SORT_CHUTE.ENTRY_Z - SORT_CHUTE.EXIT_Z);
  });

  it('轨迹起点贴槽口、终点落在收集盒内，且全程不高于起点', () => {
    const start = sortChutePoint('sorting1', 0);
    const end = sortChutePoint('sorting1', 1);
    expect(start[0]).toBe(CYLINDERS.sorting1);
    expect(start[2]).toBe(SORT_CHUTE.ENTRY_Z);
    expect(start[1]).toBeCloseTo(SORT_CHUTE.ENTRY_Y + CHUTE_LIFT, 6);
    expect(end[2]).toBe(BIN_CENTER_Z);
    expect(end[1]).toBe(BIN_REST_Y);
    expect(end[1]).toBeLessThan(start[1]);
    let lastY = start[1];
    let lastZ = start[2];
    for (let i = 1; i <= 20; i += 1) {
      const [, y, z] = sortChutePoint('sorting2', i / 20);
      expect(y).toBeLessThanOrEqual(lastY + 1e-6);
      expect(z).toBeLessThanOrEqual(lastZ + 1e-6);
      lastY = y; lastZ = z;
    }
  });

  it('落盒后计入收集列表、再清理刚体，演示状态机才能继续闭环', () => {
    expect(materialSource).toContain('addSortedItem');
    expect(materialSource).toContain('sortChutePoint');
    expect(materialSource).toContain('SETTLE_SECONDS');
    expect(storeSource).toContain('addSortedItem');
    expect(storeSource).toContain('SORT_CHUTE.MAX_STACK');
    expect(chuteSource).toContain('CollectedBlocks');
    expect(sceneSource).toContain('<PhysicsSortChute />');
    // 旧的「z < -0.30 立即 clearMaterial」已彻底移除
    expect(materialSource).not.toContain('CONVEYOR_Z_MARGIN');
  });

  it('槽面是亮银钢板 + 窄导向线 + 横向压条，不再是整条黑带', () => {
    expect(chuteSource).toContain('materials.chutePlate');
    expect(chuteSource).toContain('ChuteCleats');
    expect(chuteSource).toContain('SORT_CHUTE.GUIDE_HALF_W * 2');
    expect(matSource).toContain('chutePlate: new THREE.MeshStandardMaterial');
    expect(SORT_CHUTE.GUIDE_HALF_W * 2).toBeLessThan(SORT_CHUTE.HALF_W);
    expect(SORT_CHUTE.CLEAT_COUNT).toBeGreaterThanOrEqual(3);
  });

  it('收集盒靠观察者一侧是低唇口，内壁压暗，读得出是空心容器', () => {
    expect(SORT_CHUTE.BIN_FRONT_WALL_H).toBeLessThan(SORT_CHUTE.BIN_WALL_H / 2);
    expect(chuteSource).toContain('BIN_FRONT_WALL_H');
    expect(chuteSource).toContain('materials.binInterior');
    expect(chuteSource).toContain('rim-x-');
    expect(matSource).toContain('binInterior: new THREE.MeshStandardMaterial');
  });

  it('盒内堆叠不会溢出盒口或穿过侧壁', () => {
    expect(SORT_CHUTE.MAX_STACK).toBe(6); // 3 列 × 2 排 × 1 层
    expect(chuteSource).toContain('idx % 3');
    expect(0.115 + COMPONENT.MATERIAL_HALF_SIZE).toBeLessThan(SORT_CHUTE.BIN_HALF_X);
    expect(0.08 + COMPONENT.MATERIAL_HALF_SIZE).toBeLessThan(SORT_CHUTE.BIN_HALF_Z);
    expect(BIN_REST_Y - SORT_CHUTE.BIN_FLOOR_Y + COMPONENT.MATERIAL_HALF_SIZE)
      .toBeGreaterThan(SORT_CHUTE.BIN_FRONT_WALL_H);
  });
});

describe('视角与传感器 LED', () => {
  it('总览机位在 -Z 侧，才能看到气缸推板前脸', () => {
    expect(SCENE_CAMERA[2]).toBeLessThan(0);
    expect(CYLINDER_POSITIONS.feed[2]).toBeGreaterThan(0);
  });

  it('检测态换成亮琥珀橙并加强自发光，LED 移到顶部朝上', () => {
    expect(VISUAL.SENSOR_ACTIVE_COLOR).not.toBe(VISUAL.LAMP_GREEN);
    expect(VISUAL.SENSOR_ACTIVE_EMISSIVE).toBeGreaterThan(VISUAL.SENSOR_EMISSIVE_INTENSITY);
    expect(matSource).toContain('VISUAL.SENSOR_ACTIVE_COLOR');
    expect(sensorSource).toContain('materials.sensorHalo');
    expect(sensorSource).toContain('SENSOR_BULB_OFFSET_Y');
    expect(COMPONENT.SENSOR_BULB_OFFSET_Z).toBe(0);
  });

  it('小灯珠用不受 tone mapping 影响的纯色材质，避免 emissive 削顶成白点', () => {
    expect(matSource).toContain('sensorDetected: new THREE.MeshBasicMaterial');
    expect(matSource).toContain('toneMapped: false');
    // 大面积背面状态条仍走带自发光的 Standard 材质
    expect(matSource).toContain('sensorPanelGlow');
    expect(sensorSource).toContain('materials.sensorPanelGlow');
  });
});
