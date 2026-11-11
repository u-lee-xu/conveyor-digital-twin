#!/usr/bin/env node
/**
 * ================================================
 * vfd-485-master.cjs — MD520 B 档「真实 Modbus 主站轮询」教学演示
 * ================================================
 * 作为真正的 Modbus TCP 主站连 mock-vfd-slave.js :1508，发 FC06 / FC15 写、
 * FC03 / FC01 读，全部走 TCP 帧，不直接改从站内存。这就是「PLC 主站轮询变频器」：
 * 外部 PLC（AutoShop / 博途 / GX Works2 / 实物）可以用完全相同的帧取代本脚本。
 *
 * 轮询内容（与 18.3 表 18-1/18-2 一致）：
 *   写：2000H 控制命令 / 7310H 频率给定 / 1000H 百分比给定 / coils 130~134 (DI1~DI5)
 *   读：3000H 状态 / 1001H 运行频率 / 1009H DO 标志 / coils 140~142 (PLC 输入)
 *
 * 默认演示节拍：启动后 2s 保持停机，之后 4s 运行 / 2s 停机循环，频率 30/50Hz 交替。
 * 接外部 PLC 时设 DT_VFD_485_MASTER=0 关闭本脚本，避免两个主站抢写同一从站。
 *
 * 环境变量：DT_VFD_485_HOST（默认 127.0.0.1）、DT_VFD_485_PORT（默认 1508）、
 *           DT_VFD_485_PERIOD（默认 200ms）。
 */
const ModbusRTU = require('modbus-serial');
const { VFD_REGISTERS: VR } = require('./mock-addresses');

const HOST = process.env.DT_VFD_485_HOST || '127.0.0.1';
const PORT = Number(process.env.DT_VFD_485_PORT || 1508);
const PERIOD = Math.max(50, Number(process.env.DT_VFD_485_PERIOD || 200));
const UNIT_ID = 1;

const client = new ModbusRTU();
let connected = false;
let tick = 0;
let lastPhase = '';
const startedAt = Date.now();

async function connect() {
  await client.connectTCP(HOST, { port: PORT });
  client.setID(UNIT_ID);
  connected = true;
  console.log(`✅ [Vfd485Master] 主站已连 127.0.0.1:${PORT}，${PERIOD}ms 轮询（真实 Modbus TCP 帧）`);
}

/** 一轮完整的主站轮询：写给定 → 写 DI → 读状态 → 读 PLC 输入 */
async function poll() {
  const elapsed = Date.now() - startedAt;
  // 2s 后开始演示；4s 运行 / 2s 停机循环
  const cycle = Math.max(0, elapsed - 2000) % 6000;
  const running = elapsed >= 2000 && cycle < 4000;
  const freqHz = Math.floor(elapsed / 4000) % 2 === 0 ? 30 : 50;
  const phase = running ? `运行 ${freqHz}Hz` : '停机';
  if (phase !== lastPhase) {
    console.log(`[Vfd485Master] ${phase}`);
    lastPhase = phase;
  }

  const command = running ? 1 : 6; // 2000H 无 0 档，停机写 6（按 F6-10）
  const freq2 = running ? Math.round(freqHz * 100) : 0; // 7310H 按 0.01Hz
  const percent = running ? Math.round(freqHz / 50 * 10000) : 0; // 1000H ±100.00%

  await client.writeRegister(VR.VFD_COMMAND2, command);
  await client.writeRegister(VR.VFD_FREQ2, freq2);
  await client.writeRegister(VR.VFD_SETPOINT, percent);
  // DI1~DI3 段速位 + DI4 运行使能 + DI5（教学演示恒 false）
  await client.writeCoils(130, [running, false, false, running, false]);

  const status = await client.readHoldingRegisters(VR.VFD_STATUS1, 1);
  const outFreq = await client.readHoldingRegisters(VR.VFD_RUN_FREQ, 1);
  const doFlags = await client.readHoldingRegisters(VR.VFD_DO_FLAGS, 1);
  await client.readCoils(140, 3);

  // 只在每 25 轮（约 5s）打印一次联锁读数，避免刷屏
  if (tick % 25 === 0) {
    console.log(`[Vfd485Master] 联锁 3000H=${status.data[0]} 1001H=${outFreq.data[0]} 1009H=${doFlags.data[0]}`);
  }
  tick += 1;
}

async function loop() {
  if (!connected) {
    try { await connect(); } catch (e) {
      console.log(`[Vfd485Master] 等待从站 :${PORT}（${e.message}）`);
      return;
    }
  }
  try {
    await poll();
  } catch (e) {
    console.error('[Vfd485Master] 轮询异常，准备重连:', e.message);
    connected = false;
    try { client.close(() => {}); } catch (_) { /* ignore */ }
  }
}

setInterval(loop, PERIOD);
console.log(`[Vfd485Master] 启动，目标从站 ${HOST}:${PORT}；外部 PLC 独占时设 DT_VFD_485_MASTER=0`);
