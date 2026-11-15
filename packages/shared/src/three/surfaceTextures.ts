/**
 * 跨场景程序化表面纹理 —— 与汇川龙门场景的 Saltline 参考基线同源。
 *
 * 研究结论（见 inovance-gantry/src/scenes/shared/proceduralTextures.ts）：
 * Saltline 的真实感主要来自一张程序化噪声贴图 + fbm 分形噪声，再由
 * onBeforeCompile 注入颜色 / 粗糙度 / 法线。本项目改用等价但更稳的做法：
 *   - 同一套 hash / valueNoise / fbm 结构在 JS 端预烘焙成 DataTexture；
 *   - 挂到既有 MeshStandardMaterial 单例的 map / bumpMap，不碰 shader chunk；
 *   - 纹理以近白为主，只提供拉丝与木纹细节，不抢工业视觉令牌的结构色。
 *
 * 本文件是**其余场景包的共享实现**，算法与龙门逐字一致（含 128²、RepeatWrapping、
 * repeat(3,3)、anisotropy 4、brushed/micro/wood 三张贴图、bumpScale 0.0012/0.0018）。
 * 龙门与液体混装已有各自实现且已验收，刻意保持不动，避免重复改动。
 *
 * 刻意不从 shared/src/index.ts 做 barrel 导出：barrel 被所有设备包引用，值导出
 * 会把 three 纹理代码拉进每个设备分包甚至首屏。使用者一律走子路径：
 *   @digital-twin/shared/three/surfaceTextures
 *
 * 惰性单例：烘焙只在某个场景首次渲染时发生一次，未进入的场景零成本。
 * ?noProcTex=1 仅用于性能 A/B，默认行为不变。
 */
import * as THREE from 'three';

/** 确定性伪随机，对应 GLSL hash12 的角色 */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** 双线性插值 value noise，与 Saltline 的 n2() 同结构 */
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

/** 分形布朗运动：与 Saltline fbm3/fbm5 相同的旋转矩阵与幅值衰减，按总幅值归一化 */
export function fbm(x: number, y: number, octaves = 4): number {
  let amplitude = 0.5, sum = 0, total = 0;
  let px = x, py = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(px, py);
    total += amplitude;
    const nx = 1.6 * px + 1.2 * py + 17.3;
    const ny = -1.2 * px + 1.6 * py + 17.3;
    px = nx; py = ny;
    amplitude *= 0.5;
  }
  return sum / total;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** 生成无缝可平铺的 RGBA DataTexture；srgb=true 用于颜色贴图，false 用于凹凸/数据贴图 */
function makeTexture(size: number, srgb: boolean, fn: (u: number, v: number) => [number, number, number]): THREE.DataTexture {
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

export interface SurfaceTextureSet {
  brushed: THREE.DataTexture;
  micro: THREE.DataTexture;
  wood: THREE.DataTexture;
}

let cached: SurfaceTextureSet | null = null;

/** 惰性单例：首次进入任一使用场景时才烘焙一次，写入 window 供 CDP 性能验收读取 */
export function getSurfaceTextures(): SurfaceTextureSet {
  if (cached) return cached;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  /** 铝型材 / 金属拉丝：沿 U 的高频条纹（对应 Saltline 的 streaks）+ fbm 颗粒 */
  const brushed = makeTexture(128, true, (u, v) => {
    const streak = Math.pow(valueNoise(u * 90, v * 2), 4) * 0.25;
    const grain = fbm(u * 6, v * 6, 4);
    const w = 0.94 + 0.05 * grain - 0.045 * streak;
    return [w, w * 0.997, w * 0.99];
  });

  /** 微凹凸：近白，保证与材质自身 roughness 相乘后不失真 */
  const micro = makeTexture(128, false, (u, v) => {
    const g = fbm(u * 10, v * 10, 4);
    const streak = Math.pow(valueNoise(u * 90, v * 2), 4);
    const w = 0.9 + 0.09 * g - 0.03 * streak;
    return [w, w, w];
  });

  /** 木质年轮：年轮条纹 + fbm 扰动，暖色偏移 */
  const wood = makeTexture(128, true, (u, v) => {
    const warp = fbm(u * 4, v * 4, 3);
    const rings = 0.5 + 0.5 * Math.sin((u * 24 + warp * 4) * Math.PI);
    const grain = fbm(u * 8, v * 30, 4);
    const w = 0.82 + 0.12 * rings + 0.06 * grain;
    return [w, w * 0.97, w * 0.92];
  });

  cached = { brushed, micro, wood };
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  if (typeof window !== 'undefined') {
    (window as unknown as { __dtSurfaceTextureBakeMs?: number }).__dtSurfaceTextureBakeMs = elapsed;
  }
  return cached;
}

/** ?noProcTex=1 仅用于性能 A/B；Node / 非浏览器环境默认开启 */
export function surfaceTexturesEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return !new URLSearchParams(window.location.search).has('noProcTex');
}

/** 已挂过纹理的材质，保证跨组件重复调用幂等 */
const decorated = new WeakSet<THREE.MeshStandardMaterial>();

/**
 * 按龙门基线把表面细节挂到指定材质单例上。
 *
 * metalKeys  → brushed 作 map、micro 作 bumpMap、bumpScale 0.0012
 * woodKeys   → wood 作 map、micro 作 bumpMap、bumpScale 0.0018
 *
 * 只处理 MeshStandardMaterial 实例；贴面（polygonOffset）、橡胶/塑料、玻璃、
 * 自发光 LED、状态色与动态 CanvasTexture 材质一律由调用方排除在键列表之外，
 * 以免加剧 z-fighting 或干扰状态色。键不存在或非材质时静默跳过，不抛错。
 */
export function applySurfaceTextures(
  materials: object,
  metalKeys: readonly string[],
  woodKeys: readonly string[] = [],
): void {
  // A/B 开关在此统一收口：?noProcTex=1 时连烘焙都不发生，各场景入口只需无条件调用
  if (!surfaceTexturesEnabled()) return;
  const T = getSurfaceTextures();
  const bag = materials as Record<string, unknown>;
  let applied = 0;
  const attach = (keys: readonly string[], map: THREE.DataTexture, bumpScale: number): void => {
    for (const key of keys) {
      const mat = bag[key];
      if (!(mat instanceof THREE.MeshStandardMaterial) || decorated.has(mat)) continue;
      mat.map = map;
      mat.bumpMap = T.micro;
      mat.bumpScale = bumpScale;
      mat.needsUpdate = true;
      decorated.add(mat);
      applied += 1;
    }
  };
  attach(metalKeys, T.brushed, 0.0012);
  attach(woodKeys, T.wood, 0.0018);
  // 只读验收钩子：CDP 用它确认材质确实挂上，不参与任何业务逻辑
  if (typeof window !== 'undefined' && applied > 0) {
    const w = window as unknown as { __dtSurfaceTextureApplied?: number };
    w.__dtSurfaceTextureApplied = (w.__dtSurfaceTextureApplied ?? 0) + applied;
  }
}
