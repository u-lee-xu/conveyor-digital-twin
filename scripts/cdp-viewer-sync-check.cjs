/**
 * 观众端镜像同步验收（需要实验室已启动）
 *
 *   npm run start:lab
 *   node scripts/cdp-viewer-sync-check.cjs
 *
 * 用双标签真实 Chrome 复现「主控进设备 → 观众按设备懒加载渲染 → 主控离开清场 →
 * 主控再进另一设备 → 观众跟随切换」。补 `cdp-first-screen-check.cjs` 的盲区：
 * 后者只验观众 `data-viewer-link=online`，不验快照驱动的 3D 画面。
 * 结束自动关闭 Chrome 并删除临时 profile，不碰用户浏览器数据。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { loadSceneDescriptors, cardIndexOf } = require('./device-catalog.cjs');
const scenes = loadSceneDescriptors();
/** 卡片下标由清单派生：主控先入传送带、再切交通灯，顺序调整后仍点同一设备 */
const FIRST_CARD = cardIndexOf(scenes, 'conveyor-sorting');
const SECOND_CARD = cardIndexOf(scenes, 'traffic-light');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.DT_PORT || 5201);
const CDP_PORT = Number(process.env.DT_CDP_PORT || 9224);
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

function lanIp() {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (String(i.family) === 'IPv4' && !i.internal && !i.address.startsWith('169.254')) return i.address;
    }
  }
  return null;
}

async function main() {
  const exe = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((p) => fs.existsSync(p));
  if (!exe) { console.error('[viewer-sync] 找不到 Chrome / Edge，可设置 CHROME_PATH'); process.exit(2); }
  const ip = lanIp();
  if (!ip) { console.error('[viewer-sync] 找不到本机 LAN IP，无法构造观众入口'); process.exit(2); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-viewer-cdp-'));
  const chrome = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let ws = null;
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const ev = async (sid, expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true }, sid);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const wait = async (sid, expression, timeoutMs = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { if (await ev(sid, expression)) return true; } catch { /* 页面尚未就绪 */ }
      await sleep(250);
    }
    return false;
  };
  const canvasExpr = "(()=>{const c=document.querySelector('canvas');return !!c && c.width>600 && c.height>400;})()";

  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i += 1) {
      try { version = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`); } catch { /* Chrome 启动中 */ }
      if (!version) await sleep(250);
    }
    if (!version) throw new Error('CDP endpoint 未就绪');

    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
      setTimeout(() => reject(new Error('CDP 连接超时')), 6000);
    });
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'exceptionThrown');
      if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
        errors.push((m.params.args || []).map((a) => a.value || a.description).join(' ').slice(0, 200));
      }
    });

    const teacherId = (await send('Target.createTarget', { url: `http://127.0.0.1:${PORT}/` })).result.targetId;
    const viewerId = (await send('Target.createTarget', { url: `http://${ip}:${PORT}/` })).result.targetId;
    const teacher = (await send('Target.attachToTarget', { targetId: teacherId, flatten: true })).result.sessionId;
    const viewer = (await send('Target.attachToTarget', { targetId: viewerId, flatten: true })).result.sessionId;
    for (const sid of [teacher, viewer]) {
      await send('Runtime.enable', {}, sid);
      await send('Page.enable', {}, sid);
    }
    // 观众标签必须在前台：后台标签的 R3F canvas 不会完成尺寸初始化
    await send('Page.bringToFront', {}, viewer);

    check(`主控启动器渲染 ${scenes.length} 张卡`, await wait(teacher, `document.querySelectorAll('.device-card').length === ${scenes.length}`));
    check('观众端 ViewerWorkspace 挂载', await wait(viewer, "!!document.querySelector('[data-viewer-link]')"));
    check('观众端连上中继', await wait(viewer, "document.querySelector('[data-viewer-link]')?.getAttribute('data-viewer-link') === 'online'", 10000));

    await ev(teacher, `document.querySelectorAll('.device-card')[${FIRST_CARD}].click()`);
    check('主控进入设备后观众收到 deviceId', await wait(viewer, "document.querySelector('[data-viewer-device]')?.getAttribute('data-viewer-device') === 'conveyor-sorting'"));
    check('观众按设备懒加载后渲染出 canvas', await wait(viewer, canvasExpr, 30000));
    check('观众无加载失败态', (await ev(viewer, "document.querySelector('[data-viewer-load-error]')?.getAttribute('data-viewer-load-error')")) === '');

    // 主控离开：导航回启动器会断开 relay WS，800ms 宽限后 clearController
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, teacher);
    await sleep(2500);
    const left = await ev(viewer, "(()=>({device:document.querySelector('[data-viewer-device]')?.getAttribute('data-viewer-device'),canvas:!!document.querySelector('canvas'),loadError:document.querySelector('[data-viewer-load-error]')?.getAttribute('data-viewer-load-error')}))()");
    check('主控离开后观众清空设备 id', !!left && left.device === '', left);
    check('主控离开后不残留旧 3D 画面', !!left && left.canvas === false, left);

    // 主控再进另一设备：观众应跟随切换并重新渲染
    await wait(teacher, `document.querySelectorAll('.device-card').length === ${scenes.length}`, 20000);
    await send('Page.bringToFront', {}, viewer);
    await ev(teacher, `document.querySelectorAll('.device-card')[${SECOND_CARD}].click()`);
    check('主控切到交通灯后观众跟随', await wait(viewer, "document.querySelector('[data-viewer-device]')?.getAttribute('data-viewer-device') === 'traffic-light'", 30000));
    check('观众重新渲染新设备 canvas', await wait(viewer, canvasExpr, 30000));

    const fatal = errors.filter((e) => !/favicon|net::ERR_/i.test(e));
    check('无 JS 异常 / 控制台错误', fatal.length === 0, fatal.slice(0, 4));
  } finally {
    if (ws) { try { ws.close(); } catch {} }
    try { chrome.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log(`==== RESULT ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('[viewer-sync] 验收失败:', e); process.exit(1); });
