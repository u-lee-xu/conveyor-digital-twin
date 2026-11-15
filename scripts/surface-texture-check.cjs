/**
 * 程序化表面纹理（Saltline 参考基线）跨场景覆盖防回退校验。
 *
 *   node scripts/surface-texture-check.cjs
 *
 * 只读源码，不改任何文件。断言：
 *   1) shared 单一实现与龙门基线算法同源、无 DOM / shader 注入、不在模块顶层烘焙；
 *   2) shared 模块刻意不进 barrel，也未被平台壳注册表静态引用（首屏零成本）；
 *   3) 已入库的未覆盖场景都已按同一规则接入，且入口为惰性一次调用；
 *      未入库的场景包在干净 clone 里不存在，按可选条目跳过，避免「本机有副本才绿」；
 *   4) 龙门 / 液体混装这两个已实现场景保持自带实现，未被重复改动；
 *   5) 金属键列表不含贴面 / LED / 状态色等禁用键。
 */
const fs = require('fs');
const path = require('path');
const { loadSceneDescriptors } = require('./device-catalog.cjs');

const ROOT = path.join(__dirname, '..');
const SHARED = 'packages/shared/src/three/surfaceTextures.ts';
const BARREL = 'packages/shared/src/index.ts';
const GANTRY_PROC = 'packages/inovance-gantry/src/scenes/shared/proceduralTextures.ts';
const GANTRY_MAT = 'packages/inovance-gantry/src/scenes/shared/gantryMaterials.ts';
const GANTRY_SCENE = 'packages/inovance-gantry/src/scenes/GantrySceneContent.tsx';

/** 本次按共享基线补齐的场景：id → [材质/纹理载体文件, 3D 场景入口] */
const COVERED = {
  'conveyor-sorting': [
    'packages/conveyor-sorting/src/components/scene/shared/materials.ts',
    'packages/conveyor-sorting/src/scenes/conveyor-sorting/SceneContent.tsx',
  ],
  'auto-dispensing': [
    'packages/auto-dispensing/src/components/scene/shared/materials.ts',
    'packages/auto-dispensing/src/scenes/auto-dispensing/SceneContent.tsx',
  ],
  'md520-vfd': [
    'packages/md520-vfd/src/components/scene/shared/materials.ts',
    'packages/md520-vfd/src/scenes/vfd/SceneContent.tsx',
  ],
  'pneumatic-robot': [
    'packages/pneumatic-robot/src/scenes/pneumatic-robot/components/robotMaterials.ts',
    'packages/pneumatic-robot/src/scenes/pneumatic-robot/SceneContent.tsx',
  ],
  'traffic-light': [
    'packages/traffic-light/src/scenes/traffic-light/materials.ts',
    'packages/traffic-light/src/scenes/traffic-light/SceneContent.tsx',
  ],
  'motor-reversing': [
    'packages/motor-reversing/src/scenes/shared/motorMaterials.ts',
    'packages/motor-reversing/src/scenes/MotorSceneContent.tsx',
  ],
};

/** 条目对应的包尚未入库（本机 untracked）。干净 clone 里文件不存在，必须允许跳过。
 *  否则会重蹈 __scene_doc_check.test.ts 依赖未入库本地文件导致假绿的覆辙。 */
const OPTIONAL_COVERED = new Set(['motor-reversing']);

/** 开工核对时已完整实现、本轮刻意跳过的场景 */
const SKIPPED = {
  'inovance-gantry': [GANTRY_MAT, GANTRY_SCENE],
  'liquid-mixing': [
    'packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts',
    'packages/liquid-mixing/src/scenes/LiquidSceneContent.tsx',
  ],
};

/** 龙门基线明确不挂纹理的材质类别，禁止被列入任一场景的金属键表 */
const FORBIDDEN_KEY_PATTERNS = [
  /led/i, /lampDark/i, /lampActive/i, /sensorLabel/i, /sensorActive/i,
  /decal/i, /profileSlot/i, /belt/i, /rubber/i, /glass/i,
  /ground/i, /floor/i, /halo/i, /glow/i, /emissive/i, /canvas/i,
];

let passed = 0;
let total = 0;

function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}

function read(rel) {
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/** 从 `const XXX_KEYS = [ ... ] as const;` 中取出键名字符串 */
function metalKeys(src) {
  const arr = src.match(/(?:const\s+\w*METAL\w*KEYS\s*=\s*\[)([\s\S]*?)(?:\]\s*as\s*const)/);
  if (arr) return [...arr[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  // 机械臂等场景用「材质对象 + Object.keys(...)」形式声明
  const obj = src.match(/(?:const\s+\w*METAL\w*MATERIALS\s*=\s*\{)([\s\S]*?)(?:\}\s*;)/);
  if (obj) return [...obj[1].matchAll(/([A-Za-z_$][\w$]*)\s*[,:]/g)].map((x) => x[1]);
  return null;
}

function main() {
  const scenes = loadSceneDescriptors().map((s) => s.id ?? s.pkg ?? s.name);
  const shared = read(SHARED);
  const barrel = read(BARREL);
  const gantryProc = read(GANTRY_PROC);

  // ---- 1. 共享实现与龙门基线同源 ----
  check('共享纹理模块存在', shared.length > 0, SHARED);
  for (const t of [
    'THREE.DataTexture', 'RepeatWrapping', 'export function fbm', 'valueNoise',
    'getSurfaceTextures', 'applySurfaceTextures', 'surfaceTexturesEnabled',
    'brushed', 'micro', 'wood', 'SRGBColorSpace', 'NoColorSpace',
    '__dtSurfaceTextureBakeMs', '__dtSurfaceTextureApplied', 'noProcTex', '0.0012', '0.0018',
  ]) {
    check(`共享模块含基线要素: ${t}`, shared.includes(t));
  }
  check('不注入 shader / 不依赖 DOM 画布', !shared.includes('.onBeforeCompile =') && !shared.includes('document.createElement'));
  check('纹理不在模块顶层烘焙', !/export\s+const\s+SURFACE_TEXTURES\s*=/.test(shared));
  const SHARED_FORMULAS = [
    'Math.sin(x * 127.1 + y * 311.7) * 43758.5453123',
    '1.6 * px + 1.2 * py + 17.3',
    'tex.repeat.set(3, 3)',
    'makeTexture(128, true',
    '0.94 + 0.05 * grain - 0.045 * streak',
    '0.9 + 0.09 * g - 0.03 * streak',
    '0.82 + 0.12 * rings + 0.06 * grain',
  ];
  for (const formula of SHARED_FORMULAS) {
    check(`与龙门算法同源: ${formula}`, shared.includes(formula) && gantryProc.includes(formula));
  }
  check('A/B 开关在 apply 内统一收口', /if \(!surfaceTexturesEnabled\(\)\) return;/.test(shared));

  // ---- 2. 首屏 / 分包边界 ----
  check('共享模块未从 barrel 值导出', !/surfaceTextures/.test(barrel));
  for (const f of ['packages/platform/src/registry.ts', 'packages/platform/src/deviceCatalog.ts']) {
    check(`平台壳未静态引用纹理模块: ${path.basename(f)}`, !read(f).includes('surfaceTextures'));
  }

  // ---- 3. 未覆盖场景已按同一规则接入 ----
  for (const [id, [matRel, sceneRel]] of Object.entries(COVERED)) {
    const mat = read(matRel);
    const scene = read(sceneRel);
    if (mat === '' && OPTIONAL_COVERED.has(id)) {
      console.log(`⏭  [${id}] 未入库场景包，干净 clone 里不存在，跳过`);
      continue;
    }
    check(`[${id}] 材质载体接入共享实现`, mat.includes("@digital-twin/shared/three/surfaceTextures") && mat.includes('applySurfaceTextures'));
    check(`[${id}] 导出 applyProceduralTextures`, /export function applyProceduralTextures\(\)/.test(mat));
    check(`[${id}] 场景入口惰性调用一次`, scene.includes('applyProceduralTextures()') && scene.includes('useMemo('));
    const keys = metalKeys(mat);
    const forbidden = keys ? keys.filter((k) => FORBIDDEN_KEY_PATTERNS.some((re) => re.test(k))) : ['<未找到键表>'];
    check(`[${id}] 金属键不含贴面/LED/状态色`, keys !== null && forbidden.length === 0, { count: keys?.length ?? 0, forbidden });
  }

  // ---- 4. 已实现场景保持原样、未被重复改动 ----
  for (const [id, [matRel, sceneRel]] of Object.entries(SKIPPED)) {
    const mat = read(matRel);
    check(`[${id}] 保留自带纹理实现`, mat.length > 0 && !mat.includes('@digital-twin/shared/three/surfaceTextures'));
    check(`[${id}] 场景入口仍调用自带 apply`, /apply(?:Liquid)?ProceduralTextures\(\)/.test(read(sceneRel)));
  }
  check('龙门参考基线文件仍在', gantryProc.includes('__dtGantryTextureBakeMs') && read(GANTRY_SCENE).includes("has('noProcTex')"));

  // ---- 5. 全部注册场景都有覆盖来源 ----
  const unaccounted = scenes.filter((id) => !COVERED[id] && !SKIPPED[id]);
  check('全部注册场景均已覆盖或明确跳过', unaccounted.length === 0, { scenes: scenes.length, unaccounted });

  console.log(`\n覆盖（共享基线）: ${Object.keys(COVERED).join(', ')}`);
  console.log(`跳过（已实现）: ${Object.keys(SKIPPED).join(', ')}`);
  console.log(`\n[surface-texture] ${passed}/${total} 通过`);
  if (passed !== total) process.exit(1);
}

main();
