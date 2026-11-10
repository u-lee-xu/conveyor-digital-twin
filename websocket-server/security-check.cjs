#!/usr/bin/env node
/**
 * P0 安全边界运行时验收（可重复执行，不依赖固定 IP）。
 *
 *   npm run start:lab            # 另开终端
 *   node websocket-server/security-check.cjs
 *
 * 覆盖：正常主控读写链路、恶意 connect 帧、显式协议 switch、会话隔离、
 * 代理层 LAN / 伪造 Host / 跨 Origin 拒绝、观众只读中继。
 * 依赖：ws（本目录 node_modules）、实验室五个端口在线。
 * 环境变量：DT_LAB_PORT（默认 5201）、DT_LAN_IP（覆盖自动探测到的本机 LAN IP）。
 */
const os = require('os');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.DT_LAB_PORT || 5201);

function detectLanIp() {
  if (process.env.DT_LAN_IP) return process.env.DT_LAN_IP;
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (String(info.family) === 'IPv4' && !info.internal && !info.address.startsWith('169.254')) {
        return info.address;
      }
    }
  }
  return '';
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${JSON.stringify(detail)}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

function open(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options || {});
    let settled = false;
    const finish = (kind, value) => {
      if (settled) return;
      settled = true;
      if (kind === 'ok') resolve(ws); else reject(value);
    };
    ws.on('open', () => finish('ok'));
    ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => finish('err', { status: res.statusCode, deny: res.headers['x-dt-deny'] || '', body }));
    });
    ws.on('error', (e) => finish('err', { error: e.message }));
    setTimeout(() => finish('err', { error: 'open timeout' }), 6000);
  });
}

function makeRpc(ws) {
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'snapshot' || msg.type === 'rejected') return;
    const cb = pending.get(msg.id);
    if (cb) { pending.delete(msg.id); cb(msg); }
  });
  return (payload, timeout) => new Promise((resolve) => {
    const id = `sec_${++seq}`;
    const timer = setTimeout(() => { pending.delete(id); resolve({ timeout: true }); }, timeout || 6000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    ws.send(typeof payload === 'string'
      ? payload.replace('__ID__', id)
      : JSON.stringify({ ...payload, id }));
  });
}

const VARS = { BUTTON_START: 0, MOTOR_FWD: 30, LAMP_GREEN: 38 };
const WORDS = { ENCODER_PULSES: { type: 'dint32', wordOrder: 'low-first', modbus: { address: 120, words: 2 } } };
const CONNECT_OK = {
  type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: 1505,
  variables: VARS, wordVariables: WORDS,
};

async function main() {
  const PLC = `ws://127.0.0.1:${PORT}/ws/plc`;
  const RELAY = `ws://127.0.0.1:${PORT}/ws/relay`;
  const lanIp = detectLanIp();
  if (!lanIp) {
    console.error('未发现可用的本机 LAN IP；请用 DT_LAN_IP=<IP> 指定');
    process.exit(2);
  }
  console.log(`[security-check] 目标 :${PORT} · LAN 地址 ${lanIp}`);

  // A 代理层：LAN / 伪造 Host / 跨 Origin 一律拒绝 PLC 通道
  let denied;
  try { await open(`ws://${lanIp}:${PORT}/ws/plc`); denied = { status: 200 }; }
  catch (e) { denied = e; }
  check('LAN IP 访问 /ws/plc 被 403 拒绝', denied.status === 403 && denied.deny === 'viewer', denied);

  try { await open(PLC, { headers: { Host: `${lanIp}:${PORT}` } }); denied = { status: 200 }; }
  catch (e) { denied = e; }
  check('伪造回环 Host 无法绕过角色判定', denied.status === 403, denied);

  try { await open(PLC, { origin: 'http://evil.example' }); denied = { status: 200 }; }
  catch (e) { denied = e; }
  check('跨 Origin 的 PLC 握手被拒绝', denied.status === 403 && denied.deny === 'origin', denied);

  // B 未连接时不再静默兜底到 S7
  const wsA = await open(PLC);
  const rpcA = makeRpc(wsA);
  let r = await rpcA({ type: 'get-status' });
  check('未连接时 get-status 返回 connected=false', r.connected === false, r);
  for (const frame of [
    { type: 'read-vars', names: ['BUTTON_START'] },
    { type: 'read-coils', address: 0, length: 1 },
  ]) {
    r = await rpcA(frame);
    check(`${frame.type} 未连接时明确报错`, r.success === false && /PLC 未连接/.test(r.error || ''), r);
  }
  r = await rpcA({ type: 'frobnicate' });
  check('未知消息类型被拒绝', r.success === false && /未知消息类型/.test(r.error || ''), r);

  // C 恶意 / 越界 connect 帧
  const cases = [
    ['PS 注入帧被拦在校验层',
      { type: 'connect', protocol: 'mitsubishi', port: '0\nWrite-Host PWNED\n#' }, /逻辑站号|整数/],
    ['未知协议不再兜底到 Modbus',
      { type: 'connect', protocol: 'foo', host: '127.0.0.1', port: 1505 }, /未知协议/],
    ['非白名单 PLC 主机被拒绝',
      { type: 'connect', protocol: 'modbus', host: '192.168.1.50', port: 502 }, /不在允许列表/],
    ['port 越界被拒绝',
      { type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: 99999 }, /超出范围/],
    ['port 浮点被拒绝',
      { type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: 502.5 }, /必须是整数/],
    ['rack 越界被拒绝',
      { type: 'connect', protocol: 's7', host: '127.0.0.1', port: 102, rack: 99 }, /超出范围/],
    ['variables 非法变量名被拒绝',
      { type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: 1505, variables: { 'A;DROP': 1 } }, /变量名非法/],
    ['wordVariables 结构非法被拒绝',
      { type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: 1505, wordVariables: { X: { modbus: { address: -1, words: 2 } } } }, /超出范围|地址非法/],
  ];
  for (const [name, frame, re] of cases) {
    const out = await rpcA(frame);
    check(name, out.success === false && re.test(out.error || ''), out);
  }
  const polluted = await rpcA('{"id":"__ID__","type":"connect","protocol":"modbus","host":"127.0.0.1","port":1505,"variables":{"__proto__":{"polluted":true}}}');
  check('__proto__ 键被拒绝', polluted.success === false, polluted);
  r = await rpcA({ type: 'get-status' });
  check('恶意帧之后网关仍存活', r.success === true, r);

  // D 正常主控读写链路（回归）
  r = await rpcA(CONNECT_OK);
  check('合法 connect 连上虚拟 PLC', r.success === true, r);
  r = await rpcA({ type: 'get-status' });
  check('连接后 get-status 显示 modbus 已连接', r.connected === true && r.protocol === 'modbus', r);
  r = await rpcA({ type: 'write-coil', address: 0, value: true });
  check('write-coil 成功', r.success === true, r);
  r = await rpcA({ type: 'read-coils', address: 0, length: 1 });
  check('read-coils 回读到刚写入的线圈', r.success === true && r.values && r.values[0] === true, r);
  r = await rpcA({ type: 'write-words', names: ['ENCODER_PULSES'], values: [12345] });
  check('write-words（32 位 DINT）成功', r.success === true, r);
  r = await rpcA({ type: 'read-words', names: ['ENCODER_PULSES'] });
  check('read-words 回读 12345', r.success === true && r.values && r.values.ENCODER_PULSES === 12345, r);
  r = await rpcA({ type: 'read-vars', names: ['NOT_IN_TABLE'] });
  check('read-vars 未知变量名报错', r.success === false && /未知变量名/.test(r.error || ''), r);
  r = await rpcA({ type: 'read-coils', address: 70000, length: 1 });
  check('read-coils 越界地址报错', r.success === false && /超出范围/.test(r.error || ''), r);

  // E 会话隔离：唯一主控 + 非主控只读
  const wsB = await open(PLC);
  const rpcB = makeRpc(wsB);
  r = await rpcB(CONNECT_OK);
  check('第二个主控 connect 被拒绝', r.success === false && /已有主控/.test(r.error || ''), r);
  r = await rpcB({ type: 'write-coil', address: 0, value: false });
  check('非主控连接的写帧被拒绝', r.success === false && /只读/.test(r.error || ''), r);
  r = await rpcB({ type: 'read-coils', address: 0, length: 1 });
  check('非主控连接仍可只读镜像', r.success === true && Array.isArray(r.values), r);
  r = await rpcB({ type: 'disconnect' });
  check('非主控 disconnect 不能切断他人会话', r.success === false, r);
  r = await rpcA({ type: 'get-status' });
  check('主控会话未被旁人破坏', r.connected === true, r);
  r = await rpcA({ type: 'disconnect' });
  check('主控显式断开成功', r.success === true, r);
  wsA.close(); wsB.close();

  // F 中继角色：teacher 可上报，LAN viewer 零上行
  const teacherRelay = await open(RELAY);
  const viewerRelay = await open(`ws://${lanIp}:${PORT}/ws/relay`);
  const snapshots = [];
  viewerRelay.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot') snapshots.push(m);
    } catch { /* ignore */ }
  });
  teacherRelay.send(JSON.stringify({ type: 'report', deviceId: 'auto-dispensing', mode: 'demo', vars: { MOTOR_FWD: true } }));
  await sleep(350);
  check('教师机 report 后观众收到快照', snapshots.some((s) => s.deviceId === 'auto-dispensing'), snapshots.slice(-1));
  const before = snapshots.length;
  viewerRelay.send(JSON.stringify({ type: 'report', deviceId: 'FAKE', mode: 'demo', vars: { MOTOR_FWD: false } }));
  await sleep(350);
  check('LAN 观众伪造 report 被丢弃',
    snapshots.length === before && !snapshots.some((s) => s.deviceId === 'FAKE'), snapshots.slice(-1));

  const statusText = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:5085/status`, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(`${res.statusCode} ${b.slice(0, 80)}`));
    }).on('error', (e) => resolve(`ERR ${e.message}`));
  });
  check('虚拟 PLC 状态口仍在线', statusText.startsWith('200'), statusText);

  teacherRelay.close(); viewerRelay.close();
  await sleep(150);
  console.log(`\n==== RESULT ${pass}/${pass + fail} ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('PROBE CRASH', e); process.exit(2); });
