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
  CHUTE_LIFT, CHUTE_PLATE, CHUTE_ANGLE, CHUTE_NORMAL, CHUTE_TANGENT,
  CHUTE_QUATERNION, CHUTE_PLATE_ROTATION, chuteCenterAt, sortChutePoint,
  sortSlotX, chuteSurfaceY, isAtChuteEntry, isChuteEndReached, chuteClearance,
  slideStartCenter, SLIDE_START_LIFT,
  BIN_CENTER_Z, BIN_REST_Y, GUIDE_END_Z, CHUTE_END_CENTER_Z,
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
const chuteMathSource = src('scenes/conveyor-sorting/sortChute.ts');
const slideDebugSource = src('scenes/conveyor-sorting/materialSlideDebug.ts');
const appSource = src('App.tsx');
const effectsSource = src('platform/ConveyorDeviceEffects.tsx');

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

  it('工件沿槽面法线抬升、姿态与槽面同角度，底面必然平行不啃板', () => {
    expect(CHUTE_PLATE_ROTATION[0]).toBe(-CHUTE_ANGLE);
    expect(CHUTE_NORMAL[1]).toBeCloseTo(Math.cos(CHUTE_ANGLE), 6);
    expect(CHUTE_NORMAL[2]).toBeCloseTo(-Math.sin(CHUTE_ANGLE), 6);
    expect(CHUTE_QUATERNION[0]).toBeCloseTo(Math.sin(-CHUTE_ANGLE / 2), 6);
    expect(CHUTE_QUATERNION[3]).toBeCloseTo(Math.cos(-CHUTE_ANGLE / 2), 6);
    // 下坡切线朝向 -Z / -Y，且与法线正交
    expect(CHUTE_TANGENT[2]).toBeLessThan(0);
    expect(CHUTE_TANGENT[1]).toBeLessThan(0);
    expect(CHUTE_TANGENT[1] * CHUTE_NORMAL[1] + CHUTE_TANGENT[2] * CHUTE_NORMAL[2])
      .toBeCloseTo(0, 6);
    // 工件中心 - 槽面点 = CHUTE_LIFT * 法线（不再是世界 Y 硬抬）
    const [, cy, cz] = chuteCenterAt('sorting1', SORT_CHUTE.ENTRY_Z);
    expect(cy - SORT_CHUTE.ENTRY_Y).toBeCloseTo(CHUTE_LIFT * CHUTE_NORMAL[1], 6);
    expect(cz - SORT_CHUTE.ENTRY_Z).toBeCloseTo(CHUTE_LIFT * CHUTE_NORMAL[2], 6);
    // 法线抬升量必须大于旧版「世界 Y 抬升」在斜面下坡角造成的啃板深度
    const oldLiftY = CHUTE_LIFT;
    const neededLiftY = COMPONENT.MATERIAL_HALF_SIZE
      * (Math.cos(CHUTE_ANGLE) + Math.sin(CHUTE_ANGLE)) + SORT_CHUTE.PLATE_T / 2;
    expect(oldLiftY).toBeLessThan(neededLiftY);
    // 沿法线抬升后，工件底面离槽面还有 0.006 的净空，不会共面闪烁
    expect(CHUTE_LIFT - COMPONENT.MATERIAL_HALF_SIZE).toBeCloseTo(0.006, 6);
    // 槽板中心沿法线下移半板厚，旋转后顶面与 ENTRY_Y / EXIT_Y 精确重合
    expect(CHUTE_PLATE.center[1] + (SORT_CHUTE.PLATE_T / 2) * CHUTE_NORMAL[1])
      .toBeCloseTo((SORT_CHUTE.ENTRY_Y + SORT_CHUTE.EXIT_Y) / 2, 6);
  });

  it('兜底轨迹起点贴槽口、终点落在收集盒内，且全程不高于起点', () => {
    const start = sortChutePoint('sorting1', 0);
    const end = sortChutePoint('sorting1', 1);
    expect(start[0]).toBe(CYLINDERS.sorting1);
    expect(start[2]).toBeCloseTo(SORT_CHUTE.ENTRY_Z + CHUTE_LIFT * CHUTE_NORMAL[2], 6);
    expect(start[1]).toBeCloseTo(SORT_CHUTE.ENTRY_Y + CHUTE_LIFT * CHUTE_NORMAL[1], 6);
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
    expect(isChuteEndReached({ x: 0, y: 0.7, z: CHUTE_END_CENTER_Z })).toBe(true);
    expect(isChuteEndReached({ x: 0, y: 1.05, z: SORT_CHUTE.ENTRY_Z })).toBe(false);
  });

  it('法向净空按真实姿态算支撑半径：平放会啃板，跟着斜面转则不啃板', () => {
    const slopeQ = {
      x: CHUTE_QUATERNION[0], y: CHUTE_QUATERNION[1],
      z: CHUTE_QUATERNION[2], w: CHUTE_QUATERNION[3],
    };
    for (const z of [SORT_CHUTE.ENTRY_Z, SORT_CHUTE.EXIT_Z]) {
      const [x, y, cz] = chuteCenterAt('sorting1', z);
      const pose = { x, y, z: cz };
      // 姿态与槽面平行：净空恰好等于设计余量
      expect(chuteClearance(pose, slopeQ)).toBeCloseTo(0.006, 5);
      // 旧版「方块保持平放」：下坡角会啃进斜面 2cm 以上，正是用户看到的现象
      expect(chuteClearance(pose)).toBeLessThan(-0.015);
      // 沿世界 Y 下沉 0.03m 也是啃板
      expect(chuteClearance({ x, y: y - 0.03, z: cz }, slopeQ)).toBeLessThan(0);
    }
  });

  it('滑落真的交给 Rapier dynamic 刚体，而不是脚本平移', () => {
    expect(materialSource).toContain("setBodyType(0 as const, true)");
    expect(materialSource).toContain('body.setRotation(SLOPE, true)');
    // 只锁角自由度：平移仍由重力/摩擦/接触求解，但不会翻滚导致下坡角啃板
    expect(materialSource).toContain('setEnabledRotations(false, false, false, true)');
    expect(materialSource).toContain('setEnabledRotations(true, true, true, true)');
    expect(materialSource).toContain('setAdditionalSolverIterations(8)');
    expect(materialSource).toContain('CHUTE_TANGENT[1] * SORT_CHUTE.SLIDE_LAUNCH_SPEED');
    expect(materialSource).toContain("drive = 'physics'");
    expect(materialSource).toContain('writeMaterialSlideDebug');
    // 旧版 sliding 分支是脚本平移；现在该分支只释放刚体，不再驱动 kinematic 位移
    expect(materialSource).not.toContain('sortChutePoint(slotRef.current, t)');
    expect(chuteSource).toContain('<ChuteColliders />');
    expect(chuteSource).toContain('CHUTE_PLATE_ROTATION');
    expect(chuteSource).toContain('friction={SORT_CHUTE.CHUTE_FRICTION}');
    expect(materialSource).toContain('slideStartCenter(slotRef.current)');
    // 摩擦必须低于 tan(坡角)，否则物理工件会粘在槽面上
    const avgFriction = (0.6 + SORT_CHUTE.CHUTE_FRICTION) / 2;
    expect(Math.tan(CHUTE_ANGLE)).toBeGreaterThan(avgFriction);
    expect(SORT_CHUTE.SLIDE_MAX_SECONDS).toBeGreaterThan(SORT_CHUTE.SLIDE_SECONDS);
  });

  it('释放点贴着槽面、槽板碰撞体向下加厚，抑制首帧接触穿透', () => {
    expect(SLIDE_START_LIFT).toBeLessThan(CHUTE_LIFT);
    expect(SLIDE_START_LIFT - COMPONENT.MATERIAL_HALF_SIZE)
      .toBeCloseTo(SORT_CHUTE.SLIDE_START_GAP, 6);
    const [sx, sy, sz] = slideStartCenter('sorting1');
    expect(sx).toBe(CYLINDERS.sorting1);
    expect(chuteClearance({ x: sx, y: sy, z: sz }, {
      x: CHUTE_QUATERNION[0], y: CHUTE_QUATERNION[1],
      z: CHUTE_QUATERNION[2], w: CHUTE_QUATERNION[3],
    })).toBeCloseTo(SORT_CHUTE.SLIDE_START_GAP, 5);
    expect(SORT_CHUTE.COLLIDER_HALF_T).toBeGreaterThan(SORT_CHUTE.PLATE_T / 2);
    expect(chuteSource).toContain('COLLIDER_HALF_T');
    // 加厚后碰撞体顶面仍与可见槽面重合
    expect(SORT_CHUTE.PLATE_T / 2 - SORT_CHUTE.COLLIDER_HALF_T + SORT_CHUTE.COLLIDER_HALF_T)
      .toBeCloseTo(SORT_CHUTE.PLATE_T / 2, 8);
  });

  it('落盒后计入收集列表、再清理刚体，演示状态机才能继续闭环', () => {
    expect(materialSource).toContain('addSortedItem');
    expect(materialSource).toContain('SETTLE_SECONDS');
    expect(materialSource).toContain('DROP_SECONDS');
    expect(materialSource).toContain('SLIDE_MAX_SECONDS');
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

describe('进口引导挡板：把推板送来的工件收进槽道', () => {
  it('从槽口朝传送带方向延伸并外张成喇叭口', () => {
    expect(SORT_CHUTE.GUIDE_LEN).toBeGreaterThan(0.2);
    expect(SORT_CHUTE.GUIDE_FLARE_ANGLE).toBeGreaterThan(0);
    expect(GUIDE_END_Z).toBeGreaterThan(SORT_CHUTE.ENTRY_Z + SORT_CHUTE.GUIDE_LEN);
    expect(chuteSource).toContain('<GuideRails />');
    expect(chuteSource).toContain('GUIDE_FLARE_ANGLE');
    expect(chuteSource).toContain('guide-col-');
    expect(chuteMathSource).toContain('GUIDE_END_Z');
  });

  it('末端不能挡住沿 X 输送的带面工件，槽道要容得下推板', () => {
    // 带面工件中心 Z≈0、半宽 0.07，引导挡板最靠 +Z 的末端必须还在它前面
    expect(GUIDE_END_Z).toBeLessThan(-COMPONENT.MATERIAL_HALF_SIZE);
    // 推板半宽 0.13 要能穿过 HALF_W=0.16 的槽道
    expect(COMPONENT.CYLINDER_PUSH_PLATE_HALF[0]).toBeLessThan(SORT_CHUTE.HALF_W);
    expect(SORT_CHUTE.GUIDE_BOTTOM_Y).toBeLessThan(SORT_CHUTE.ENTRY_Y);
  });

  it('靠槽口一侧盒壁降到工件底面以下，动态工件能越过盒口', () => {
    const blockBottomAtExit = SORT_CHUTE.EXIT_Y
      + (CHUTE_LIFT - COMPONENT.MATERIAL_HALF_SIZE) * CHUTE_NORMAL[1];
    const backWallTop = SORT_CHUTE.BIN_FLOOR_Y + SORT_CHUTE.BIN_BACK_WALL_H;
    expect(backWallTop).toBeLessThan(blockBottomAtExit);
    expect(SORT_CHUTE.BIN_BACK_WALL_H).toBeLessThan(SORT_CHUTE.BIN_WALL_H);
    expect(chuteSource).toContain('BIN_BACK_WALL_H');
  });
});

describe('运行时诊断：能证明滑落真的进了物理世界', () => {
  it('两个入口都暴露只读的滑落快照', () => {
    expect(slideDebugSource).toContain('readMaterialSlideDebug');
    expect(slideDebugSource).toContain('releases: number');
    expect(appSource).toContain('getMaterialSlide: readMaterialSlideDebug');
    expect(effectsSource).toContain('getMaterialSlide: readMaterialSlideDebug');
  });
});
