/**
 * 首屏体积防回退校验（构建后运行）
 *
 *   npm run build:platform && node scripts/check-first-screen.cjs
 *
 * 断言启动器首屏不预加载 3D / 物理 / 设备实现 chunk，主入口保持轻量，
 * 并打印首屏 raw / gzip 合计。只做只读检查，不改任何产物。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadSceneDescriptors } = require('./device-catalog.cjs');

const scenes = loadSceneDescriptors();

const DIST = path.join(__dirname, '..', 'packages', 'platform', 'dist');
const ASSETS = path.join(DIST, 'assets');
let passed = 0;
let total = 0;

function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('[first-screen] 找不到 packages/platform/dist/index.html，请先执行 npm run build:platform');
    process.exit(2);
  }
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const files = fs.readdirSync(ASSETS);
  const refs = [...new Set([...html.matchAll(/(?:href|src)="\.\/assets\/([^"]+)"/g)].map((m) => m[1]))];

  check('入口 HTML 有 module 脚本与样式', refs.some((f) => /^index-.*\.js$/.test(f)) && refs.some((f) => f.endsWith('.css')), refs);
  const heavy = refs.filter((f) => /vendor-(three|r3f)|rapier|^registry-/i.test(f));
  check('首屏不预加载 3D / 物理 / 设备实现 chunk', heavy.length === 0, heavy);

  const mainFile = refs.find((f) => /^index-.*\.js$/.test(f));
  const mainBytes = mainFile ? fs.statSync(path.join(ASSETS, mainFile)).size : Infinity;
  check('主入口 chunk < 64KB', mainBytes < 64 * 1024, { file: mainFile, bytes: mainBytes });
  const mainSrc = mainFile ? fs.readFileSync(path.join(ASSETS, mainFile), 'utf8') : '';
  check('主入口不含内联 wasm', !mainSrc.includes('AGFzbQ'));

  for (const prefix of ['TeacherWorkspace-', 'ViewerWorkspace-']) {
    check(`按需 chunk 存在: ${prefix}`, files.some((f) => f.startsWith(prefix) && f.endsWith('.js')));
  }
  const wasmChunk = files.find((f) => f.endsWith('.js') && fs.readFileSync(path.join(ASSETS, f), 'utf8').includes('AGFzbQ'));
  check('Rapier wasm 独立成按需 chunk', !!wasmChunk, { file: wasmChunk });
  const mainDeps = [...new Set([...mainSrc.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]))];
  check('主入口不依赖 wasm chunk', !wasmChunk || !mainDeps.some((d) => d.includes(wasmChunk)));
  // 场景包统一入口 src/device.ts → 产物 chunk 名为 device-*.js；主入口仍是 index-*.js
  const deviceChunks = files.filter((f) => /^(index|device)-.*\.js$/.test(f));
  check('按场景拆出多个入口 chunk', deviceChunks.length >= scenes.length + 1,
    { count: deviceChunks.length, scenes: scenes.length });
  const entryChunk = refs.find((f) => /^index-.*\.js$/.test(f));
  const perDevice = deviceChunks
    .filter((f) => f !== entryChunk)
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(ASSETS, f), 'utf8') }));
  // 每个自描述场景都必须有自己的懒加载 chunk；能力标记由各包 device.json 提供
  for (const scene of scenes) {
    const hit = perDevice.find((c) => c.src.includes(scene.name));
    check(`场景包独立 chunk: ${scene.name}`, !!hit, { file: hit?.file });
    if (hit && !scene.needsPlcService) {
      const deps = [...hit.src.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
      check(`无 PLC 服务场景不拖入 modbus-websocket: ${scene.name}`,
        !deps.some((d) => d.includes('modbus-websocket')), { file: hit.file });
    }
  }

  let raw = 0;
  let gz = 0;
  for (const f of refs) {
    const buf = fs.readFileSync(path.join(ASSETS, f));
    raw += buf.length;
    gz += zlib.gzipSync(buf).length;
  }
  check('首屏 gzip < 120KB', gz < 120 * 1024, { raw, gzip: gz, refs: refs.length });
  console.log(`==== RESULT ${passed}/${total} · 首屏 raw ${raw} B / gzip ${gz} B（${(gz / 1024).toFixed(1)} KiB）`);
  process.exit(passed === total ? 0 : 1);
}

main();
