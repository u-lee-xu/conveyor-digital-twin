/**
 * 首屏拆分后的真实浏览器验收（需要实验室已启动）
 *
 *   npm run build:platform
 *   npm run start:lab
 *   node scripts/cdp-first-screen-check.cjs
 *
 * 用全新 profile 的 headless Chrome 走 CDP：验证启动器设备卡与元数据一致、点击设备后
 * lazy chunk 能加载且 canvas 真正出现、观众端 ViewerWorkspace 能挂载。
 * 结束自动关闭 Chrome 并删除临时 profile，不碰用户浏览器数据。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { loadSceneDescriptors } = require('./device-catalog.cjs');
const scenes = loadSceneDescriptors();
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.DT_PORT || 5201);
const CDP_PORT = Number(process.env.DT_CDP_PORT || 9223);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let total = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function lanIp() {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (String(i.family) === 'IPv4' && !i.internal && !i.address.startsWith('169.254')) return i.address;
    }
  }
  return null;
}

async function main() {
  const exe = chromePath();
  if (!exe) { console.error('[cdp] 找不到 Chrome / Edge，可设置 CHROME_PATH'); process.exit(2); }
  const teacherUrl = `http://127.0.0.1:${PORT}/`;
  try { await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`); }
  catch { /* 端口空闲，继续 */ }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-cdp-'));
  const chrome = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1280,800', teacherUrl,
  ], { stdio: 'ignore', windowsHide: true });

  let ws = null;
  let pending = new Map();
  let errors = [];
  let seq = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const waitFor = async (expression, timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { if (await evaluate(expression)) return true; } catch { /* 页面尚未就绪 */ }
      await sleep(250);
    }
    return false;
  };

  try {
    // 等 CDP endpoint 与该 tab 的 webSocketDebuggerUrl
    let target = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      try {
        const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
        target = (list || []).find((t) => t.type === 'page' && t.url.includes(`:${PORT}/`));
      } catch { /* Chrome 还没起来 */ }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('CDP 页面 target 未就绪');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
      setTimeout(() => reject(new Error('CDP 连接超时')), 6000);
    });
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.id && pending.has(m.id)) {
        const { resolve } = pending.get(m.id);
        pending.delete(m.id);
        resolve(m);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'exceptionThrown');
      if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
        errors.push((m.params.args || []).map((a) => a.value || a.description).join(' ').slice(0, 200));
      }
      if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') errors.push(m.params.entry.text.slice(0, 200));
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
    await send('Page.bringToFront');

    check(`启动器渲染 ${scenes.length} 张设备卡`, await waitFor(`document.querySelectorAll('.device-card').length === ${scenes.length}`), { url: teacherUrl });
    const cards = await evaluate("[...document.querySelectorAll('.device-card')].map(b=>b.querySelector('h2')?.textContent)");
    check('设备名与元数据一致', Array.isArray(cards) && cards.length === scenes.length && scenes.every((s, i) => cards[i] && cards[i].includes(s.name)), cards);

    // 逐个进入所有自描述场景包，每个都必须真正渲染 canvas
    const DEVICE_LABELS = scenes.map((s) => s.name);
    const firstPhysical = scenes.findIndex((s) => s.hasPhysics);
    const firstNonPhysical = scenes.findIndex((s) => !s.hasPhysics);
    // 前置断言：Rapier 口径靠「一个物理 + 一个非物理」两个样本对比，
    // 任一类别缺席会让下面的 if 永不成立、断言被静默跳过（假绿），必须先挡住
    check(
      'Rapier 对比样本齐备（物理 / 非物理各至少一个）',
      firstPhysical !== -1 && firstNonPhysical !== -1,
      { firstPhysical, firstNonPhysical, hasPhysics: scenes.map((s) => s.hasPhysics) },
    );
    const canvasExpr = "(()=>{const c=document.querySelector('canvas');return !!c && c.width>600 && c.height>400;})()";
    for (let i = 0; i < scenes.length; i += 1) {
      if (i > 0) {
        await send('Page.navigate', { url: teacherUrl });
        await sleep(800);
        await send('Page.bringToFront');
        await waitFor(`document.querySelectorAll('.device-card').length === ${scenes.length}`, 20000);
      }
      await evaluate(`document.querySelectorAll('.device-card')[${i}].click()`);
      check(`设备 ${i} ${DEVICE_LABELS[i]} canvas 挂载`, await waitFor(canvasExpr, 30000));
      if (i === 0) {
        const canvasInfo = await evaluate("(()=>{const c=document.querySelector('canvas');return c?{w:c.width,h:c.height}:null;})()");
        check('canvas 尺寸有效', !!canvasInfo && canvasInfo.w > 600, canvasInfo);
      }
      // 只在首个物理设备与首个无物理设备上判 Rapier：后续导航会命中浏览器缓存，
      // resource timing 只反映「本次是否下载」，产物级依赖图由 check-first-screen.cjs 静态断言
      if (i === firstPhysical || i === firstNonPhysical) {
        const res = await evaluate("performance.getEntriesByType('resource').map(r=>r.name)");
        const rapier = Array.isArray(res) && res.some((u) => /rapier/i.test(u));
        check(`设备 ${i} ${DEVICE_LABELS[i]} Rapier 依赖符合预期`, rapier === (i === firstPhysical), { rapier });
      }
    }

    // 观众端：用本机 LAN IP 打开，走同源 /ws/relay 代理，挂载 viewer lazy chunk
    const ip = lanIp();
    if (ip) {
      await send('Page.navigate', { url: `http://${ip}:${PORT}/` });
      await sleep(800);
      await send('Page.bringToFront');
      const viewerOk = await waitFor("!!document.querySelector('[data-viewer-link]')", 20000);
      const link = await evaluate("document.querySelector('[data-viewer-link]')?.getAttribute('data-viewer-link')");
      check('观众端 ViewerWorkspace 挂载', viewerOk, { ip, link });
      check('观众端连上中继', link === 'online', { link });
    } else {
      check('观众端 ViewerWorkspace 挂载', false, '未找到本机 LAN IP，跳过');
    }

    const fatal = errors.filter((e) => !/favicon|net::ERR_/i.test(e));
    check('无 JS 异常 / 控制台错误', fatal.length === 0, fatal.slice(0, 5));
  } finally {
    if (ws) { try { ws.close(); } catch {} }
    try { chrome.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log(`==== RESULT ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('[cdp] 验收失败:', e); process.exit(1); });
