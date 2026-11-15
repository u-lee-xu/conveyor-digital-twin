/**
 * 快照差分链路自检（独立运行，不需要 :5201 或完整实验室）
 *
 *   node websocket-server/snapshot-diff-check.cjs
 *
 * 会 fork 一个中继在 :8082，模拟主控与观众，交叉验证浏览器侧 diffSnapshot
 * 与 Node 侧 mergeSnapshot 的口径，并端到端检查差分扇出 / 合并 / 删除键 /
 * 1s 保活 / 后加入观众 / 观众只读 / 切设备 / 旧帧兼容。结束自动清理进程。
 */
const { fork } = require('child_process');
const net = require('net');
const path = require('path');
const WebSocket = require('ws');
const { sameSnapshot, mergeSnapshot } = require('./snapshot-diff');

const PORT = 8082;
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let total = 0;

function check(name, ok, detail) {
  total += 1;
  if (ok) passed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
}

function portFree() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1');
    s.setTimeout(600);
    s.on('connect', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
    setTimeout(() => reject(new Error('WS 打开超时')), 3000);
  });
}

async function main() {
  /* 1) Node 侧纯函数；浏览器 diffSnapshot 与它的配套关系由包内 vitest 交叉断言锁死 */
  check('mergeSnapshot 处理 null 删除标记', sameSnapshot(mergeSnapshot({ A: 1, B: 2 }, { A: 3, B: null }), { A: 3 }));
  check('sameSnapshot 逐键比较', sameSnapshot({ A: 1, B: false }, { A: 1, B: false }) && !sameSnapshot({ A: 1 }, { A: 1, B: 2 }));
  check('mergeSnapshot 忽略非有限值，保留上一帧有效值',
    sameSnapshot(mergeSnapshot({ A: 1 }, { A: Number.NaN, B: true, C: Number.POSITIVE_INFINITY }), { A: 1, B: true }));
  check('mergeSnapshot 拒绝 __proto__ / constructor 等原型键', (() => {
    const delta = JSON.parse('{"__proto__":{"polluted":1},"constructor":9,"prototype":8,"B":2}');
    const merged = mergeSnapshot({ A: 1 }, delta);
    return merged.A === 1 && merged.B === 2
      && !Object.prototype.hasOwnProperty.call(merged, 'constructor')
      && Object.getPrototypeOf(merged) === Object.prototype;
  })());

  if (!(await portFree())) {
    console.error(`[snapshot-diff-check] :${PORT} 已被占用，请先停掉实验室实例再运行本自检`);
    process.exit(2);
  }

  const relay = fork(path.join(__dirname, 'broadcast.js'), [], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch {} };
  try {
    await sleep(1000);
    // 无 Origin 的本机连接 = teacher；带跨站 Origin 的连接在中继降为只读 viewer
    const teacher = new WebSocket(URL);
    const viewer = new WebSocket(URL, { origin: 'http://viewer.example' });
    const snapshots = [];
    viewer.on('message', (raw) => {
      try { const m = JSON.parse(raw.toString()); if (m.type === 'snapshot') snapshots.push(m); } catch {}
    });
    await Promise.all([waitOpen(teacher), waitOpen(viewer)]);
    await sleep(150);
    const send = (msg) => teacher.send(JSON.stringify(msg));
    const baseFrame = { type: 'report', deviceId: 'auto-dispensing', mode: 'demo' };
    const last = () => snapshots[snapshots.length - 1];

    send({ ...baseFrame, vars: { A: 1, B: 2 }, delta: false });
    await sleep(120);
    check('全量帧广播完整 vars', snapshots.length >= 1 && sameSnapshot(last().vars, { A: 1, B: 2 }), last()?.vars);

    const n0 = snapshots.length;
    for (let i = 0; i < 6; i += 1) { send({ ...baseFrame, vars: {}, delta: true }); await sleep(60); }
    check('静止期 6 帧空 delta 不重复扇出', snapshots.length === n0, { before: n0, after: snapshots.length });

    send({ ...baseFrame, vars: { A: 3 }, delta: true });
    await sleep(120);
    check('变化 delta 合并后完整扇出（保留未变化键）', sameSnapshot(last().vars, { A: 3, B: 2 }), last()?.vars);

    send({ ...baseFrame, vars: { B: null }, delta: true });
    await sleep(120);
    check('null 删除标记让键从观众快照消失', sameSnapshot(last().vars, { A: 3 }), last()?.vars);

    const n1 = snapshots.length;
    for (let i = 0; i < 14; i += 1) { send({ ...baseFrame, vars: {}, delta: true }); await sleep(90); }
    check('静止期约 1.3s 内只发保活帧', snapshots.length > n1 && snapshots.length <= n1 + 2 && sameSnapshot(last().vars, { A: 3 }), { before: n1, after: snapshots.length });

    const viewer2 = new WebSocket(URL, { origin: 'http://viewer2.example' });
    const late = [];
    viewer2.on('message', (raw) => {
      try { const m = JSON.parse(raw.toString()); if (m.type === 'snapshot') late.push(m); } catch {}
    });
    await waitOpen(viewer2);
    await sleep(150);
    check('后加入观众立即拿到完整 lastSnapshot', late.length === 1 && sameSnapshot(late[0].vars, { A: 3 }), late[0]?.vars);

    const n2 = snapshots.length;
    viewer.send(JSON.stringify({ type: 'report', deviceId: 'FAKE', vars: { A: 99 } }));
    await sleep(120);
    check('观众伪造 report 被丢弃', snapshots.length === n2 && last().deviceId !== 'FAKE');

    send({ ...baseFrame, deviceId: 'liquid-mixing', mode: 'manual', vars: { L: 7 }, delta: false });
    await sleep(120);
    check('切设备全量帧替换镜像（旧键不残留）', last().deviceId === 'liquid-mixing' && sameSnapshot(last().vars, { L: 7 }), last()?.vars);

    const n3 = snapshots.length;
    send({ ...baseFrame, deviceId: 'liquid-mixing', mode: 'manual', vars: { L: 7 } }); // 旧主控格式，无 delta
    await sleep(120);
    check('不带 delta 的旧帧无条件广播（安全自检兼容）', snapshots.length === n3 + 1);

    teacher.close();
    viewer.close();
    viewer2.close();
  } finally {
    cleanup();
  }
  console.log(`==== RESULT ${passed}/${total}`);
  setTimeout(() => process.exit(passed === total ? 0 : 1), 150);
}

main().catch((e) => { console.error('[snapshot-diff-check] 失败:', e); process.exit(1); });
