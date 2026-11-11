/**
 * ================================================
 * mock-vfd-server.js — MD520 独立场景虚拟 PLC / 485 从站 (Modbus TCP Slave)
 * ================================================
 * 只服务 packages/md520-vfd 这个独立设备包，与自动配药 PLC :1505、
 * 传送带分拣 PLC :1503 完全分离：独立端口、独立线圈表、独立数值段、独立状态口。
 *
 * 内含两段：
 *  1) MD520 从站寄存器区 0x1000~0xF0FF（15 个专用地址三处同源）；
 *  2) vfdPlcScan() 每 100ms 的教学 PLC 参考程序，主动读写固定地址：
 *     DIDO : PLC DO(130~134) → 变频器 DI 1008H；变频器 DO 1009H → PLC DI(140~142)
 *     AI   : PLC AO 寄存器 900（0.01V/字）→ 变频器 AI1 100AH（数值镜像）
 *     485  : PLC 写 2000H / 7310H / 1000H，读 3000H / 1001H / 1009H 做联锁
 *     参数 : F002H / F003H / F00AH 由面板写、PLC 只读，决定用哪一路给定
 *
 * 读写分离：PLC 只写命令 / 给定，虚拟变频器（浏览器）只写状态 / 运行频率 / DO 标志。
 * 默认停机：不写运行命令、不置位 DI，避免页面刚打开就被 PLC 接管。
 *
 * 运行：node mock-vfd-server.js [端口]（默认 1507）
 * 状态：http://127.0.0.1:5087/status | 复位：/reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { VFD_REGISTERS: VR } = require('./mock-addresses');

const PORT = parseInt(process.argv[2] || '1507', 10);
const HTTP_PORT = 5087;

const coils = new Array(200).fill(false);

/** PLC 侧点位：120~125 主令、130~134 PLC DO（接变频器 DI）、140~142 PLC DI（变频器 DO） */
const VFD_IO = {
  START: 120, STOP: 121,
  SPEED1: 122, SPEED2: 123, SPEED3: 124, AI_ENABLE: 125,
  DO_DI1: 130, DO_DI2: 131, DO_DI3: 132, DO_DI4: 133, DO_DI5: 134,
  DI_RUN: 140, DI_REACH: 141, DI_FAULT: 142,
};

/** PLC 模拟量输出数值寄存器（0.01V/字），不在变频器从站地址段内 */
const PLC_AO1 = 900;
const VFD_ADDR_MIN = 0x1000;
const VFD_ADDR_MAX = 0xf0ff;
const isVfdAddress = (addr) => Number.isInteger(addr) && addr >= VFD_ADDR_MIN && addr <= VFD_ADDR_MAX;
const vfdWords = new Map();
const u16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(Number(v) || 0)));
const signed16 = (v) => (v > 0x7fff ? v - 0x10000 : v);
/** 教学多段速表，与前端 md520Spec.ts MD520_MULTI_SPEED 同值 */
const MULTI_SPEED = [0, 10, 20, 30, 40, 50, 35, 25];

let plcAo1 = 0;
let plcRunning = false;
let plcFreqHz = 30;
let plcPrevStart = false;
let plcPrevStop = false;
let plcDemoAt = 0;

/**
 * PLC 参考程序：以 100ms 扫描周期主动读写 MD520 从站固定地址。
 * 这是「PLC 程序控制变频器」的教学等价实现——PLC 侧主动发给定、读状态做联锁，
 * 虚拟变频器本体在浏览器侧经网关读写同一份寄存器，形成双向闭环。
 */
function vfdPlcScan() {
  const start = !!coils[VFD_IO.START];
  const stop = !!coils[VFD_IO.STOP];
  if (start && !plcPrevStart) {
    plcRunning = true;
    plcFreqHz = 30;
    plcDemoAt = Date.now() + 4000;
  }
  if (stop && !plcPrevStop) plcRunning = false;
  plcPrevStart = start;
  plcPrevStop = stop;

  const source = vfdWords.get(VR.VFD_PARAM_F0_02) ?? 0;
  const freqSource = vfdWords.get(VR.VFD_PARAM_F0_03) ?? 0;
  const maxHz = Math.max(10, Math.min(599, (vfdWords.get(VR.VFD_PARAM_F0_10) ?? 5000) / 100));

  // 段速选择优先；无外部段速时按 4 秒节拍在 30 / 50Hz 之间演示
  const seg = (coils[VFD_IO.SPEED1] ? 1 : 0)
    | (coils[VFD_IO.SPEED2] ? 2 : 0)
    | (coils[VFD_IO.SPEED3] ? 4 : 0);
  if (seg > 0) plcFreqHz = MULTI_SPEED[seg];
  else if (plcRunning && Date.now() >= plcDemoAt) {
    plcFreqHz = plcFreqHz >= 50 ? 30 : 50;
    plcDemoAt = Date.now() + 4000;
  }

  const aiHz = Math.max(0, Math.min(maxHz, signed16(plcAo1) / 1000 * maxHz));
  const aiActive = (freqSource === 2 || freqSource === 3) && !!coils[VFD_IO.AI_ENABLE];
  const targetHz = aiActive ? aiHz : plcFreqHz;

  // ---- DIDO：PLC DO → 变频器 DI 1008H ----
  const terminal = plcRunning && source === 1;
  coils[VFD_IO.DO_DI1] = terminal && !!(seg & 1);
  coils[VFD_IO.DO_DI2] = terminal && !!(seg & 2);
  coils[VFD_IO.DO_DI3] = terminal && !!(seg & 4);
  coils[VFD_IO.DO_DI4] = terminal;
  coils[VFD_IO.DO_DI5] = terminal && aiActive;
  const diFlags = [1, 2, 3, 4, 5].reduce((acc, n, i) =>
    acc | (coils[VFD_IO[`DO_DI${n}`]] ? 1 << i : 0), 0);
  vfdWords.set(VR.VFD_DI_FLAGS, u16(diFlags));

  // ---- AI：PLC AO → 变频器 AI1 100AH ----
  vfdWords.set(VR.VFD_AI1, aiActive ? u16(plcAo1) : 0);

  // ---- 485：PLC 主站写控制命令与频率给定 ----
  const comm = plcRunning && source === 2;
  vfdWords.set(VR.VFD_COMMAND2, comm ? 1 : 0);
  vfdWords.set(VR.VFD_FREQ2, comm ? u16(Math.round(targetHz * 100)) : 0);
  vfdWords.set(VR.VFD_SETPOINT, comm
    ? u16(Math.round(Math.min(10000, targetHz / maxHz * 10000))) : 0);

  // ---- 变频器 DO → PLC DI：状态回读联锁 ----
  const doFlags = vfdWords.get(VR.VFD_DO_FLAGS) ?? 0;
  const status1 = vfdWords.get(VR.VFD_STATUS1) ?? 3;
  coils[VFD_IO.DI_RUN] = !!(doFlags & 1);
  coils[VFD_IO.DI_REACH] = !!(doFlags & 16);
  coils[VFD_IO.DI_FAULT] = !!(doFlags & 4) || status1 === 5;
}

setInterval(vfdPlcScan, 100);

/** 单字写入：PLC AO 数值区与变频器从站区共用，越界静默忽略 */
function writeReg(addr, value) {
  if (addr === PLC_AO1) { plcAo1 = u16(value); return; }
  if (isVfdAddress(addr)) vfdWords.set(addr, u16(value));
}

const vector = {
  getCoil: (addr) => !!coils[addr],
  setCoil: (addr, value) => { coils[addr] = !!value; },
  getDiscreteInput: () => false,
  getHoldingRegister: (addr) => {
    if (addr === PLC_AO1) return u16(plcAo1);
    if (isVfdAddress(addr)) return vfdWords.get(addr) ?? 0;
    return 0;
  },
  setRegister: (addr, value) => writeReg(addr, value),
  setRegisterArray: (addr, words) => {
    if (!Array.isArray(words)) return;
    words.forEach((w, i) => writeReg(addr + i, w));
  },
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1',
  port: PORT,
  debug: false,
  unitId: 1,
});

serverTCP.on('initialized', () => {
  console.log(`✅ [MockVfdPLC] 监听 127.0.0.1:${PORT}（MD520 从站与 PLC 参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockVfdPLC] socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    const io = {};
    for (const [name, addr] of Object.entries(VFD_IO)) {
      io[name] = { addr, value: !!coils[addr] };
    }
    res.end(JSON.stringify({
      success: true,
      vfd: {
        program: {
          running: plcRunning, freqHz: plcFreqHz,
          source: vfdWords.get(VR.VFD_PARAM_F0_02) ?? 0,
          freqSource: vfdWords.get(VR.VFD_PARAM_F0_03) ?? 0,
        },
        io,
        plcAo1,
        words: Object.fromEntries(vfdWords),
      },
    }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    vfdWords.clear();
    plcAo1 = 0;
    plcRunning = false;
    plcFreqHz = 30;
    plcDemoAt = 0;
    plcPrevStart = plcPrevStop = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockVfdPLC] 状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
