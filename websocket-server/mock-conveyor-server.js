/**
 * ================================================
 * mock-conveyor-server.js — 传送带分拣参考程序虚拟PLC (Modbus TCP Slave)
 * ================================================
 * 用途：无硬件环境下端到端验证"评分系统"（useConveyorScoring）。
 * 本服务器模拟"学生已正确实现的PLC程序" + 现场传感器仿真：
 *   - 复位：三个单电控气缸失电缩回，传送带启动清料，5秒定时自动停止
 *   - 启动：上料气缸伸出→缩回（单电控失电），物料落下，传送带启动运输
 *   - 黑色物料：色标传感器触发 → 传送带停止 → 分拣1气缸伸出→缩回（互锁：仅1号位）
 *   - 蓝色物料：色标不触发（互锁验证），物料传感器触发 → 传送带停止 → 分拣2气缸伸出→缩回
 *
 * 地址（与 websocket-server/server.js MODBUS_ADDRESSES 一致）：
 *   0 启动 / 1 复位          —— DT 写入
 *   2-7 磁性开关             —— DT 写入（模型反馈）
 *   8-10 传感器(上料/色标/物料) —— 现场仿真，本程序持续置位（DT会回写覆盖，50ms循环重新置位）
 *   100-103 气缸阀/传送带     —— 本程序驱动
 *   104-106 信号灯            —— 本程序驱动
 *
 * 【场景独立 · MD520 变频器从站】本进程只服务传送带分拣场景，不含自动配药任何
 * 配方 / 编码器 / DINT 位置闭环。变频器 485 从站寄存器区（0x1000~0xF0FF）也在本进程，
 * 与配药虚拟 PLC :1505 完全分离。PLC 参考程序 vfdPlcScan() 每 100ms 主动读写固定地址：
 *   DIDO : PLC DO(130~134) → 变频器 DI 1008H；变频器 DO 1009H → PLC DI(140~142)
 *   AI   : PLC AO 数值寄存器 900（0.01V/字）→ 变频器 AI1 100AH（数值镜像）
 *   485  : PLC 写 2000H / 7310H / 1000H，读 3000H / 1001H / 1009H 做联锁
 *   参数 : 面板写 F002H / F003H / F00AH，PLC 只读，按命令源决定用哪一路给定
 * 读写分离：PLC 只写命令 / 给定，虚拟变频器（浏览器）只写状态 / 运行频率 / DO 标志。
 *
 * 运行：node mock-conveyor-server.js [端口] （默认 1503）
 * 调试：HTTP 状态接口 http://127.0.0.1:5083/status
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { VFD_REGISTERS: VR } = require('./mock-addresses');

const PORT = parseInt(process.argv[2] || '1503', 10);
const HTTP_PORT = 5083;

const coils = new Array(200).fill(false);

const A = {
  START: 0,
  RESET: 1,
  FEED_IN: 2,
  FEED_OUT: 3,
  SORT1_IN: 4,
  SORT1_OUT: 5,
  SORT2_IN: 6,
  SORT2_OUT: 7,
  FEED_SENSOR: 8,
  COLOR_SENSOR: 9,
  MATERIAL_SENSOR: 10,
  FEED_CTRL: 100,
  SORT1_CTRL: 101,
  SORT2_CTRL: 102,
  CONVEYOR: 103,
  SIGNAL_RED: 104,
  SIGNAL_GREEN: 105,
  SIGNAL_YELLOW: 106,
};

/* ========== MD520 变频器从站：PLC 侧 IO 点位与寄存器区 ========== */
/**
 * PLC 输入 / 输出点位。刻意避开配药与评分的 0-10 / 100-106，避免场景串味。
 * 120~125 由孪生或外部主令写入；130~134 是 PLC DO（接变频器 DI 端子）；
 * 140~142 是变频器 DO 回读后的 PLC DI（状态联锁）。
 */
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

const RESET_CLEAR_MS = 5000;     // 复位清料时间（评分要求5秒）
const TRAVEL_TO_COLOR_MS = 2500; // 黑色物料从出料到位标传感器时间
const TRAVEL_TO_MATERIAL_MS = 3500; // 蓝色物料从出料到物料传感器时间

// 程序状态
let mode = 'idle';            // idle | resetting | feeding | transporting | sort1 | sort2
let cycle = 'black';          // 当前物料颜色（第1次启动=黑，第2次=蓝）
let startsSinceReset = 0;
let resetDeadline = 0;
let travelStart = 0;
let prevStart = false;
let prevReset = false;
let s1State = 'idle';         // 分拣1气缸：idle | extend | retract
let s2State = 'idle';         // 分拣2气缸：idle | extend | retract

function atFeedCylinderExtended() { return !!coils[A.FEED_OUT]; }
function atFeedCylinderRetracted() { return !!coils[A.FEED_IN]; }
function atS1Extended() { return !!coils[A.SORT1_OUT]; }
function atS1Retracted() { return !!coils[A.SORT1_IN]; }
function atS2Extended() { return !!coils[A.SORT2_OUT]; }
function atS2Retracted() { return !!coils[A.SORT2_IN]; }

function resetSequence() {
  coils[A.FEED_CTRL] = false;   // 单电控失电 → 气缸缩回
  coils[A.SORT1_CTRL] = false;
  coils[A.SORT2_CTRL] = false;
  coils[A.FEED_SENSOR] = false;
  coils[A.COLOR_SENSOR] = false;
  coils[A.MATERIAL_SENSOR] = false;
  coils[A.CONVEYOR] = true;     // 传送带启动清料
  coils[A.SIGNAL_RED] = false;
  coils[A.SIGNAL_GREEN] = true;
  coils[A.SIGNAL_YELLOW] = false;
  mode = 'resetting';
  resetDeadline = Date.now() + RESET_CLEAR_MS;
  startsSinceReset = 0;
  s1State = 'idle';
  s2State = 'idle';
}

function startFeedCycle() {
  startsSinceReset++;
  cycle = startsSinceReset === 1 ? 'black' : 'blue';
  mode = 'feeding';
  coils[A.FEED_CTRL] = true;    // 上料气缸伸出
  coils[A.SIGNAL_GREEN] = true;
}

/**
 * PLC 扫描循环（每 50ms 一次）
 */
function scan() {
  const startBtn = !!coils[A.START];
  const resetBtn = !!coils[A.RESET];
  const startEdge = startBtn && !prevStart;
  const resetEdge = resetBtn && !prevReset;
  prevStart = startBtn;
  prevReset = resetBtn;

  if (resetEdge) resetSequence();

  switch (mode) {
    case 'resetting':
      if (Date.now() >= resetDeadline) {
        coils[A.CONVEYOR] = false;   // 5秒定时停止
        coils[A.SIGNAL_GREEN] = false;
        mode = 'idle';
      }
      break;

    case 'idle':
      if (startEdge) startFeedCycle();
      break;

    case 'feeding':
      if (coils[A.FEED_CTRL] && atFeedCylinderExtended()) {
        coils[A.FEED_CTRL] = false;  // 伸出到位 → 失电缩回（单电控）
      } else if (!coils[A.FEED_CTRL] && atFeedCylinderRetracted()) {
        coils[A.FEED_SENSOR] = true; // 物料落到上料位
        coils[A.CONVEYOR] = true;    // 传送带启动
        travelStart = Date.now();
        mode = 'transporting';
      }
      break;

    case 'transporting': {
      const elapsed = Date.now() - travelStart;
      if (elapsed > 600) coils[A.FEED_SENSOR] = false;   // 物料离开上料位
      if (cycle === 'black' && elapsed >= TRAVEL_TO_COLOR_MS) {
        coils[A.COLOR_SENSOR] = true;  // 黑色物料到位标传感器
        coils[A.CONVEYOR] = false;     // 传送带停止
        mode = 'sort1';
      } else if (cycle === 'blue' && elapsed >= TRAVEL_TO_MATERIAL_MS) {
        coils[A.MATERIAL_SENSOR] = true; // 蓝色物料到物料传感器
        coils[A.CONVEYOR] = false;       // 传送带停止
        mode = 'sort2';
      }
      break;
    }

    case 'sort1':
      if (s1State === 'idle') {
        s1State = 'extend';
        coils[A.SORT1_CTRL] = true;                     // 分拣1伸出
      } else if (s1State === 'extend' && atS1Extended()) {
        s1State = 'retract';
        coils[A.SORT1_CTRL] = false;                    // 单电控失电缩回
      } else if (s1State === 'retract' && atS1Retracted()) {
        s1State = 'idle';
        coils[A.COLOR_SENSOR] = false;                  // 物料已分拣
        mode = 'idle';
      }
      break;

    case 'sort2':
      if (s2State === 'idle') {
        s2State = 'extend';
        coils[A.SORT2_CTRL] = true;                     // 分拣2伸出
      } else if (s2State === 'extend' && atS2Extended()) {
        s2State = 'retract';
        coils[A.SORT2_CTRL] = false;
      } else if (s2State === 'retract' && atS2Retracted()) {
        s2State = 'idle';
        coils[A.MATERIAL_SENSOR] = false;
        mode = 'idle';
      }
      break;

    default:
      break;
  }
}

setInterval(scan, 50);

/**
 * PLC 参考程序：以 100ms 扫描周期主动读写 MD520 从站固定地址。
 * 这是「PLC 程序控制变频器」的教学等价实现——PLC 侧主动发给定、读状态做联锁，
 * 虚拟变频器本体在浏览器侧经网关读写同一份寄存器，形成双向闭环。
 * 默认停机：不写运行命令、不置位 DI，避免页面刚打开就被 PLC 接管带速。
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

  // 命令源 / 频率源 / 最大频率由面板写入，PLC 只读
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

  // AI 模拟量：PLC AO 数值 → 频率（0.01V/字，0~10V 线性对应 0~最大频率）
  const aiHz = Math.max(0, Math.min(maxHz, signed16(plcAo1) / 1000 * maxHz));
  const aiActive = (freqSource === 2 || freqSource === 3) && !!coils[VFD_IO.AI_ENABLE];
  const targetHz = aiActive ? aiHz : plcFreqHz;

  // ---- DIDO：PLC DO → 变频器 DI 1008H ----
  const terminal = plcRunning && source === 1;
  coils[VFD_IO.DO_DI1] = terminal && !!(seg & 1);
  coils[VFD_IO.DO_DI2] = terminal && !!(seg & 2);
  coils[VFD_IO.DO_DI3] = terminal && !!(seg & 4);
  coils[VFD_IO.DO_DI4] = terminal;               // 运行使能
  coils[VFD_IO.DO_DI5] = terminal && aiActive;
  const diFlags = [1, 2, 3, 4, 5].reduce((acc, n, i) =>
    acc | (coils[VFD_IO[`DO_DI${n}`]] ? 1 << i : 0), 0);
  vfdWords.set(VR.VFD_DI_FLAGS, u16(diFlags));

  // ---- AI：PLC AO → 变频器 AI1 100AH ----
  vfdWords.set(VR.VFD_AI1, aiActive ? u16(plcAo1) : 0);

  // ---- 485：PLC 主站写控制命令与频率给定 ----
  const comm = plcRunning && source === 2;
  vfdWords.set(VR.VFD_COMMAND2, comm ? 1 : 0);   // 1 = 正转运行
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
  setCoil: (addr, value) => {
    coils[addr] = !!value;
  },
  getDiscreteInput: () => false,
  getHoldingRegister: (addr) => {
    if (addr === PLC_AO1) return u16(plcAo1);
    if (isVfdAddress(addr)) return vfdWords.get(addr) ?? 0;
    return 0;
  },
  setRegister: (addr, value) => writeReg(addr, value),
  /** FC16 一次写多字：逐址落盘，不覆盖相邻寄存器语义之外的段 */
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
  console.log(`✅ [MockConveyorPLC] 监听 127.0.0.1:${PORT}（参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockConveyorPLC] socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    const status = {};
    for (const [name, addr] of Object.entries(A)) {
      status[name] = { addr, value: !!coils[addr] };
    }
    const vfdIo = {};
    for (const [name, addr] of Object.entries(VFD_IO)) {
      vfdIo[name] = { addr, value: !!coils[addr] };
    }
    res.end(JSON.stringify({
      success: true,
      program: { mode, cycle, startsSinceReset },
      coils: status,
      vfd: {
        program: {
          running: plcRunning, freqHz: plcFreqHz,
          source: vfdWords.get(VR.VFD_PARAM_F0_02) ?? 0,
          freqSource: vfdWords.get(VR.VFD_PARAM_F0_03) ?? 0,
        },
        io: vfdIo,
        plcAo1,
        words: Object.fromEntries([...vfdWords.entries()].map(([a, v]) => [a, v])),
      },
    }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    mode = 'idle';
    cycle = 'black';
    startsSinceReset = 0;
    prevStart = prevReset = false;
    vfdWords.clear();
    plcAo1 = 0;
    plcRunning = false;
    plcFreqHz = 30;
    plcDemoAt = 0;
    plcPrevStart = plcPrevStop = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.end(JSON.stringify({ success: false, error: '未知路径' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockConveyorPLC] HTTP状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
