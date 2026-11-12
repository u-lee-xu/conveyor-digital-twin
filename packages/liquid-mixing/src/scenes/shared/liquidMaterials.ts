/**
 * 液体混装场景共享材质单例 —— 与汇川龙门 / 自动配药同一套写法。
 *
 * 颜色一律取自 liquidConstants.ts 的 LIQUID_VISUAL（展开自 shared 工业视觉令牌）
 * 与 LIQUID_TANKS[tank].color；本文件只负责 metalness / roughness / transparent /
 * emissive 等表面质感，组件里不再内联 new MeshStandardMaterial，避免纯色塑料感
 * 与每帧重建材质。
 *
 * 全图共面红线：本文件不提供任何带 polygonOffset 的薄贴面材质，
 * 相邻可见面一律由 LIQUID_GEOM 的错开量与 GAP 做几何错开，
 * 从根上避免「贴面与本体混叠 / 贴面埋进本体」。
 */
import * as THREE from 'three';
import { LIQUID_VISUAL, LIQUID_TANKS } from '../../constants/liquidConstants';

const V = LIQUID_VISUAL;

/** 相邻可见面最小错开量：全图共面红线统一取 LIQUID_VISUAL.SURFACE_GAP */
export const GAP = LIQUID_VISUAL.SURFACE_GAP;

/** 高对比不透明液柱：轻微自发光，暗背景下仍一眼可辨 */
function liquidMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.18,
    metalness: 0.05,
    roughness: 0.3,
  });
}

/** 液面圆盘：比液柱稍亮，与柱顶沿 Y 错开 ≥ CAP_GAP */
function surfaceMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    metalness: 0.05,
    roughness: 0.2,
  });
}

export const LM = {
  /** 不锈钢罐体 / 封头 / 法兰 / 人孔 */
  steel: new THREE.MeshStandardMaterial({ color: V.SILVER_COLOR, metalness: 0.88, roughness: 0.24 }),
  /** 深色结构件：机架 / 立柱 / 支腿 / 泵座 */
  frame: new THREE.MeshStandardMaterial({ color: V.STRUCT_COLOR, metalness: 0.6, roughness: 0.45 }),
  /** 端盖 / 包边 / 观察窗金属框 */
  cap: new THREE.MeshStandardMaterial({ color: V.ENDCAP_COLOR, metalness: 0.8, roughness: 0.3 }),
  /** 螺栓 / 接线盒 / 传感器本体 */
  bolt: new THREE.MeshStandardMaterial({ color: V.MAGSWITCH_COLOR, metalness: 0.45, roughness: 0.6 }),
  /** ① 半透明玻璃主壳：能看穿内部彩色液柱 */
  glass: new THREE.MeshPhysicalMaterial({
    color: V.GLASS,
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  }),
  /** ③ 罐壁竖向观察窗玻璃：比主壳更透，配金属边框 */
  window: new THREE.MeshPhysicalMaterial({
    color: V.GLASS,
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  /** ④ 外置刻度尺底板 */
  scale: new THREE.MeshStandardMaterial({ color: V.SCALE, metalness: 0.1, roughness: 0.7 }),
  /** 刻度刻线 */
  tick: new THREE.MeshStandardMaterial({ color: V.STRUCT_COLOR, metalness: 0.3, roughness: 0.75 }),
  /** 管路 */
  pipe: new THREE.MeshStandardMaterial({ color: V.PIPE, metalness: 0.75, roughness: 0.32 }),
  /** 球阀 / 泵蜗壳 */
  valve: new THREE.MeshStandardMaterial({ color: V.CYL_BODY_COLOR, metalness: 0.7, roughness: 0.35 }),
  /** 阀手柄 */
  handle: new THREE.MeshStandardMaterial({ color: V.LAMP_RED, metalness: 0.35, roughness: 0.55 }),
  /** 电机本体 */
  motor: new THREE.MeshStandardMaterial({ color: V.CABINET_COLOR, metalness: 0.5, roughness: 0.5 }),
  /** 电机散热筋 */
  rib: new THREE.MeshStandardMaterial({ color: V.STRUCT_COLOR, metalness: 0.65, roughness: 0.4 }),
  /** 搅拌轴 / 桨叶（亮银） */
  shaft: new THREE.MeshStandardMaterial({ color: V.SILVER_COLOR, metalness: 0.9, roughness: 0.18 }),
  /** ② 四罐液柱，颜色取 LIQUID_TANKS[tank].color；mix 由 liquidMixColor 逐帧改写 */
  liquidA: liquidMat(LIQUID_TANKS.a.color),
  liquidB: liquidMat(LIQUID_TANKS.b.color),
  liquidMix: liquidMat(LIQUID_TANKS.mix.color),
  liquidProduct: liquidMat(LIQUID_TANKS.product.color),
  /** 液面圆盘：稍亮，底面与柱顶错开 ≥ CAP_GAP */
  surfaceA: surfaceMat(LIQUID_TANKS.a.color),
  surfaceB: surfaceMat(LIQUID_TANKS.b.color),
  surfaceMix: surfaceMat(LIQUID_TANKS.mix.color),
  surfaceProduct: surfaceMat(LIQUID_TANKS.product.color),
  /** 开关量液位传感器 LED：亮绿 / 暗 */
  ledOn: new THREE.MeshStandardMaterial({
    color: V.LAMP_GREEN, emissive: V.LAMP_GREEN, emissiveIntensity: 1.8, roughness: 0.3,
  }),
  ledOff: new THREE.MeshStandardMaterial({
    color: V.LAMP_DARK, emissive: V.MAGSWITCH_COLOR, emissiveIntensity: 0,
    roughness: 0.6, metalness: 0.4,
  }),
} as const;

/* ---------------------- 程序化金属拉丝纹理（惰性烘焙） ---------------------- */

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** 确定性 hash，对应 GLSL hash12，保证 A/B 两次烘焙结果一致 */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** 双线性插值 value noise */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

interface BakedTextures {
  brushed: THREE.DataTexture;
  micro: THREE.DataTexture;
}

/** 生成 RGBA DataTexture：无 DOM 依赖，Node 也可构造 */
function makeDataTexture(
  size: number,
  srgb: boolean,
  fn: (u: number, v: number) => [number, number, number],
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const [r, g, b] = fn(i / size, j / size);
      const k = (j * size + i) * 4;
      data[k] = clamp255(r);
      data[k + 1] = clamp255(g);
      data[k + 2] = clamp255(b);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function bakeBrushed(): BakedTextures {
  const size = 128;
  /** 沿 U 的高频条纹（金属拉丝）+ 低频颗粒，近白，不抢结构色 */
  const brushed = makeDataTexture(size, true, (u, v) => {
    const streak = Math.pow(valueNoise(u * 90, v * 2), 4) * 0.25;
    const grain = 0.5 * valueNoise(u * 6, v * 6) + 0.5 * valueNoise(u * 12, v * 12);
    const w = 0.94 + 0.05 * grain - 0.045 * streak;
    return [w, w * 0.997, w * 0.99];
  });
  /** 微凹凸：近白，与材质 roughness 相乘后不失真 */
  const micro = makeDataTexture(size, false, (u, v) => {
    const w = 0.9 + 0.09 * valueNoise(u * 10, v * 10)
      - 0.03 * Math.pow(valueNoise(u * 90, v * 2), 4);
    return [w, w, w];
  });
  return { brushed, micro };
}

/** 挂纹理的金属键；玻璃 / 液柱 / 刻度 / LED 不挂，避免透明排序与质感失真 */
const METAL_KEYS = [
  'steel', 'frame', 'cap', 'pipe', 'valve', 'motor', 'rib', 'shaft',
] as const;

let baked: BakedTextures | null = null;

/**
 * 幂等：只在首次渲染液体混装场景时烘焙并挂载一次，之后调用直接返回。
 * A/B 两次调用结果一致（纹理数据确定性生成，材质 map / bumpMap 引用不变）。
 */
export function applyLiquidProceduralTextures(): void {
  if (baked) return;
  const t = bakeBrushed();
  baked = t;
  for (const key of METAL_KEYS) {
    const mat = LM[key];
    mat.map = t.brushed;
    mat.bumpMap = t.micro;
    mat.bumpScale = 0.0012;
    mat.needsUpdate = true;
  }
}
