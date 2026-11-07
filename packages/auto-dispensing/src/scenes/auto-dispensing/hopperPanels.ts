/**
 * 取药料斗「板件尺寸链」的唯一来源（1:1 局部坐标，原点 = 料斗几何中心）。
 *
 * 旧实现把五块板都写成满尺寸盒子再互相穿插：
 *   - 底板中心在 -H/2（比物理碰撞体低 T/2），底面与四壁外表面共面重叠一圈；
 *   - ±X 壁满深 D、±Z 壁满宽 W，四角整块互相穿入，角部端面与外壁同向共面；
 *   - 上口翻边压在壁顶里，内外两个竖面都与壁面精确共面。
 * 这几处正是用户看到的闪烁 / 穿模来源：同向共面的两个可见面在深度测试里争夺同一像素。
 *
 * 新尺寸链按「榫接」重算，任意两块板只**相接**、不互相穿入：
 *   - 底板 W × T × D，y ∈ [-H/2, -H/2+T]（与物理底板严格同源）；
 *   - ±X 壁 满深 D，y 从底板顶面长到斗口；
 *   - ±Z 壁 只占内宽 W-2T，夹在两片 X 壁之间，外表面与 X 壁端面在同一平面上但**投影不重叠**；
 *   - 四根翻边是独立的一圈，坐在壁顶之上，角部榫接互不重叠。
 * 因此「同向共面且投影重叠」的面数为 0，「体积互相穿入」的板对数也为 0。
 *
 * physicsGeometry.ts 的落斗碰撞体直接由 hopperWallPanels() 缩放得到，
 * 可见几何与碰撞体不会再出现第二套尺寸。
 */
import { HOPPER, SURFACE_GAP } from './constants';

/** 上口翻边厚度（沿用旧观感比例，但改为坐在壁顶之上而非压进壁体） */
export const HOPPER_RIM_T = HOPPER.T * 0.7;
/** 斗内药片底面离底板的微小净空：避免药片底盖与底板顶面精确共面 */
export const HOPPER_PILL_SEAT_GAP = SURFACE_GAP / 5;

export type PanelRole = 'wall' | 'rim';
export interface HopperPanel {
  key: string;
  role: PanelRole;
  /** 盒体中心（相对料斗几何中心） */
  center: [number, number, number];
  /** 盒体全尺寸 [X, Y, Z] */
  size: [number, number, number];
}

/** 底板 + 四壁；顺序与 physicsGeometry.hopperColliderParts() 的历史顺序一致 */
export function hopperWallPanels(): HopperPanel[] {
  const { W, H, D, T } = HOPPER;
  const wallH = H - T;             // 从底板顶面 -H/2+T 长到斗口 +H/2
  const wallY = T / 2;            // (-H/2+T + H/2) / 2
  const xWallX = W / 2 - T / 2;
  const zWallZ = D / 2 - T / 2;
  const panel = (
    key: string,
    center: [number, number, number],
    size: [number, number, number],
  ): HopperPanel => ({ key, role: 'wall', center, size });

  return [
    panel('bottom', [0, -H / 2 + T / 2, 0], [W, T, D]),
    panel('wallX-', [-xWallX, wallY, 0], [T, wallH, D]),
    panel('wallX+', [xWallX, wallY, 0], [T, wallH, D]),
    // ±Z 壁只占内宽，端面正好贴合 ±X 壁内表面：相接但不穿入
    panel('wallZ-', [0, wallY, -zWallZ], [W - 2 * T, wallH, T]),
    panel('wallZ+', [0, wallY, zWallZ], [W - 2 * T, wallH, T]),
  ];
}

/** 上口四根亮银翻边：坐在壁顶之上，角部由 ±Z 条收口，互不重叠 */
export function hopperRimPanels(): HopperPanel[] {
  const { W, H, D, T } = HOPPER;
  const y = H / 2 + HOPPER_RIM_T / 2;
  const xWallX = W / 2 - T / 2;
  const zWallZ = D / 2 - T / 2;
  const panel = (
    key: string,
    center: [number, number, number],
    size: [number, number, number],
  ): HopperPanel => ({ key, role: 'rim', center, size });

  return [
    // ±Z 条满宽收口，±X 条只占内深，二者在 Z = ±(D/2-T) 处相接
    panel('rimZ-', [0, y, -zWallZ], [W, HOPPER_RIM_T, T]),
    panel('rimZ+', [0, y, zWallZ], [W, HOPPER_RIM_T, T]),
    panel('rimX-', [-xWallX, y, 0], [T, HOPPER_RIM_T, D - 2 * T]),
    panel('rimX+', [xWallX, y, 0], [T, HOPPER_RIM_T, D - 2 * T]),
  ];
}

export function hopperPanels(): HopperPanel[] {
  return [...hopperWallPanels(), ...hopperRimPanels()];
}

type Bounds = [[number, number], [number, number], [number, number]];

export function panelBounds(p: HopperPanel): Bounds {
  return [0, 1, 2].map((i) => [
    p.center[i] - p.size[i] / 2,
    p.center[i] + p.size[i] / 2,
  ]) as Bounds;
}

/**
 * 列出「同向共面且投影有正面积」的面组合 —— 这正是 z-fighting 的充分条件。
 * 只比较同为 min 面或同为 max 面的组合：min 面与 max 面相贴时法线相反，
 * 在 FrontSide 材质下不可能同时朝向观察者，不构成闪烁。
 */
export function coplanarFaceClashes(panels: HopperPanel[], eps = 1e-9): string[] {
  const clashes: string[] = [];
  for (let a = 0; a < panels.length; a += 1) {
    for (let b = a + 1; b < panels.length; b += 1) {
      const A = panelBounds(panels[a]);
      const B = panelBounds(panels[b]);
      for (let axis = 0; axis < 3; axis += 1) {
        for (const side of [0, 1]) {
          const fa = A[axis][side];
          const fb = B[axis][side];
          if (Math.abs(fa - fb) > eps) continue;
          const others = [0, 1, 2].filter((i) => i !== axis);
          const overlap = others.map((i) =>
            Math.min(A[i][1], B[i][1]) - Math.max(A[i][0], B[i][0]));
          if (overlap[0] > eps && overlap[1] > eps) {
            clashes.push(
              `${panels[a].key} × ${panels[b].key}: ${'xyz'[axis]}.${side === 0 ? 'min' : 'max'} @ ${fa}`,
            );
          }
        }
      }
    }
  }
  return clashes;
}

/** 列出存在正体积互相穿入的板对；榫接设计下应为空 */
export function panelVolumeOverlaps(panels: HopperPanel[], eps = 1e-9): string[] {
  const overlaps: string[] = [];
  for (let a = 0; a < panels.length; a += 1) {
    for (let b = a + 1; b < panels.length; b += 1) {
      const A = panelBounds(panels[a]);
      const B = panelBounds(panels[b]);
      const o = [0, 1, 2].map((i) =>
        Math.min(A[i][1], B[i][1]) - Math.max(A[i][0], B[i][0]));
      if (o.every((v) => v > eps)) {
        overlaps.push(`${panels[a].key} × ${panels[b].key}: ${o.map((v) => v.toFixed(5)).join('/')}`);
      }
    }
  }
  return overlaps;
}
