/**
 * 三菱 MX Component 内存设备替身（测试用，默认不启用）。
 *
 * 与 server.js > MitsubishiPlcClient._buildPSScript() 生成的 PowerShell 桥
 * **完全相同的行式 JSON 协议**：启动打印 READY，之后 stdin 每行一个 JSON 命令，
 * stdout 每行一个 JSON 响应。区别只是把真实 COM 设备对象换成进程内存 Map，
 * 因此无需 MX Component 逻辑站配置 / GX Simulator2 / 实物 CPU 也能跑通
 * 「数字孪生软件 ↔ 三菱 PLC」的变量级链路。
 *
 * 启用方式：启动 start-lab 前设 DT_MX_MOCK=1；默认关闭，产品行为逐字不变。
 */
const readline = require('readline');

const devices = new Map();
const station = Number(process.env.DT_MX_STATION || 0);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

console.error(`[MxMock] 内存设备桥就绪，逻辑站号=${station}（不连真实 PLC）`);
console.log('READY');

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let cmd;
  try { cmd = JSON.parse(text); } catch (_) { console.log('{"error":"bad json"}'); return; }
  try {
    switch (cmd.type) {
      case 'read': {
        const out = {};
        for (const d of cmd.devices || []) out[d] = devices.get(String(d)) ?? 0;
        console.log(JSON.stringify(out));
        break;
      }
      case 'read-words': {
        const items = (cmd.devices || []).map((d) => ({ ok: true, value: devices.get(String(d)) ?? 0 }));
        console.log(JSON.stringify({ items }));
        break;
      }
      case 'write': {
        devices.set(String(cmd.device), num(cmd.value));
        console.log('{"ok":true}');
        break;
      }
      case 'write-batch': {
        (cmd.devices || []).forEach((d, i) => devices.set(String(d), num((cmd.values || [])[i])));
        console.log('{"ok":true}');
        break;
      }
      case 'exit': {
        console.log('{"ok":true}');
        process.exit(0);
        break;
      }
      default:
        console.log('{"error":"unknown command"}');
    }
  } catch (e) {
    console.log(JSON.stringify({ error: String(e.message).replace(/"/g, "'") }));
  }
});
