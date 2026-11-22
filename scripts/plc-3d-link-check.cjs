#!/usr/bin/env node
/**
 * PLC ↔ 三维场景实时联动验收（需要实验室已启动）
 *
 *   npm run start:devlab        # 开发/验收形态：启用 :1503 内置虚拟 PLC 靶机
 *   node scripts/plc-3d-link-check.cjs
 *
 * 课堂交付的 start:lab 不启动内置虚拟 PLC（仿真模式接外部 PLC 仿真软件 / 实物），
 * 本脚本是开发期的帧级回归探针，不参与教学交付。
 *
 * 真实链路（不 mock 任何一环）：
 *   外部 Modbus 主站(FC05 写 103 线圈) → 虚拟 PLC :1503
 *     → 浏览器主控经 /ws/plc 网关 100ms 轮询 readCoils
 *     → useSimMode 写 useDeviceStore（3D 与 exportSnapshot 同源）
 *     → relay 快照扇出 → LAN 观众收到同一帧
 *
 * 依据项目红线：位置/状态是唯一真值，3D、面板、快照、PLC 同源；因此快照
 * `CONVEYOR` 的翻转等价于三维传送带状态的翻转。脚本另抓取两次 CDP 截图作为
 * 画面变化的辅助佐证（不作为硬断言，避免把时间戳角标误判为场景变化）。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { loadSceneDescriptors, cardIndexOf } = require('./device-catalog.cjs');
const scenes = loadSceneDescriptors();
/** 传送带在启动器里的下标由清单派生，不写死 0：order 调整后仍点到同一设备 */
const CONVEYOR_CARD = cardIndexOf(scenes, 'conveyor-sorting');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const ModbusRTU = require('../websocket-server/node_modules/modbus-serial');

const PORT = Number(process.env.DT_PORT || 5201);
const CDP_PORT = Number(process.env.DT_CDP_PORT || 9226);
const MOCK_HOST = '127.0.0.1';
const MOCK_PORT = 1503;
const CONVEYOR_COIL = 103;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let total = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}
const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let b = '';
    res.on('data', (c) => { b += c; });
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});
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
  const ip = lanIp();
  if (!exe || !ip) { console.error('[plc-link] 缺少 Chrome 或本机 LAN IP'); process.exit(2); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-plc-cdp-'));
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
  const wait = async (sid, expression, ms = 20000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      try { if (await ev(sid, expression)) return true; } catch { /* 页面未就绪 */ }
      await sleep(200);
    }
    return false;
  };
  const canvasExpr = "(()=>{const c=document.querySelector('canvas');return !!c && c.width>600 && c.height>400;})()";

  // 中继快照订阅：必须经 LAN IP 代理拿到 viewer 角色，直连 8082 会被判 teacher 而不进订阅集合
  const snapshots = [];
  const relay = new WebSocket(`ws://${ip}:${PORT}/ws/relay`);
  relay.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot' && m.deviceId === 'conveyor-sorting') snapshots.push(m);
    } catch { /* 忽略非法帧 */ }
  });
  const modbus = new ModbusRTU();

  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i += 1) {
      try { version = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`); } catch { /* Chrome 启动中 */ }
      if (!version) await sleep(250);
    }
    if (!version) throw new Error('CDP endpoint 未就绪');
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve); ws.once('error', reject);
      setTimeout(() => reject(new Error('CDP 连接超时')), 6000);
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'exception');
      if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
        errors.push((m.params.args || []).map((a) => a.value || a.description).join(' ').slice(0, 160));
      }
    });

    const teacherId = (await send('Target.createTarget', { url: `http://127.0.0.1:${PORT}/` })).result.targetId;
    const viewerId = (await send('Target.createTarget', { url: `http://${ip}:${PORT}/` })).result.targetId;
    const teacher = (await send('Target.attachToTarget', { targetId: teacherId, flatten: true })).result.sessionId;
    const viewer = (await send('Target.attachToTarget', { targetId: viewerId, flatten: true })).result.sessionId;
    for (const sid of [teacher, viewer]) { await send('Runtime.enable', {}, sid); await send('Page.enable', {}, sid); }
    // 主控标签必须先在前台：后台标签的 R3F canvas 不会完成尺寸初始化
    await send('Page.bringToFront', {}, teacher);

    check('主控启动器就绪', await wait(teacher, `document.querySelectorAll('.device-card').length === ${scenes.length}`));
    await ev(teacher, `document.querySelectorAll('.device-card')[${CONVEYOR_CARD}].click()`);
    check('传送带三维场景挂载', await wait(teacher, canvasExpr, 30000), { device: 'conveyor-sorting' });

    // 切「仿真」模式：把连接端口从默认 502 改为本机虚拟 PLC :1503
    await ev(teacher, "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('仿真'))?.click()");
    await sleep(600);
    // React 受控 number input 必须用原生 setter + input 事件才能触发 onChange
    await ev(teacher, `(()=>{const i=[...document.querySelectorAll('input[type=number]')][0];
      if(!i)return; const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i,'${MOCK_PORT}'); i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(250);
    await ev(teacher, "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='连接'&&!b.disabled)?.click()");
    check('仿真模式经网关连上虚拟 PLC',
      await wait(teacher, "document.body.innerText.includes('已连接')", 15000));

    // 连接建立后再把观众标签切到前台，让镜像的 R3F canvas 完成初始化
    await send('Page.bringToFront', {}, viewer);

    // 外部 Modbus 主站（与网关客户端并存）写 FC05
    await modbus.connectTCP(MOCK_HOST, { port: MOCK_PORT });
    modbus.setID(1);
    check('外部 Modbus 主站可连同一虚拟 PLC', true, { port: MOCK_PORT });

    const expectVar = async (value, label) => {
      await modbus.writeCoil(CONVEYOR_COIL, value);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const last = snapshots[snapshots.length - 1];
        if (last && last.vars && last.vars.CONVEYOR === value) return { ok: true, ts: last.ts };
        await sleep(150);
      }
      return { ok: false, last: snapshots.slice(-1) };
    };

    const off = await expectVar(false, 'CONVEYOR=false');
    check('PLC 线圈 103=OFF → 三维/快照 CONVEYOR=false', off.ok, off);
    const shotOff = await send('Page.captureScreenshot', { format: 'png' }, viewer);
    const on = await expectVar(true, 'CONVEYOR=true');
    check('PLC 线圈 103=ON → 三维/快照 CONVEYOR=true', on.ok, on);
    const shotOn = await send('Page.captureScreenshot', { format: 'png' }, viewer);
    const hash = (s) => s ? crypto.createHash('sha1').update(s).digest('hex').slice(0, 12) : '';
    const visualChanged = !!shotOff.result?.data && !!shotOn.result?.data
      && hash(shotOff.result.data) !== hash(shotOn.result.data);
    console.log(`ℹ️  观众截图签名 ${hash(shotOff.result?.data)} → ${hash(shotOn.result?.data)}（画面有变化=${visualChanged}，仅作辅助佐证）`);

    check('观众端跟随同一设备并渲染三维画面',
      await wait(viewer, "document.querySelector('[data-viewer-device]')?.getAttribute('data-viewer-device')==='conveyor-sorting' && (()=>{const c=document.querySelector('canvas');return !!c&&c.width>600;})()", 20000));
    check('联动过程零 JS 异常', errors.length === 0, errors.slice(0, 3));

    await modbus.writeCoil(CONVEYOR_COIL, false);
  } catch (e) {
    check('联动验收执行完成', false, { error: String(e.message || e) });
  } finally {
    try { relay.close(); } catch {}
    try { modbus.close(); } catch {}
    if (ws) { try { ws.close(); } catch {} }
    try { chrome.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log(`==== RESULT ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('[plc-link] 验收失败:', e); process.exit(1); });
