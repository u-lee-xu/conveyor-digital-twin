/**
 * ================================================
 * 自动配药「HR120 增量式编码器数据寄存器」端到端自检
 * ================================================
 * 运行：node test-dispensing-encoder.js
 *
 * 会临时拉起 mock-dispensing-server.js（Modbus 端口 11505，状态口固定 5085），
 * 用真实 Modbus TCP 客户端验证：
 *   1. 孪生写 ENCODER_BIT0-7 → HR120 能还原成同一个脉冲数；
 *   2. 虚拟 PLC 以寄存器为位置闭环真值（position = 25 + HR120）；
 *   3. 前进 / 回原点（Z 相归零）位置正确；
 *   4. 外部写 HR120 会同步 8 位线圈镜像（同一计数器两种寻址视图）；
 *   5. 1.5s 无 DT 写入时自动回退内部积分，方便虚拟 PLC 独立运行。
 *
 * 注意：会占用 5085 状态端口，运行时请先停掉其它 mock-dispensing-server 实例。
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const ModbusRTU = require('modbus-serial');
const { DISPENSING_ADDRESSES, DISPENSING_REGISTERS } = require('./mock-addresses');

const PORT = 11505;
const HTTP_PORT = 5085;
const A = DISPENSING_ADDRESSES;
const R = DISPENSING_REGISTERS;
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

function bitsOf(n) {
  return Array.from({ length: 8 }, (_, i) => ((n >> i) & 1) === 1);
}

async function main() {
  const serverPath = path.join(__dirname, 'mock-dispensing-server.js');
  const child = spawn(process.execPath, [serverPath, String(PORT)], {
    cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d.toString(); });
  child.stderr.on('data', (d) => { serverLog += d.toString(); });

  const client = new ModbusRTU();
  try {
    await waitReady();
    await client.connectTCP('127.0.0.1', { port: PORT });
    client.setID(1);

    const readHR = async () => (await client.readHoldingRegisters(R.ENCODER_PULSES, 1)).data[0];
    const writeBits = (n) => client.writeCoils(A.ENCODER_BIT0, bitsOf(n));

    console.log('\n[1] 初始状态');
    let st = await status();
    ok('HR120 初值 = 0', st.register.value === 0, `value=${st.register.value}`);
    ok('未接孪生时 source = internal', st.register.source === 'internal', `source=${st.register.source}`);

    console.log('\n[2] 孪生写 8 位线圈 → 寄存器 → PLC 位置闭环');
    await writeBits(137);
    let hr = await readHR();
    ok('HR120 还原为 137', hr === 137, `HR120=${hr}`);
    await sleep(180); // 等一个 100ms 扫描周期把寄存器折算进 curPos
    st = await status();
    ok('寄存器来源标记为 twin', st.register.source === 'twin', `source=${st.register.source}`);
    ok('PLC 位置 = 原点25 + 寄存器137', st.program.position === START_PULSE + 137,
      `position=${st.program.position}`);

    console.log('\n[3] 前进到终点 / 回原点 Z 相归零');
    await writeBits(ENCODER_PULSES_MAX);
    await sleep(180);
    st = await status();
    ok('终点寄存器 = 170', st.register.value === ENCODER_PULSES_MAX, `HR120=${st.register.value}`);
    ok('终点位置 = 195', st.program.position === START_PULSE + ENCODER_PULSES_MAX,
      `position=${st.program.position}`);

    await writeBits(0);
    await sleep(180);
    st = await status();
    ok('回原点寄存器归零', st.register.value === 0, `HR120=${st.register.value}`);
    ok('回原点位置 = 25', st.program.position === START_PULSE, `position=${st.program.position}`);

    console.log('\n[4] 外部写 HR120 → 8 位线圈镜像同步');
    await client.writeRegister(R.ENCODER_PULSES, 73);
    hr = await readHR();
    const coilRes = await client.readCoils(A.ENCODER_BIT0, 8);
    const coilData = Array.isArray(coilRes) ? coilRes : coilRes.data;
    let decoded = 0;
    coilData.forEach((b, i) => { if (b) decoded |= 1 << i; });
    ok('写 HR120=73 后读回一致', hr === 73, `HR120=${hr}`);
    ok('8 位线圈镜像 = 73', decoded === 73, `decoded=${decoded}`);

    console.log('\n[5] 长时间无 DT 写入 → 回退内部积分');
    await sleep(1700);
    st = await status();
    ok('source 回到 internal', st.register.source === 'internal', `source=${st.register.source}`);
    ok('反馈时间戳仍被记录', st.register.feedbackAgeMs >= 1500, `age=${st.register.feedbackAgeMs}ms`);

    console.log(`\n端到端自检：${passed} 通过 / ${failed} 失败`);
    if (failed) console.error(serverLog);
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    console.error('❌ 自检异常:', e.message);
    console.error(serverLog);
    process.exitCode = 1;
  } finally {
    try { client.close(() => undefined); } catch { /* ignore */ }
    child.kill();
  }
}

main();
