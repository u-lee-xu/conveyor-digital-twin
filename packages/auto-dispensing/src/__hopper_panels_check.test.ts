/**
 * 取药料斗板件尺寸链自检：把「闪烁 / 穿模」变成可证明的几何不变量。
 *
 * 用户反馈「组成各板和边缘边界的尺寸计算下修一下，现在有比较明显的闪烁穿模」。
 * 根因是旧 Hopper.tsx 把五块板写成满尺寸盒子互相穿插，翻边又压进壁体，
 * 造成多处同向共面的可见面在深度测试里争夺同一像素（z-fighting）。
 *
 * 本自检固化三条结论：
 *   ① 任意两板「同向共面且投影有正面积」= 0 组（z-fighting 的充分条件）；
 *   ② 任意两板正体积互相穿入 = 0 组（榫接，只相接不穿插）；
 *   ③ 可见板件与物理落斗碰撞体严格同源，外轮廓 / 内腔 / 斗口平面闭合。
 */
import { describe, it, expect } from 'vitest';

import {
  HOPPER, SCENE_SCALE, SURFACE_GAP,
  PILL_R, PILL_H, PILL_STACK_STEP,
  HOPPER_PILL_COLS, HOPPER_PILL_ROWS, HOPPER_PILL_LAYERS,
  HOPPER_PILL_PITCH_X, HOPPER_PILL_PITCH_Z,
} from './scenes/auto-dispensing/constants';
import {
  hopperPanels, hopperWallPanels, hopperRimPanels, panelBounds,
  coplanarFaceClashes, panelVolumeOverlaps,
  HOPPER_RIM_T, HOPPER_PILL_SEAT_GAP,
} from './scenes/auto-dispensing/hopperPanels';
import { hopperColliderParts } from './scenes/auto-dispensing/physicsGeometry';

/** 与 __assembly_check / __rotary_pivot_check 一致的 ?raw 源码收集方式 */
const raw = import.meta.glob<string>(
  [
    './scenes/auto-dispensing/components/Hopper.tsx',
    './scenes/auto-dispensing/components/SliderHopper.tsx',
    './scenes/auto-dispensing/hopperPanels.ts',
    './scenes/auto-dispensing/physicsGeometry.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const hopperSource = raw['./scenes/auto-dispensing/components/Hopper.tsx'];
const sliderSource = raw['./scenes/auto-dispensing/components/SliderHopper.tsx'];
const panelsSource = raw['./scenes/auto-dispensing/hopperPanels.ts'];
const physicsSource = raw['./scenes/auto-dispensing/physicsGeometry.ts'];

const boundsOf = (panels: ReturnType<typeof hopperPanels>) => {
  const bs = panels.map(panelBounds);
  return [0, 1, 2].map((i) => [
    Math.min(...bs.map((b) => b[i][0])),
    Math.max(...bs.map((b) => b[i][1])),
  ]);
};

describe('板件榫接：零共面竞争、零体积穿插', () => {
  it('一共 5 块壁板 + 4 根翻边，键名与角色完整', () => {
    const all = hopperPanels();
    expect(all).toHaveLength(9);
    expect(hopperWallPanels().map((p) => p.key)).toEqual([
      'bottom', 'wallX-', 'wallX+', 'wallZ-', 'wallZ+',
    ]);
    expect(hopperRimPanels().map((p) => p.key)).toEqual([
      'rimZ-', 'rimZ+', 'rimX-', 'rimX+',
    ]);
    expect(all.filter((p) => p.role === 'wall')).toHaveLength(5);
    expect(all.filter((p) => p.role === 'rim')).toHaveLength(4);
    expect(new Set(all.map((p) => p.key)).size).toBe(9);
    all.forEach((p) => p.size.forEach((v) => expect(v).toBeGreaterThan(0)));
  });

  it('同向共面的可见面组合为 0 —— 不存在 z-fighting 的几何条件', () => {
    expect(coplanarFaceClashes(hopperPanels())).toEqual([]);
    // 旧版几何必须被判为有问题，证明这个检测器确实能抓到闪烁而不是恒真
    const legacy = [
      { key: 'legacyBottom', role: 'wall' as const, center: [0, -0.0375, 0] as [number, number, number],
        size: [0.098, 0.005, 0.092] as [number, number, number] },
      { key: 'legacyWallX', role: 'wall' as const, center: [0.0465, 0, 0] as [number, number, number],
        size: [0.005, 0.075, 0.092] as [number, number, number] },
    ];
    expect(coplanarFaceClashes(legacy).length).toBeGreaterThan(0);
  });

  it('任意两块板都不互相穿入（榫接只相接）', () => {
    expect(panelVolumeOverlaps(hopperPanels())).toEqual([]);
  });
});

describe('外轮廓 / 内腔 / 斗口边界闭合', () => {
  const { W, H, D, T } = HOPPER;

  it('壁板外表面严格落在 ±W/2、±D/2、-H/2..H/2', () => {
    const [bx, by, bz] = boundsOf(hopperWallPanels());
    expect(bx[0]).toBeCloseTo(-W / 2, 9);
    expect(bx[1]).toBeCloseTo(W / 2, 9);
    expect(bz[0]).toBeCloseTo(-D / 2, 9);
    expect(bz[1]).toBeCloseTo(D / 2, 9);
    expect(by[0]).toBeCloseTo(-H / 2, 9);
    expect(by[1]).toBeCloseTo(H / 2, 9);
  });

  it('翻边坐在壁顶之上，不压进壁体；斗口平面仍是 +H/2', () => {
    const rim = hopperRimPanels();
    const rimsBottom = Math.min(...rim.map((p) => panelBounds(p)[1][0]));
    const wallsTop = Math.max(...hopperWallPanels().map((p) => panelBounds(p)[1][1]));
    expect(rimsBottom).toBeCloseTo(wallsTop, 9);
    expect(rimsBottom).toBeCloseTo(H / 2, 9);
    expect(Math.max(...rim.map((p) => panelBounds(p)[1][1])))
      .toBeCloseTo(H / 2 + HOPPER_RIM_T, 9);
    expect(HOPPER_RIM_T).toBeCloseTo(T * 0.7, 9);
  });

  it('底板顶面 / 四壁内表面围出的内腔与物理口径一致', () => {
    const bottom = panelBounds(hopperWallPanels()[0]);
    expect(bottom[1][0]).toBeCloseTo(-H / 2, 9);
    expect(bottom[1][1]).toBeCloseTo(-H / 2 + T, 9);
    const xInner = Math.min(...hopperWallPanels()
      .filter((p) => p.key.startsWith('wallX+')).map((p) => panelBounds(p)[0][0]));
    const zInner = Math.min(...hopperWallPanels()
      .filter((p) => p.key.startsWith('wallZ+')).map((p) => panelBounds(p)[2][0]));
    expect(xInner).toBeCloseTo(W / 2 - T, 9);
    expect(zInner).toBeCloseTo(D / 2 - T, 9);
  });

  it('±Z 壁只占内宽，四角由 ±X 壁满深收口且投影不重叠', () => {
    const walls = hopperWallPanels();
    const xPlus = panelBounds(walls.find((p) => p.key === 'wallX+')!);
    const zPlus = panelBounds(walls.find((p) => p.key === 'wallZ+')!);
    expect(xPlus[2][1]).toBeCloseTo(D / 2, 9);   // X 壁满深
    expect(zPlus[0][1]).toBeCloseTo(W / 2 - T, 9); // Z 壁只到 X 壁内表面
    expect(zPlus[0][1]).toBeCloseTo(xPlus[0][0], 9);
  });
});

describe('可见几何与物理碰撞体同源', () => {
  it('碰撞体 5 块 = 壁板表按 SCENE_SCALE 等比缩放，顺序一致', () => {
    const parts = hopperColliderParts();
    const walls = hopperWallPanels();
    expect(parts).toHaveLength(walls.length);
    parts.forEach((part, i) => {
      expect(part.center[0]).toBeCloseTo(walls[i].center[0] * SCENE_SCALE, 9);
      expect(part.center[1]).toBeCloseTo(walls[i].center[1] * SCENE_SCALE, 9);
      expect(part.center[2]).toBeCloseTo(walls[i].center[2] * SCENE_SCALE, 9);
      expect(part.half[0]).toBeCloseTo(walls[i].size[0] * SCENE_SCALE / 2, 9);
      expect(part.half[1]).toBeCloseTo(walls[i].size[1] * SCENE_SCALE / 2, 9);
      expect(part.half[2]).toBeCloseTo(walls[i].size[2] * SCENE_SCALE / 2, 9);
    });
  });

  it('底板顶面、X/Z 壁内表面仍满足既有落斗判定口径', () => {
    const parts = hopperColliderParts();
    expect(parts[0].center[1]).toBeCloseTo((-HOPPER.H / 2 + HOPPER.T / 2) * SCENE_SCALE, 9);
    expect(parts[0].center[1] + parts[0].half[1])
      .toBeCloseTo((-HOPPER.H / 2 + HOPPER.T) * SCENE_SCALE, 9);
    expect(Math.abs(parts[1].center[0]) + parts[1].half[0])
      .toBeCloseTo(HOPPER.W / 2 * SCENE_SCALE, 9);
    expect(Math.abs(parts[3].center[2]) + parts[3].half[2])
      .toBeCloseTo(HOPPER.D / 2 * SCENE_SCALE, 9);
  });

  it('源码级：物理层直接引用板件表，不再另写一套尺寸', () => {
    expect(physicsSource).toContain('hopperWallPanels()');
    expect(physicsSource).not.toContain('const halfW = W / 2 * S');
  });
});

describe('药片落座与贴面', () => {
  it('底面离底板有正净空但不漂浮，顶层仍不越出斗口', () => {
    expect(HOPPER_PILL_SEAT_GAP).toBeGreaterThan(0);
    expect(HOPPER_PILL_SEAT_GAP).toBeLessThan(SURFACE_GAP);
    const bottomY = -HOPPER.H / 2 + HOPPER.T + HOPPER_PILL_SEAT_GAP + PILL_H / 2;
    const topY = bottomY + (HOPPER_PILL_LAYERS - 1) * PILL_STACK_STEP + PILL_H / 2;
    expect(topY).toBeLessThanOrEqual(HOPPER.H / 2);
    expect(bottomY - PILL_H / 2).toBeGreaterThan(-HOPPER.H / 2 + HOPPER.T);
  });

  it('逐粒节距不贴壁，药片半径小于内腔', () => {
    expect(HOPPER_PILL_PITCH_X).toBeGreaterThanOrEqual(2 * PILL_R);
    expect(HOPPER_PILL_PITCH_Z).toBeGreaterThanOrEqual(2 * PILL_R);
    expect(HOPPER_PILL_COLS * HOPPER_PILL_ROWS * HOPPER_PILL_LAYERS).toBe(16);
  });
});

describe('源码级防回归：组件只按尺寸表渲染', () => {
  it('Hopper.tsx 走 hopperPanels()，不再现算满尺寸板件', () => {
    expect(hopperSource).toContain('hopperPanels()');
    expect(hopperSource).toContain('<boxGeometry args={p.size} />');
    expect(hopperSource).not.toContain('position={[0, -H / 2, 0]}');
    expect(hopperSource).not.toContain('args={[W, H, T]}');
    expect(hopperSource).not.toContain('args={[W + T,');
  });

  it('药片落座使用共享净空常量，避免与底板精确共面', () => {
    expect(hopperSource).toContain('HOPPER_PILL_SEAT_GAP');
    expect(panelsSource).toContain('export const HOPPER_PILL_SEAT_GAP');
  });

  it('斗底托板嵌入斗底且四周按内腔缩进，不留悬空缝也不共面', () => {
    expect(sliderSource).toContain('HOPPER_INNER_W');
    expect(sliderSource).toContain('HOPPER_INNER_D');
    expect(sliderSource).toContain('+ SURFACE_GAP - HOPPER_FOOT_GAP / 2');
    expect(sliderSource).not.toContain('HOPPER.W * 0.9');
  });
});
