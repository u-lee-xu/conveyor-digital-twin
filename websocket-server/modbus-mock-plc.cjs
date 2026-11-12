/**
 * 测试专用：纯 Modbus TCP 从站，只提供 HR200~212 / C20~37 寄存器区。
 * 不含任何 PLC 参考程序 / 状态机 —— 所有变化必须由外部主站用真实帧写入。
 * 等价学生在 InoProShop / PLCSIM / GX Simulator2 里跑起来的仿真 PLC 从站。
 * 状态口 :5092/status 供验收读取写入统计与寄存器快照。
 * 手动启动：node modbus-mock-plc.cjs（默认 :502，绑 127.0.0.1）；产品 start:lab 默认不启动。
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');

const PORT = 502;
const HTTP_PORT = 5092;
const coils = new Array(64).fill(false);
const regs = new Map();
let regWrites = 0;
let coilWrites = 0;
const coilWriteLog = {};
let startPulses = 0;
let lastWriteAt = 0;

const u16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(Number(v) || 0)));

const vector = {
  getCoil: (a) => !!coils[a],
  setCoil: (a, v) => {
    coils[a] = !!v;
    coilWrites += 1;
    coilWriteLog[a] = (coilWriteLog[a] || 0) + 1;
    if (a === 27 && v) startPulses += 1;
    lastWriteAt = Date.now();
  },
  getDiscreteInput: () => false,
  getHoldingRegister: (a) => regs.get(a) ?? 0,
  setRegister: (a, v) => {
    regs.set(a, u16(v));
    regWrites += 1;
    lastWriteAt = Date.now();
  },
  setRegisterArray: (a, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((w, i) => regs.set(a + i, u16(w)));
    regWrites += 1;
    lastWriteAt = Date.now();
  },
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1', port: PORT, unitId: 1, debug: false,
});
serverTCP.on('initialized', () => console.log(`[PureSlave] 127.0.0.1:${PORT} 纯从站就绪（无 PLC 程序）`));
serverTCP.on('socketError', (e) => console.error('[PureSlave]', e.message));

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    res.end(JSON.stringify({
      success: true, role: 'pure-slave', port: PORT,
      regWrites, coilWrites, coilWriteLog, startPulses, lastWriteAt,
      registers: Object.fromEntries(regs),
      coils: Object.fromEntries(coils.map((v, i) => [i, v]).filter(([i]) => i >= 20 && i <= 37)),
    }));
  } else if (url.pathname === '/reset') {
    regs.clear(); coils.fill(false); regWrites = 0; coilWrites = 0; startPulses = 0;
    for (const k of Object.keys(coilWriteLog)) delete coilWriteLog[k];
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
}).listen(HTTP_PORT, '127.0.0.1', () => console.log(`[PureSlave] 状态口 http://127.0.0.1:${HTTP_PORT}/status`));
