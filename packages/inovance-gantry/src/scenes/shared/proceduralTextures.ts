/**
 * 程序化表面纹理 —— 借鉴 Saltline（Fable 5.2 生成的浏览器 FPS）的做法。
 *
 * 研究结论：Saltline 的真实感主要不是 CanvasTexture，而是
 *   1) 一张 256² 的程序化噪声贴图 tNoise（n2 双线性采样）；
 *   2) fbm5 / fbm3 分形噪声（旋转矩阵 mat2(1.6,1.2,-1.2,1.6) + 17.3 偏移）；
 *   3) onBeforeCompile 改写 <map_fragment>/<roughnessmap_fragment>/<normal_fragment_maps>，
 *      把噪声注入颜色、粗糙度、法线、AO（ORM 打包）。
 * 它用 GPU 烘焙纹理集并注入 shader；本项目改用**等价但更稳**的做法：
 *   - 同一套 hash/valueNoise/fbm 结构在 JS 端预烘焙成 DataTexture（无 DOM 依赖，Node 也可构造）；
 *   - 挂到现有 MeshStandardMaterial 单例的 map / bumpMap，不碰 shader chunk，
 *     避免 three 版本耦合、headless 编译失败与共享材质被破坏；
 *   - 纹理以近白为主，只提供表面细节，不抢共享视觉令牌的结构色。
 *
 * 不采用：电影化后期、雨雾、湿滑法线（工业仿真要清晰读设备状态）。
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

interface ProcTextureSet {
  brushed: THREE.DataTexture;
  micro: THREE.DataTexture;
  wood: THREE.DataTexture;
}

/**
 * 惰性单例：平台壳 registry 静态导入所有设备包，若在这里直接烘焙，
 * 用户不进龙门场景也要付 CPU/显存成本。改为首次渲染龙门场景时才生成一次。
 */
let cached: ProcTextureSet | null = null;

/** 实测烘焙耗时（ms），写入 window 供 CDP 性能验收读取，不参与业务逻辑 */
export function getProcTextures(): ProcTextureSet {
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

  /** 深棕棋盘木纹：年轮条纹 + fbm 扰动，暖色偏移 */
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
    (window as unknown as { __dtGantryTextureBakeMs?: number }).__dtGantryTextureBakeMs = elapsed;
  }
  return cached;
}
