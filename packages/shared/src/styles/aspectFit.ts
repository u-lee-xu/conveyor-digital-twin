/**
 * 相机宽高比自适应（跨设备画面适配的单一数学来源）。
 *
 * 透视相机的水平视野 = 2 · atan(tan(fov/2) · aspect)。设备是横向长的，
 * 桌面 16:10 下机位常量刚好把整机收进画面；手机竖屏 aspect≈0.46 时
 * 水平视野只剩桌面的 ~29%，结果只能看到设备中间一小段，两端全被裁掉。
 *
 * 与其把 fov 撑到 110°（严重广角畸变），不如沿视线把相机拉远：
 * 保持水平视野覆盖同样的横向跨度，模型在竖屏里横向铺满、上下留白。
 * 桌面（aspect ≥ 设计基准）一律返回 1，观感零回退。
 *
 * 本文件是纯函数，不引 React / three，便于 Node 侧源码级自检直接 import。
 */
export const DESIGN_ASPECT = 1.6;
/**
 * 最大拉远倍数：按「刚好完整入画」标定（手机竖屏 390×844 理论需 3.46 倍，
 * 实测 2.9 倍时整机已占约 98% 画面宽度、两端仍不裁切），再拉远只会让设备
 * 更小、上下留白更多。极窄视口 320×900 也夹到这个值。
 */
export const MAX_ASPECT_FIT = 2.9;

export type Vec3Tuple = readonly [number, number, number];

/** 相机距离放大倍数；width / height 用 CSS 像素即可 */
export function aspectFitScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const aspect = width / height;
  if (aspect >= DESIGN_ASPECT) return 1;
  return Math.min(MAX_ASPECT_FIT, DESIGN_ASPECT / aspect);
}

/** 把相机相对目标点的距离放大 k 倍；桌面 k=1 时原样返回 */
export function fitCameraPosition(
  position: Vec3Tuple,
  target: Vec3Tuple,
  width: number,
  height: number,
): [number, number, number] {
  const k = aspectFitScale(width, height);
  if (k <= 1) return [position[0], position[1], position[2]];
  return [
    target[0] + (position[0] - target[0]) * k,
    target[1] + (position[1] - target[1]) * k,
    target[2] + (position[2] - target[2]) * k,
  ];
}

/** OrbitControls.maxDistance 必须同步放宽，否则拉远后会被强行拽回原地 */
export function fitMaxDistance(base: number, width: number, height: number): number {
  const k = aspectFitScale(width, height);
  // k=1 时必须原样返回 base：桌面缩放手感零回退，只有窄屏才放宽
  if (k <= 1) return base;
  return base * k * 1.15;
}

/** 高 DPR 手机/平板限制渲染像素比：观众端 1，主控端最多 1.5 */
export function renderPixelRatio(isViewer: boolean): number {
  if (isViewer) return 1;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(dpr, 1.5);
}
