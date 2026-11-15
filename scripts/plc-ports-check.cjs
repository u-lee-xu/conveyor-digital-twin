#!/usr/bin/env node
/**
 * 内置虚拟 PLC 靶机可读性检查（仅开发 / 验收形态，需要 start:devlab）
 *
 *   npm run start:devlab && node scripts/plc-ports-check.cjs
 *
 * 教学交付的 start:lab 不启动任何内置虚拟 PLC，此时本脚本应报「靶机未启用」。
 * 对开发靶机做 FC01 读线圈 + FC05 原值写回（不改变状态），确认每个靶机
 * 在线且可被第二个 Modbus 主站访问 —— 这是 plc-3d-link-check.cjs 的前提。
 */
const ModbusRTU = require('../websocket-server/node_modules/modbus-serial');

const PORTS = [
  { port: 1503, name: '传送带分拣' },
  { port: 1505, name: '自动配药' },
  { port: 1507, name: 'MD520 485 主站' },
  { port: 1508, name: 'MD520 B 档从站' },
];

async function main() {
  let pass = 0;
  for (const { port, name } of PORTS) {
    const client = new ModbusRTU();
    try {
      await client.connectTCP('127.0.0.1', { port });
      client.setID(1);
      const read = await client.readCoils(0, 1);
      const value = !!(read.data && read.data[0]);
      await client.writeCoil(0, value); // 原值写回，不改变演示状态
      const again = await client.readCoils(0, 1);
      const ok = !!(again.data) && again.data[0] === value;
      if (ok) pass += 1;
      console.log(`${ok ? '✅' : '❌'} :${port} ${name} · FC01/FC05 往返正常 · coil0=${value}`);
    } catch (e) {
      console.log(`❌ :${port} ${name} · ${e.message}`);
    } finally {
      try { client.close(); } catch { /* 已关闭 */ }
    }
  }
  console.log(`==== RESULT ${pass}/${PORTS.length}`);
  process.exit(pass === PORTS.length ? 0 : 1);
}

main().catch((e) => { console.error('[plc-ports]', e); process.exit(1); });
