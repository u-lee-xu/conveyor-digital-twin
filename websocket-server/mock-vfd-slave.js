/**
 * ================================================
 * mock-vfd-slave.js — MD520 B 档「独立 485 从站」(Modbus TCP Slave)
 * ================================================
 * 与教学虚拟 PLC :1507 完全分离：独立端口 1508、独立线圈表、独立寄存器区、
 * 独立状态口 5088，全部显式绑 127.0.0.1。已定稿的配药 :1505 / 分拣 :1503 零耦合。
 *
 * 这是**纯从站**：不含任何 PLC 参考程序，不会自己改寄存器。所有变化都必须来自
 * 主站通过真实 Modbus 帧（FC03 / FC06 / FC16 / FC01 / FC05 / FC15）主动轮询：
 *   - vfd-485-master.cjs：本机内置教学主站，演示 PLC 主站轮询；
 *   - 外部 PLC（AutoShop / 博途 / GX Works2 / 实物 PLC）：可直连本端口当主站，
 *     此时用 DT_VFD_485_MASTER=0 关掉内置主站，避免两个主站抢写。
 *
 * 前端也可以把 PLC 连接预设切到本端口，让面板 / 3D 直接跟随这份独立从站区。
 *
 * 运行：node mock-vfd-slave.js [端口]（默认 1508）
 * 状态：http://127.0.0.1:5088/status | 复位：/reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { VFD_REGISTERS: VR } = require('./mock-addresses');

const PORT = parseInt(process.argv[2] || '1508', 10);
const HTTP_PORT = parseInt(process.env.DT_VFD_SLAVE_HTTP || '5088', 10);

const coils = new Array(200).fill(false);
const VFD_ADDR_MIN = 0x1000;
const VFD_ADDR_MAX = 0xf0ff;
const isVfdAddress = (addr) => Number.isInteger(addr) && addr >= VFD_ADDR_MIN && addr <= VFD_ADDR_MAX;
const u16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(Number(v) || 0)));
const words = new Map();

/** 主站观测：只统计，不干预，便于 /status 与帧级验收观察真实主从链路 */
let masterFrames = 0;
let lastMasterWrite = 0;
const noteMasterWrite = () => { masterFrames += 1; lastMasterWrite = Date.now(); };

function reset() {
  coils.fill(false);
  words.clear();
  // 默认停机：2000H 无 0 档，写 6（按 F6-10 停机）；状态 3 = 停机
  words.set(VR.VFD_COMMAND2, 6);
  words.set(VR.VFD_STATUS1, 3);
  masterFrames = 0;
  lastMasterWrite = 0;
}
reset();

const vector = {
  getCoil: (addr) => !!coils[addr],
  setCoil: (addr, value) => { coils[addr] = !!value; noteMasterWrite(); },
  getDiscreteInput: () => false,
  getHoldingRegister: (addr) => (isVfdAddress(addr) ? words.get(addr) ?? 0 : 0),
  setRegister: (addr, value) => {
    if (isVfdAddress(addr)) words.set(addr, u16(value));
    noteMasterWrite();
  },
  setRegisterArray: (addr, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((w, i) => { if (isVfdAddress(addr + i)) words.set(addr + i, u16(w)); });
    noteMasterWrite();
  },
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1',
  port: PORT,
  debug: false,
  unitId: 1,
});

serverTCP.on('initialized', () => {
  console.log(`✅ [MockVfdSlave] 监听 127.0.0.1:${PORT}（B 档独立 485 从站，等待主站轮询）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockVfdSlave] socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    res.end(JSON.stringify({
      success: true,
      port: PORT,
      /** B 档从站不含参考程序，这里明确标注角色，避免与 :1507 混淆 */
      role: 'pure-slave',
      masterFrames,
      lastMasterWrite,
      words: Object.fromEntries(words),
      coils: Object.fromEntries(coils.map((v, i) => [i, v]).filter(([i]) => i >= 120 && i <= 142)),
    }));
  } else if (url.pathname === '/reset') {
    reset();
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
});
httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockVfdSlave] 状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
