/**
 * ================================================
 * 自动配药「32 位 DINT 位置寄存器」端到端自检
 * ================================================
 * 运行：node test-dispensing-encoder.js
 *
 * 临时拉起 mock-dispensing-server.js（Modbus 11505 / 状态口 5085）
 * 与一个独立网关实例（WS 18081，用 WS_PORT 环境变量隔离），验证：
 *   1. HR120 低字 + HR121 高字，FC16 一次原子写、FC03 读回无损；
 *   2. 虚拟 PLC 以 DINT 为位置闭环真值（position = 25 + value）；
 *   3. 前进到终点 / 回原点（Z 相归零）；
 *   4. 32 位全范围（含负数、>65535、INT32 边界）拆字 / 合并无损；
 *   5. 线圈 42-49 不再承载编码器，恒为 false；
 *   6. 网关 read-words / write-words 数值通道端到端无损，布尔 read-vars 不受影响；
 *   7. 1.5s 无 DT 写入时自动回退内部积分。
 *
 * 注意：会占用 5085 状态端口，运行时请先停掉其它 mock-dispensing-server 实例。
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const ModbusRTU = require('modbus-serial');
const WebSocket = require('ws');
const {
  DISPENSING_ADDRESSES, DISPENSING_REGISTERS, DISPENSING_WORDS,
} = require('./mock-addresses');
const { DINT_TEST_VECTORS, splitDint32, joinDint32 } = require('./dint32');

const PORT = 11505;
const HTTP_PORT = 5085;
const WS_PORT = 18081;
const A = DISPENSING_ADDRESSES;
const R = DISPENSING_REGISTERS;
const W = DISPENSING_WORDS;
const START_PULSE = 25;           // 原点绝对脉冲（X=0.25m × 100）
const ENCODER_PULSES_MAX = 170;   // 行程 1.70m

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${name}${detail ? `  ${detail}` : ''}`); }
  else { failed += 1; console.error(`  ❌ ${name}${detail ? `  ${detail}` : ''}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function status() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${HTTP_PORT}/status`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitReady(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await status(); } catch { await sleep(120); }
  }
  throw new Error('虚拟 PLC 状态口未就绪');
}

let reqId = 0;
function bridgeRequest(ws, payload) {
  return new Promise((resolve) => {
    const id = `dint_${++reqId}`;
    const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000);
    const onMessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id === id) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, ...payload }));
  });
}

async function waitWs(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    try {
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      return ws;
    } catch {
      try { ws.terminate(); } catch { /* ignore */ }
      await sleep(150);
    }
  }
  throw new Error('网关 WS 未就绪');
}

async function main() {
  const mockPath = path.join(__dirname, 'mock-dispensing-server.js');
  const gatewayPath = path.join(__dirname, 'server.js');
  const mock = spawn(process.execPath, [mockPath, String(PORT)], {
    cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const gateway = spawn(process.execPath, [gatewayPath], {
    cwd: __dirname,
    env: { ...process.env, WS_PORT: String(WS_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let mockLog = '';
  let gwLog = '';
  mock.stdout.on('data', (d) => { mockLog += d.toString(); });
  mock.stderr.on('data', (d) => { mockLog += d.toString(); });
  gateway.stdout.on('data', (d) => { gwLog += d.toString(); });
  gateway.stderr.on('data', (d) => { gwLog += d.toString(); });

  const client = new ModbusRTU();
  let ws = null;
  try {
    await waitReady();
    await client.connectTCP('127.0.0.1', { port: PORT });
    client.setID(1);

    const readWords = async () => (await client.readHoldingRegisters(R.ENCODER_PULSES, 2)).data;
    const writeDint = (n) => client.writeRegisters(R.ENCODER_PULSES, splitDint32(n));
    const readDint = async () => {
      const d = await readWords();
      return joinDint32(d[0], d[1]);
    };

    console.log('\n[1] 初始状态');
    let st = await status();
    ok('DINT 初值 = 0', st.register.value === 0, `value=${st.register.value}`);
    ok('寄存器类型为 dint32', st.register.type === 'dint32', `type=${st.register.type}`);
    ok('两个字的初值都是 0', JSON.stringify(st.register.words) === '[0,0]',
      `words=${JSON.stringify(st.register.words)}`);
    ok('未接孪生时 source = internal', st.register.source === 'internal', `source=${st.register.source}`);

    console.log('\n[2] FC16 原子写 DINT → 虚拟 PLC 位置闭环');
    await writeDint(137);
    ok('HR120 低字 = 137', (await readWords())[0] === 137);
    ok('HR121 高字 = 0', (await readWords())[1] === 0);
    ok('FC03 读回 DINT = 137', (await readDint()) === 137);
    await sleep(180);
    st = await status();
    ok('寄存器来源标记为 twin', st.register.source === 'twin', `source=${st.register.source}`);
    ok('PLC 位置 = 原点 25 + DINT 137', st.program.position === START_PULSE + 137,
      `position=${st.program.position}`);

    console.log('\n[3] 前进到终点 / 回原点 Z 相归零');
    await writeDint(ENCODER_PULSES_MAX);
    await sleep(180);
    st = await status();
    ok('终点 DINT = 170', st.register.value === ENCODER_PULSES_MAX, `value=${st.register.value}`);
    ok('终点位置 = 195', st.program.position === START_PULSE + ENCODER_PULSES_MAX,
      `position=${st.program.position}`);
    await writeDint(0);
    await sleep(180);
    st = await status();
    ok('回原点 DINT 归零', st.register.value === 0, `value=${st.register.value}`);
    ok('回原点位置 = 25', st.program.position === START_PULSE, `position=${st.program.position}`);

    console.log('\n[4] 32 位全范围：低字在前，拆字/合并无损');
    for (const { value, words } of DINT_TEST_VECTORS) {
      await writeDint(value);
      const got = await readWords();
      const same = got[0] === words[0] && got[1] === words[1] && (await readDint()) === value;
      ok(`DINT ${value} 双字无损`, same, `HR120/121=[${got.join(',')}] 期望=[${words.join(',')}]`);
    }
    await writeDint(73);
    ok('FC06 单字写 HR120 只改低字', (await readDint()) === 73);
    await writeDint(0);

    console.log('\n[5] 线圈 42-49 不再承载编码器位');
    const coilRes = await client.readCoils(42, 8);
    const coilData = Array.isArray(coilRes) ? coilRes : coilRes.data;
    ok('8 个旧线圈恒为 false', coilData.every((b) => !b), `coils=${JSON.stringify(coilData)}`);
    ok('地址表已移除全部 ENCODER_BIT',
      !Object.keys(A).some((k) => /^ENCODER_BIT\d$/.test(k)));

    // 网关数值通道单独占用一条连接，先释放直连客户端
    await new Promise((resolve) => { try { client.close(resolve); } catch { resolve(); } });
    ws = await waitWs();

    console.log('\n[6] 网关 read-words / write-words 数值通道');
    const conn = await bridgeRequest(ws, {
      type: 'connect', protocol: 'modbus', host: '127.0.0.1', port: PORT,
      variables: A, wordVariables: W,
    });
    ok('网关 connect 成功', conn.success === true, conn.error || '');
    for (const { value } of DINT_TEST_VECTORS) {
      const w = await bridgeRequest(ws, {
        type: 'write-words', names: ['ENCODER_PULSES'], values: [value],
      });
      const r = await bridgeRequest(ws, { type: 'read-words', names: ['ENCODER_PULSES'] });
      const s = await status();
      const good = w.success === true && r.success === true
        && r.values.ENCODER_PULSES === value && s.register.value === value;
      ok(`网关 DINT ${value} 往返一致`, good,
        `read=${r.values && r.values.ENCODER_PULSES} plc=${s.register.value}`);
    }
    const rv = await bridgeRequest(ws, {
      type: 'read-vars', names: ['MOTOR_FWD', 'LAMP_GREEN'],
    });
    ok('布尔 read-vars 通道仍正常', rv.success === true && typeof rv.values.MOTOR_FWD === 'boolean');
    await bridgeRequest(ws, { type: 'write-words', names: ['ENCODER_PULSES'], values: [0] });

    console.log('\n[7] 长时间无 DT 写入 → 回退内部积分');
    await sleep(1700);
    st = await status();
    ok('source 回到 internal', st.register.source === 'internal', `source=${st.register.source}`);
    ok('反馈时间戳仍被记录', st.register.feedbackAgeMs >= 1500, `age=${st.register.feedbackAgeMs}ms`);

    console.log(`\n端到端自检：${passed} 通过 / ${failed} 失败`);
    if (failed) { console.error('--- mock PLC ---\n' + mockLog); console.error('--- gateway ---\n' + gwLog); }
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    console.error('❌ 自检异常:', e.message);
    console.error('--- mock PLC ---\n' + mockLog);
    console.error('--- gateway ---\n' + gwLog);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch { /* ignore */ }
    try { client.close(() => undefined); } catch { /* ignore */ }
    gateway.kill();
    mock.kill();
  }
}

main();
