#!/usr/bin/env node
/**
 * 中继「主控占坑」行为验收（不需要实验室，本脚本自己 fork broadcast.js）
 *
 *   node websocket-server/relay-controller-check.cjs
 *
 * 覆盖 2026-11-21 审核 P1 的三种情形，全部用真实 ws 连接验证，不看源码字符串：
 *   1. 主控在线时，第二主控被「已有主控在演示」拒绝（同一教室只认一台）；
 *   2. 主控连接活着但 report 静默超时 → 新主控可接管，观众跟随新设备；
 *   3. 静默到释放阈值 → 按离场清场，观众收到「主控已离开」；
 *   4. 保活扇出不依赖 report 分支：主控只报一帧后静止，观众仍持续收到快照。
 *
 * 静默阈值由 DT_RELAY_SILENT_MS / DT_RELAY_RELEASE_MS 覆盖，本脚本用秒级取值加速。
 * 端口取自 edge-broadcast.json（默认 8082）；教学实例占用时会直接失败并提示先停实例。
 */
'use strict';
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const RELAY = path.join(__dirname, 'broadcast.js');
const PORT = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'edge-broadcast.json'), 'utf8')).broadcastPort || 8082; }
  catch { return 8082; }
})();
const URL_RELAY = `ws://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let total = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}

/** 主控：本机无 Origin 直连回环 → verifyInternalRequest 判 teacher */
function openTeacher() {
  const ws = new WebSocket(URL_RELAY, { origin: undefined });
  ws.inbox = [];
  ws.on('message', (raw) => { try { ws.inbox.push(JSON.parse(raw.toString())); } catch { /* ignore */ } });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

/** 观众：模拟代理写入的信任头（token 未签发时按 role 把关），只订阅不上报 */
function openViewer() {
  const ws = new WebSocket(URL_RELAY, {
    headers: { 'x-dt-proxy': '1', 'x-dt-role': 'viewer', host: `127.0.0.1:${PORT}` },
  });
  ws.inbox = [];
  ws.on('message', (raw) => { try { ws.inbox.push(JSON.parse(raw.toString())); } catch { /* ignore */ } });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function report(ws, deviceId, vars) {
  ws.send(JSON.stringify({ type: 'report', deviceId, mode: 'sim', vars, ts: Date.now() }));
}

async function waitRelay(ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const ws = new WebSocket(URL_RELAY);
      ws.once('open', () => { ws.close(); resolve(true); });
      ws.once('error', () => resolve(false));
    });
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

async function spawnRelay(env) {
  const child = fork(RELAY, [], { stdio: 'ignore', env: { ...process.env, ...env } });
  const up = await waitRelay();
  if (!up) { try { child.kill(); } catch {} throw new Error(`中继未能监听 :${PORT}，请先停掉占用该端口的教学实例`); }
  return child;
}

async function main() {
  // ── 场景 A：在线主控拒绝第二主控 + 保活扇出不依赖 report ──────────────
  let relay = await spawnRelay({ DT_RELAY_SILENT_MS: '60000', DT_RELAY_RELEASE_MS: '60000' });
  try {
    const viewer = await openViewer();
    const a = await openTeacher();
    report(a, 'conveyor-sorting', { CONVEYOR: true });
    await sleep(400);
    check('观众收到主控首帧', viewer.inbox.some((m) => m.type === 'snapshot' && m.deviceId === 'conveyor-sorting'));

    const b = await openTeacher();
    report(b, 'traffic-light', { TRAFFIC: 1 });
    await sleep(600);
    check('主控在线时第二主控被拒绝', b.inbox.some((m) => m.type === 'rejected' && /已有主控/.test(m.error)), b.inbox);
    check('拒绝后观众仍跟随原主控', viewer.inbox.filter((m) => m.type === 'snapshot').slice(-1)[0]?.deviceId === 'conveyor-sorting');

    // 主控只报一帧后静止：保活定时器必须继续以 ~1Hz 扇出，而不是靠 report 分支
    const before = viewer.inbox.length;
    await sleep(2500);
    const idleFrames = viewer.inbox.length - before;
    check('主控静止期由独立定时器保活扇出', idleFrames >= 2, { idleFrames });

    for (const ws of [viewer, a, b]) { try { ws.close(); } catch {} }
  } finally {
    try { relay.kill(); } catch {}
    await sleep(400);
  }

  // ── 场景 B：静默超时可接管，静默到释放阈值则清场 ──────────────────────
  relay = await spawnRelay({ DT_RELAY_SILENT_MS: '800', DT_RELAY_RELEASE_MS: '2600' });
  try {
    const viewer = await openViewer();
    const a = await openTeacher();
    report(a, 'conveyor-sorting', { CONVEYOR: true });
    await sleep(300);

    await sleep(1000); // 越过 SILENT 阈值，A 仍未上报
    const b = await openTeacher();
    report(b, 'traffic-light', { TRAFFIC: 1 });
    await sleep(600);
    check('静默超时后新主控可接管（不再永久拒绝）', !b.inbox.some((m) => m.type === 'rejected'), b.inbox);
    check('接管后观众跟随新设备', viewer.inbox.filter((m) => m.type === 'snapshot').slice(-1)[0]?.deviceId === 'traffic-light');

    await sleep(3400); // 越过 RELEASE 阈值，B 也静止
    const last = viewer.inbox.filter((m) => m.type === 'snapshot').slice(-1)[0];
    check('静默到释放阈值后按离场清场', !!last && last.deviceId === null && last.error === '主控已离开', last);
    check('清场后观众不再收到旧设备快照', !viewer.inbox.filter((m) => m.type === 'snapshot').slice(-1).some((m) => m.deviceId === 'traffic-light'));

    for (const ws of [viewer, a, b]) { try { ws.close(); } catch {} }
  } finally {
    try { relay.kill(); } catch {}
    await sleep(400);
  }

  console.log(`==== RESULT ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error('[relay-check] 验收失败:', e.message || e); process.exit(1); });
