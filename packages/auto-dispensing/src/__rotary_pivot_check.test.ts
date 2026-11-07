/**
 * 「滑块-旋转气缸-料斗」共同旋转基准自检。
 *
 * 用户要求：料斗侧面中心点与旋转气缸圆盘中心点精确重合，并以该点为共同旋转基准；
 * 圆盘转动时料斗绕同一中心同步旋转，不产生偏心或额外位移；
 * 同时保持该模块既有功能及与其它模块的接口不变。
 *
 * 这里用纯函数数值断言 + 源码级断言把结论固化，防止后续又退回
 * 「料斗挂在盘心 +Y 偏移的支架上、跟着盘公转」的旧装配。
 */
import { describe, it, expect } from 'vitest';

import {
  ROTARY_BODY, ROTARY_DISC, ROTARY_CENTER, ROTARY_PIVOT_LOCAL,
  ROTARY_PIVOT_IN_BODY_Z, ROTARY_STANDOFF,
  ROTARY_PIVOT_Y, ROTARY_PIVOT_Z, DISC_CENTER_Y, DISC_CENTER_Z,
  HOPPER, HOPPER_CENTER_Y, HOPPER_CENTER_Z, HOPPER_LOCAL_Y, HOPPER_LOCAL_Z,
  HOPPER_OPEN_Y, PILL_LAND_Y, CHUTE_RAMP_END_Y, CHUTE_RAMP_END_Z,
  DUMP_MOUTH_X, DUMP_MOUTH_Y, DUMP_MOUTH_Z,
  SLIDER_TOP_Y, SURFACE_GAP, ASSEMBLY,
} from './scenes/auto-dispensing/constants';
import {
  PIVOT_LOCAL, HOPPER_SIDE_FACE_LOCAL, HOPPER_AXIAL_OFFSET, DISC_BODY_OFFSET,
  rotaryAngleRad, rotateAboutPivot, pivotInBody,
  hopperSideFaceInPivot, hopperCenterInPivot, discBodyInPivot, hopperEccentricity,
} from './scenes/auto-dispensing/rotaryPivot';

/**
 * 与 __assembly_check.test.ts 保持同一套源码收集方式：用 Vite 的 ?raw，
 * 不用 node:fs —— 本包 vite.config.ts 挂了 electron-renderer，会把 fs
 * 重定向到基于 require 的 shim，在 vitest 的 ESM 里会抛 "require is not defined"。
 */
const raw = import.meta.glob<string>(
  [
    './scenes/auto-dispensing/components/SliderHopper.tsx',
    './scenes/auto-dispensing/components/Hopper.tsx',
    './scenes/auto-dispensing/rotaryPivot.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const sliderSource = raw['./scenes/auto-dispensing/components/SliderHopper.tsx'];
const hopperSource = raw['./scenes/auto-dispensing/components/Hopper.tsx'];
const pivotSource = raw['./scenes/auto-dispensing/rotaryPivot.ts'];

const ANGLES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('共同旋转基准：盘端面中心与料斗侧面中心精确重合', () => {
  it('两个中心点在世界坐标下是同一个点（误差 < 1e-9 m）', () => {
    // 圆盘端面中心（旋转轴上的盘心）
    const discFace = [
      ASSEMBLY.sliderHopper.position[0],
      DISC_CENTER_Y,
      DISC_CENTER_Z + ROTARY_DISC.TH / 2,
    ];
    // 料斗 -Z 侧壁外表面中心
    const hopperSide = [
      ASSEMBLY.sliderHopper.position[0],
      HOPPER_CENTER_Y,
      HOPPER_CENTER_Z - HOPPER.D / 2,
    ];
    expect(dist(discFace, hopperSide)).toBeLessThan(1e-9);
    expect(ROTARY_PIVOT_Y).toBe(DISC_CENTER_Y);
    expect(ROTARY_PIVOT_Y).toBe(HOPPER_CENTER_Y);
    expect(ROTARY_PIVOT_Z).toBe(HOPPER_CENTER_Z - HOPPER.D / 2);
    expect(ROTARY_PIVOT_Z - DISC_CENTER_Z).toBeCloseTo(ROTARY_DISC.TH / 2, 9);
  });

  it('气缸位姿由基准反推：主体局部坐标里的基准点就是盘端面中心', () => {
    expect(ROTARY_PIVOT_IN_BODY_Z).toBe(ROTARY_BODY.D / 2 + ROTARY_DISC.TH);
    expect(ASSEMBLY.sliderHopper.position[2] + ROTARY_CENTER.Z + PIVOT_LOCAL[2])
      .toBeCloseTo(ROTARY_PIVOT_Z, 9);
    expect(ASSEMBLY.sliderHopper.position[1] + ROTARY_CENTER.Y)
      .toBeCloseTo(ROTARY_PIVOT_Y, 9);
    expect(PIVOT_LOCAL).toEqual([0, 0, ROTARY_PIVOT_IN_BODY_Z]);
    expect(ROTARY_PIVOT_LOCAL.Y).toBeCloseTo(ROTARY_CENTER.Y, 9);
    expect(DISC_BODY_OFFSET).toEqual([0, 0, -ROTARY_DISC.TH / 2]);
    // 安装支座仍有正厚度，气缸不会悬空也不会与滑块面共面
    expect(ROTARY_STANDOFF).toBeGreaterThan(2 * SURFACE_GAP);
    expect(ROTARY_STANDOFF).toBeLessThan(0.02);
  });

  it('料斗中心相对基准只有旋转轴方向的让位，XY 偏心恒为 0', () => {
    expect(HOPPER_SIDE_FACE_LOCAL).toEqual([0, 0, 0]);
    expect(HOPPER_AXIAL_OFFSET).toEqual([0, 0, HOPPER.D / 2]);
    expect(HOPPER_LOCAL_Y).toBe(0);
    expect(HOPPER_LOCAL_Z).toBeCloseTo(HOPPER_CENTER_Z - DISC_CENTER_Z, 9);
    expect(HOPPER_LOCAL_Z).toBeCloseTo(ROTARY_DISC.TH / 2 + HOPPER.D / 2, 9);
    expect(hopperEccentricity(0)).toBe(0);
  });
});

describe('同步旋转：任意角度都不偏心、不产生额外位移', () => {
  it('唯一角度源：angle 0→1 对应 0→-90°，越界被夹住', () => {
    expect(rotaryAngleRad(0)).toBe(0);
    expect(rotaryAngleRad(1)).toBe(-Math.PI / 2);
    expect(rotaryAngleRad(-0.5)).toBe(0);
    expect(rotaryAngleRad(2)).toBe(-Math.PI / 2);
    // 旋转函数本身不是空操作：XY 向量确实被绕 Z 转过去
    const r = rotateAboutPivot([1, 0, 0], 1);
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(-1, 9);
    expect(r[2]).toBe(0);
  });

  it('全程：基准点、料斗侧面中心、料斗中心、盘体积中心都不随角度平移', () => {
    for (const angle of ANGLES) {
      expect(dist(pivotInBody(angle), PIVOT_LOCAL)).toBe(0);
      expect(dist(hopperSideFaceInPivot(angle), [0, 0, 0])).toBe(0);
      expect(dist(hopperCenterInPivot(angle), HOPPER_AXIAL_OFFSET)).toBe(0);
      expect(dist(discBodyInPivot(angle), DISC_BODY_OFFSET)).toBe(0);
      expect(hopperEccentricity(angle)).toBe(0);
      // 料斗几何中心在 XY 平面上恒等于共同基准，没有公转半径
      expect(hopperCenterInPivot(angle)[0]).toBe(0);
      expect(hopperCenterInPivot(angle)[1]).toBe(0);
      expect(hopperCenterInPivot(angle)[2]).toBe(HOPPER.D / 2);
    }
  });

  it('世界坐标闭合：料斗中心 = 装配表 + 气缸主体 + 基准 + 轴向让位', () => {
    const at = ASSEMBLY.sliderHopper.position;
    expect(at[1] + ROTARY_CENTER.Y + hopperCenterInPivot(0)[1])
      .toBeCloseTo(HOPPER_CENTER_Y, 9);
    expect(at[2] + ROTARY_CENTER.Z + PIVOT_LOCAL[2] + hopperCenterInPivot(1)[2])
      .toBeCloseTo(HOPPER_CENTER_Z, 9);
  });
});

describe('源码级约束：单一旋转 group、料斗零额外偏移', () => {
  it('圆盘与料斗挂在同一个以基准点为原点的 group，共用一个角度', () => {
    expect(sliderSource).toContain('position={PIVOT_LOCAL} rotation={[0, 0, rotaryAngleRad(angle)]}');
    expect((sliderSource.match(/rotaryAngleRad\(angle\)/g) || []).length).toBe(1);
    expect(sliderSource).not.toContain('-angle * Math.PI / 2');
    expect(sliderSource).toContain('position={DISC_BODY_OFFSET}');
    expect(sliderSource).toContain('position={HOPPER_SIDE_FACE_LOCAL}');
    expect(sliderSource).toContain('<Hopper />');
    expect(pivotSource).toContain('export function rotaryAngleRad');
  });

  it('旧版偏心支架已移除：组件里不再出现 HOPPER_LOCAL_Y / HOPPER_LOCAL_Z 偏移', () => {
    expect(sliderSource).not.toMatch(/HOPPER_LOCAL_[YZ]/);
    expect(sliderSource).not.toContain('从盘心向 +Y 延伸');
    expect(sliderSource).not.toContain('料斗在盘上方');
  });

  it('料斗组件把局部原点定义在 -Z 侧面中心，网格整体前移半个斗深', () => {
    expect(hopperSource).toContain('局部原点');
    expect(hopperSource).toContain('position={[0, 0, HOPPER.D / 2]}');
    expect(hopperSource).toContain('共同旋转基准');
  });
});

describe('既有功能与对外接口零漂移', () => {
  it('接药 / 落斗 / 斜槽 / 倒药的世界坐标保持原值', () => {
    expect(SLIDER_TOP_Y).toBe(1.1);
    expect(HOPPER_CENTER_Y).toBeCloseTo(1.1785, 9);
    expect(HOPPER_CENTER_Z).toBeCloseTo(0.182, 9);
    expect(HOPPER_OPEN_Y).toBeCloseTo(1.206, 9);
    expect(PILL_LAND_Y).toBeCloseTo(1.194, 9);
    expect(CHUTE_RAMP_END_Y).toBeCloseTo(1.228, 9);
    expect(CHUTE_RAMP_END_Z).toBeCloseTo(0.158, 9);
    expect(DUMP_MOUTH_Z).toBeCloseTo(0.182, 9);
  });

  it('倒药起点仍由同心几何推导，且落在翻转后的斗口上', () => {
    // 同心后料斗中心不再公转，斗口只在 +X 方向偏半个斗高
    expect(DUMP_MOUTH_X).toBeCloseTo(HOPPER_LOCAL_Y + HOPPER.H / 2, 9);
    expect(DUMP_MOUTH_X).toBeCloseTo(HOPPER.H / 2, 9);
    expect(DUMP_MOUTH_Y).toBe(DISC_CENTER_Y);
    expect(DUMP_MOUTH_Y).toBe(ROTARY_PIVOT_Y);
    expect(DUMP_MOUTH_Z).toBe(HOPPER_CENTER_Z);
  });

  it('盘 / 斗 / 滑块同轴，料斗 X 偏移仍为 0', () => {
    expect(PIVOT_LOCAL[0]).toBe(0);
    expect(PIVOT_LOCAL[1]).toBe(0);
    expect(HOPPER_SIDE_FACE_LOCAL[0]).toBe(0);
    expect(HOPPER_SIDE_FACE_LOCAL[1]).toBe(0);
  });
});
