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
  HOPPER_PIVOT_BASE_H, HOPPER_FOOT_GAP, SLIDER_SIZE,
  PILL_R, PILL_H, PILL_STACK_STEP, MAG_TUBE_OUTER_R, MAG_CAPACITY,
  HOPPER_INNER_W, HOPPER_INNER_D, HOPPER_INNER_H,
  HOPPER_PILL_COLS, HOPPER_PILL_ROWS, HOPPER_PILL_LAYERS, HOPPER_PILL_CAPACITY,
  HOPPER_PILL_PITCH_X, HOPPER_PILL_PITCH_Z,
  SLIDER_TOP_Y, SURFACE_GAP, ASSEMBLY, VISUAL,
} from './scenes/auto-dispensing/constants';
import {
  PIVOT_LOCAL, HOPPER_SIDE_FACE_LOCAL, HOPPER_AXIAL_OFFSET, DISC_BODY_OFFSET,
  rotaryAngleRad, rotateAboutPivot, pivotInBody,
  hopperSideFaceInPivot, hopperCenterInPivot, discBodyInPivot, hopperEccentricity,
} from './scenes/auto-dispensing/rotaryPivot';
import { expandHopperStock } from './scenes/auto-dispensing/hopperContents';

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
    './scenes/auto-dispensing/hopperContents.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const sliderSource = raw['./scenes/auto-dispensing/components/SliderHopper.tsx'];
const hopperSource = raw['./scenes/auto-dispensing/components/Hopper.tsx'];
const pivotSource = raw['./scenes/auto-dispensing/rotaryPivot.ts'];
const contentsSource = raw['./scenes/auto-dispensing/hopperContents.ts'];

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

describe('接口名与共同旋转基准零漂移；派生量随放大后的几何自洽', () => {
  it('共同基准高度冻结，接药 / 斜槽 / 落斗 / 倒药坐标随斗高斗深同步让位', () => {
    expect(SLIDER_TOP_Y).toBe(1.1);
    // 冻结项：放大料斗不改变盘心/斗心高度，同轴基准不漂移
    expect(HOPPER_CENTER_Y).toBeCloseTo(1.1785, 9);
    expect(ROTARY_PIVOT_Y).toBeCloseTo(1.1785, 9);
    expect(ROTARY_PIVOT_LOCAL.Y).toBeCloseTo(0.0785, 9);
    expect(HOPPER_PIVOT_BASE_H).toBe(0.055); // 冻结的旧斗高，不得随放大改动
    expect(ROTARY_PIVOT_LOCAL.Y).not.toBe(
      SLIDER_SIZE[1] / 2 + HOPPER_FOOT_GAP + HOPPER.H / 2,
    );
    // 派生项：斗高 +0.020 ⇒ 斗口 / 落点 / 斜槽末端各上移 ΔH/2；斗深 +0.032 ⇒ Z 前移 ΔD/2
    expect(HOPPER_CENTER_Z).toBeCloseTo(0.198, 9);
    expect(HOPPER_OPEN_Y).toBeCloseTo(1.216, 9);
    expect(PILL_LAND_Y).toBeCloseTo(1.204, 9);
    expect(CHUTE_RAMP_END_Y).toBeCloseTo(1.238, 9);
    expect(CHUTE_RAMP_END_Z).toBeCloseTo(0.158, 9); // 由基准 Z 决定，与斗深无关
    expect(DUMP_MOUTH_Z).toBeCloseTo(0.198, 9);
    // 斜槽末端必须仍高于斗口且在斗口 Z 范围内，否则药片会撞斗壁
    expect(CHUTE_RAMP_END_Y).toBeGreaterThan(HOPPER_OPEN_Y);
    expect(CHUTE_RAMP_END_Z).toBeGreaterThan(HOPPER_CENTER_Z - HOPPER.D / 2);
    expect(CHUTE_RAMP_END_Z).toBeLessThan(HOPPER_CENTER_Z + HOPPER.D / 2);
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

describe('取药料斗放大后的比例与装药容量', () => {
  it('不再是「挂在气缸上的小方块」：斗宽 > 1.5 倍料筒外径，且略大于圆盘直径', () => {
    expect(HOPPER.W / (2 * MAG_TUBE_OUTER_R)).toBeGreaterThan(1.5);
    expect(HOPPER.W).toBeGreaterThan(2 * ROTARY_DISC.R);
    expect(HOPPER.W / ROTARY_BODY.W).toBeGreaterThan(0.9);
    expect(HOPPER_INNER_D - 2 * PILL_R).toBeGreaterThan(0.025); // Z 向净余量 > 25mm（单边 > 12mm）
  });

  it('内腔能装下多个药品：2 列 × 2 排 × 4 层 = 16 粒，装得下整仓 10 粒', () => {
    expect(HOPPER_INNER_W).toBeCloseTo(0.088, 9);
    expect(HOPPER_INNER_D).toBeCloseTo(0.082, 9);
    expect(HOPPER_INNER_H).toBeCloseTo(0.070, 9);
    expect(HOPPER_PILL_COLS).toBe(2);
    expect(HOPPER_PILL_ROWS).toBe(2); // 顶层能同时露出 2×2 共 4 粒
    expect(HOPPER_PILL_LAYERS).toBe(4);
    expect(HOPPER_PILL_CAPACITY).toBe(16);
    expect(HOPPER_PILL_CAPACITY).toBeGreaterThanOrEqual(MAG_CAPACITY);
    expect(HOPPER_PILL_CAPACITY).toBeGreaterThanOrEqual(5); // 默认配方 A2+B1+C1+D1
  });

  it('逐粒排布不贴壁、不越出斗口', () => {
    expect(HOPPER_PILL_PITCH_X).toBeGreaterThanOrEqual(2 * PILL_R);
    expect(HOPPER_PILL_PITCH_Z).toBeGreaterThanOrEqual(2 * PILL_R);
    const outerX = ((HOPPER_PILL_COLS - 1) / 2) * HOPPER_PILL_PITCH_X + PILL_R;
    const outerZ = ((HOPPER_PILL_ROWS - 1) / 2) * HOPPER_PILL_PITCH_Z + PILL_R;
    expect(outerX).toBeLessThanOrEqual(HOPPER_INNER_W / 2);
    expect(outerZ).toBeLessThanOrEqual(HOPPER_INNER_D / 2);
    const bottomY = -HOPPER.H / 2 + HOPPER.T + PILL_H / 2;
    const topY = bottomY + (HOPPER_PILL_LAYERS - 1) * PILL_STACK_STEP + PILL_H / 2;
    expect(topY).toBeLessThanOrEqual(HOPPER.H / 2);
  });

  it('斗内可视化用推导容量与来源仓着色，不再写死「最多 4 粒」', () => {
    expect(hopperSource).toContain('HOPPER_PILL_CAPACITY');
    expect(hopperSource).toContain('hopperStock');
    expect(hopperSource).toContain('VISUAL.PILL_COLOR[byMag[i]]');
    expect(hopperSource).not.toMatch(/Math\.max\(hopperPills, 0\), 4\)/);
  });
});

describe('多种药品在俯视可见的顶层同时可辨（轮转交错展开）', () => {
  const perLayer = HOPPER_PILL_COLS * HOPPER_PILL_ROWS;

  it('默认一轮 A2+B1+C1+D1：底层 2×2 就凑齐 4 个仓', () => {
    const seq = expandHopperStock({ A: 2, B: 1, C: 1, D: 1 });
    expect(seq).toHaveLength(5);
    expect(seq.slice(0, perLayer)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(seq.slice(0, perLayer).map((m) => VISUAL.PILL_COLOR[m])).size).toBe(4);
    expect(seq[perLayer]).toBe('A');
  });

  it('灌满 16 粒：每一层（含顶层）都是四仓各一粒，不再整层同色', () => {
    const seq = expandHopperStock({ A: 4, B: 4, C: 4, D: 4 });
    expect(seq).toHaveLength(HOPPER_PILL_CAPACITY);
    for (let i = 0; i < seq.length; i += perLayer) {
      expect(new Set(seq.slice(i, i + perLayer)).size).toBe(4);
    }
    const topLayer = seq.slice(-perLayer);
    expect(new Set(topLayer.map((m) => VISUAL.PILL_COLOR[m])).size).toBe(4);
  });

  it('来源计数守恒，旧式「只写计数」调用仍有 A 色兜底', () => {
    const stock = { A: 3, B: 0, C: 2, D: 1 };
    const seq = expandHopperStock(stock);
    expect(seq).toHaveLength(6);
    (['A', 'B', 'C', 'D'] as const).forEach((m) => {
      expect(seq.filter((x) => x === m).length).toBe(stock[m]);
    });
    expect(expandHopperStock({ A: 0, B: 0, C: 0, D: 0 }, 3)).toEqual(['A', 'A', 'A']);
    expect(expandHopperStock({ A: -1, B: 2, C: 0, D: 0 })).toEqual(['B', 'B']);
  });

  it('源码级：渲染走轮转纯函数，禁止退回按仓分组展开', () => {
    expect(hopperSource).toContain('expandHopperStock(hopperStock');
    expect(contentsSource).toContain('for (const m of HOPPER_MAG_IDS)');
    expect(hopperSource).not.toContain('MAG_IDS.forEach');
  });
});
