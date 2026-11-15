#!/usr/bin/env node
/**
 * ================================================
 * mock-gantry-server.js — 汇川龙门 XY 象棋分拣「可选本机练习靶机」(Modbus TCP Slave)
 * ================================================
 * 【产品默认不启用】龙门仿真模式对接外部 PLC 仿真软件（Modbus TCP :502），
 * 学生在 InoProShop / AutoShop / PLCSIM / GX Simulator2 里写自己的 PLC 程序，
 * 本场景经网关读回寄存器跟着动。内置参考程序只是「无仿真软件时的联调靶子」，
 * 不是教学主路径，前端连接预设也不列出（需手填 127.0.0.1:1509）。
 * 手动启动：node mock-gantry-server.js [端口]，或 start-lab 设 DT_ENABLE_GANTRY_MOCK=1。
 *
 * 只服务 packages/inovance-gantry 这个独立设备包。端口 1509 / 状态口 5089，
 * 全部显式绑 127.0.0.1，与已定稿的配药 :1505、分拣 :1503、MD520 :1507 / :1508
 * 完全分离：独立端口、独立线圈表、独立寄存器区、独立参考程序、独立状态口。
 *
 * 内含两段：
 *  1) 龙门从站寄存器区 HR0~10 / 线圈 C0~17（地址与 gantryVariables.ts 同源）；
 *  2) gantryPlcScan() 每 100ms 的教学 PLC 参考程序：按「启动」主令循环执行
 *     十步搬运，只写 position 坐标变量与信号，浏览器每 300ms 读回同一份寄存器。
 *
 * 读写分离：PLC 只写实际位置 / 目标位置 / 阶段 / 输出信号，浏览器只写主令线圈；
 * 外部 PLC 直接写 HR0~10 时，内置参考程序让位 2s，避免把外部给定覆盖掉。
 * 主令是一次性脉冲（true→false 可能短于扫描周期），故在 setCoil 捕获上升沿。
 *
 * ETHERCAT 仍只是前端 gantryVariables.ts 里的变量/信号映射表，本进程不实现
 * 任何 EtherCAT 主站、PDO 报文或底层硬件链路。
 *
 * 运行：node mock-gantry-server.js [端口]（默认 1509）
 * 状态：http://127.0.0.1:5089/status | 复位：/reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');

const PORT = parseInt(process.argv[2] || '1509', 10);
const HTTP_PORT = parseInt(process.env.DT_GANTRY_HTTP || '5089', 10);

/**
 * 教学映射：与 packages/inovance-gantry/src/constants/gantryVariables.ts
 * 的 GANTRY_WORD_VARIABLES / GANTRY_HOLDING_REGISTERS / GANTRY_COILS 逐键同源，
 * 由 mock-addresses.js 的 checkGantryPlc() 锁死，改一处必须同步另一处。
 */
const HR = {
  GANTRY_X_POS: 0, GANTRY_X_POS_HI: 1,
  GANTRY_Y_POS: 2, GANTRY_Y_POS_HI: 3,
  GANTRY_X_TGT: 4, GANTRY_X_TGT_HI: 5,
  GANTRY_Y_TGT: 6, GANTRY_Y_TGT_HI: 7,
  GANTRY_Z_POS: 8, GANTRY_PHASE: 9, GANTRY_HELD_PIECE: 10,
  /** 吸取 / 放置目标格，row*3+col（0~8），浏览器据此完成棋子吸放 */
  GANTRY_PICK_CELL: 11, GANTRY_PLACE_CELL: 12,
};
const REG_MIN = HR.GANTRY_X_POS;
const REG_MAX = HR.GANTRY_PLACE_CELL;

const COIL = {
  X_ENABLE: 0, Y_ENABLE: 1, X_IN_POS: 2, Y_IN_POS: 3,
  CYL_DOWN: 4, VACUUM: 5, HAS_PART: 6, START: 7, ESTOP: 8,
  SENSOR_ORIGIN: 9, SENSOR_END_MINUS: 10, SENSOR_END_PLUS: 11,
  SENSOR_X_ORIGIN: 12, SENSOR_X_END_MINUS: 13, SENSOR_X_END_PLUS: 14,
  STOP: 15, RESET: 16, CONFIRM: 17,
};

/** 与前端 GANTRY_PHASE 十步同源 */
const PHASE = {
  IDLE: 0, MOVE_TO_PICK: 1, Z_DOWN_PICK: 2, VACUUM_ON: 3, Z_UP_PICK: 4,
  MOVE_TO_PLACE: 5, Z_DOWN_PLACE: 6, VACUUM_OFF: 7, Z_UP_PLACE: 8, DONE: 9,
};

/**
 * 与 gantryConstants.ts 的 GANTRY_AXIS / GANTRY_BOARD / GANTRY_SENSOR 同源。
 * 注意：以下全是毫米几何阈值，不是 PLC 地址；调整线圈 / 寄存器地址时不要平移这些数字。
 */
const AXIS = { X_TRAVEL: 500, Y_TRAVEL: 500, Z_STROKE: 50 };
const BOARD = { OFFSET_X: 100, OFFSET_Y: 100, CELL_SPACING: 40 };
const SENSOR = {
  X_ORIGIN: 25, Y_ORIGIN: 20, X_END_MINUS: 0, X_END_PLUS: 500,
  Y_END_MINUS: 0, Y_END_PLUS: 500, TOLERANCE: 8, END_TOLERANCE: 4,
};
const cellMm = (row, col) => ({
  x: BOARD.OFFSET_X + col * BOARD.CELL_SPACING + BOARD.CELL_SPACING / 2,
  y: BOARD.OFFSET_Y + row * BOARD.CELL_SPACING + BOARD.CELL_SPACING / 2,
});

/** 与 gantryConstants.ts 的 GANTRY_DEMO_SEQUENCE 同源（循环搬运一轮 3 次） */
const ROUTE = [
  { pick: [0, 0], place: [2, 0], label: 'A1 → C1' },
  { pick: [1, 1], place: [0, 2], label: 'B2 → A3' },
  { pick: [2, 2], place: [1, 0], label: 'C3 → B1' },
];

const u16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(Number(v) || 0)));
const approach = (cur, target, step) => (
  Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step
);

let coils = new Array(64).fill(false);
const regs = new Map();

let running = false;
let estop = false;
let phase = PHASE.IDLE;
let routeIndex = 0;
let completed = 0;
let dwell = 0;
let xPos = 0;
let yPos = 0;
let zPos = 0;
let xTgt = 0;
let yTgt = 0;
let vacuum = false;
let cylinderDown = false;
let held = 0;
let plcScans = 0;
/** 外部 PLC 程序直接写 HR0~10 后的让位窗口：内置参考程序暂不覆盖位置给定 */
let externalPosUntil = 0;

/** 一次性主令脉冲：setCoil 捕获上升沿，扫描周期消费，避免 true→false 被 100ms 轮询漏掉 */
const pending = { start: false, stop: false, reset: false, estop: false, confirm: false };
const MAIN_COMMANDS = {
  [COIL.START]: 'start',
  [COIL.STOP]: 'stop',
  [COIL.RESET]: 'reset',
  [COIL.ESTOP]: 'estop',
  [COIL.CONFIRM]: 'confirm',
};

/** 把 PLC 内部真值发布到从站寄存器区 / 线圈区，供浏览器 300ms 读回 */
function publish() {
  if (Date.now() < externalPosUntil) return;
  regs.set(HR.GANTRY_X_POS, u16(Math.round(xPos)));
  regs.set(HR.GANTRY_X_POS_HI, 0);
  regs.set(HR.GANTRY_Y_POS, u16(Math.round(yPos)));
  regs.set(HR.GANTRY_Y_POS_HI, 0);
  regs.set(HR.GANTRY_X_TGT, u16(Math.round(xTgt)));
  regs.set(HR.GANTRY_X_TGT_HI, 0);
  regs.set(HR.GANTRY_Y_TGT, u16(Math.round(yTgt)));
  regs.set(HR.GANTRY_Y_TGT_HI, 0);
  regs.set(HR.GANTRY_Z_POS, u16(Math.round(zPos)));
  regs.set(HR.GANTRY_PHASE, u16(phase));
  regs.set(HR.GANTRY_HELD_PIECE, u16(held));
  // 当前一轮的吸取 / 放置目标格：浏览器按真空边沿吸放棋子时不用靠滞后的吸盘坐标猜
  const route = ROUTE[routeIndex % ROUTE.length];
  regs.set(HR.GANTRY_PICK_CELL, u16(route.pick[0] * 3 + route.pick[1]));
  regs.set(HR.GANTRY_PLACE_CELL, u16(route.place[0] * 3 + route.place[1]));

  coils[COIL.X_ENABLE] = running;
  coils[COIL.Y_ENABLE] = running;
  coils[COIL.X_IN_POS] = Math.abs(xPos - xTgt) < 0.6;
  coils[COIL.Y_IN_POS] = Math.abs(yPos - yTgt) < 0.6;
  coils[COIL.CYL_DOWN] = cylinderDown;
  coils[COIL.VACUUM] = vacuum;
  coils[COIL.HAS_PART] = held > 0;
  coils[COIL.SENSOR_ORIGIN] = Math.abs(yPos - SENSOR.Y_ORIGIN) <= SENSOR.TOLERANCE;
  coils[COIL.SENSOR_END_MINUS] = yPos <= SENSOR.Y_END_MINUS + SENSOR.END_TOLERANCE;
  coils[COIL.SENSOR_END_PLUS] = yPos >= SENSOR.Y_END_PLUS - SENSOR.END_TOLERANCE;
  coils[COIL.SENSOR_X_ORIGIN] = Math.abs(xPos - SENSOR.X_ORIGIN) <= SENSOR.TOLERANCE;
  coils[COIL.SENSOR_X_END_MINUS] = xPos <= SENSOR.X_END_MINUS + SENSOR.END_TOLERANCE;
  coils[COIL.SENSOR_X_END_PLUS] = xPos >= SENSOR.X_END_PLUS - SENSOR.END_TOLERANCE;
}

function resetState() {
  coils = new Array(64).fill(false);
  regs.clear();
  running = false;
  estop = false;
  phase = PHASE.IDLE;
  routeIndex = 0;
  completed = 0;
  dwell = 0;
  xPos = 0; yPos = 0; zPos = 0; xTgt = 0; yTgt = 0;
  vacuum = false; cylinderDown = false; held = 0;
  externalPosUntil = 0;
  for (const key of Object.keys(pending)) pending[key] = false;
  publish();
}

/**
 * 教学 PLC 参考程序：100ms 扫描，只写 position 坐标变量与信号。
 * 这是「PLC 程序控制龙门」的教学等价实现——PLC 侧主动发给定、回读联锁，
 * 浏览器侧经网关读写同一份寄存器，形成双向闭环。
 */
function gantryPlcScan() {
  plcScans += 1;

  // 1) 消费一次性主令脉冲
  if (pending.reset) {
    resetState();
    return;
  }
  if (pending.estop) { estop = true; running = false; phase = PHASE.IDLE; }
  if (pending.start && !estop) {
    running = true; phase = PHASE.MOVE_TO_PICK; routeIndex = 0; dwell = 0;
    vacuum = false; cylinderDown = false; held = 0;
    estop = false;
  }
  if (pending.stop) { running = false; phase = PHASE.IDLE; }
  for (const key of Object.keys(pending)) pending[key] = false;

  // 2) 十步搬运状态机（循环执行，直到 STOP / ESTOP）
  if (running && !estop) {
    const route = ROUTE[routeIndex % ROUTE.length];
    switch (phase) {
      case PHASE.MOVE_TO_PICK: {
        const c = cellMm(route.pick[0], route.pick[1]);
        xTgt = c.x; yTgt = c.y;
        xPos = approach(xPos, xTgt, 12);
        yPos = approach(yPos, yTgt, 12);
        if (Math.abs(xPos - xTgt) < 0.6 && Math.abs(yPos - yTgt) < 0.6) {
          phase = PHASE.Z_DOWN_PICK; cylinderDown = true;
        }
        break;
      }
      case PHASE.Z_DOWN_PICK:
        zPos = approach(zPos, AXIS.Z_STROKE, 15);
        if (zPos >= AXIS.Z_STROKE - 0.6) phase = PHASE.VACUUM_ON;
        break;
      case PHASE.VACUUM_ON:
        vacuum = true; held = 1; dwell += 1;
        if (dwell >= 2) { phase = PHASE.Z_UP_PICK; cylinderDown = false; dwell = 0; }
        break;
      case PHASE.Z_UP_PICK:
        zPos = approach(zPos, 0, 15);
        if (zPos <= 0.6) phase = PHASE.MOVE_TO_PLACE;
        break;
      case PHASE.MOVE_TO_PLACE: {
        const c = cellMm(route.place[0], route.place[1]);
        xTgt = c.x; yTgt = c.y;
        xPos = approach(xPos, xTgt, 12);
        yPos = approach(yPos, yTgt, 12);
        if (Math.abs(xPos - xTgt) < 0.6 && Math.abs(yPos - yTgt) < 0.6) {
          phase = PHASE.Z_DOWN_PLACE; cylinderDown = true;
        }
        break;
      }
      case PHASE.Z_DOWN_PLACE:
        zPos = approach(zPos, AXIS.Z_STROKE, 15);
        if (zPos >= AXIS.Z_STROKE - 0.6) phase = PHASE.VACUUM_OFF;
        break;
      case PHASE.VACUUM_OFF:
        vacuum = false; held = 0; dwell += 1;
        if (dwell >= 2) { phase = PHASE.Z_UP_PLACE; cylinderDown = false; dwell = 0; }
        break;
      case PHASE.Z_UP_PLACE:
        zPos = approach(zPos, 0, 15);
        if (zPos <= 0.6) phase = PHASE.DONE;
        break;
      case PHASE.DONE:
        completed += 1;
        routeIndex = (routeIndex + 1) % ROUTE.length;
        phase = PHASE.MOVE_TO_PICK;
        break;
      default:
        break;
    }
  }
  publish();
}

resetState();
setInterval(gantryPlcScan, 100);

const vector = {
  getCoil: (addr) => !!coils[addr],
  setCoil: (addr, value) => {
    coils[addr] = !!value;
    const command = MAIN_COMMANDS[addr];
    if (command && value) pending[command] = true;
  },
  getDiscreteInput: () => false,
  getHoldingRegister: (addr) => regs.get(addr) ?? 0,
  setRegister: (addr, value) => {
    if (addr >= REG_MIN && addr <= REG_MAX) externalPosUntil = Date.now() + 2000;
    regs.set(addr, u16(value));
  },
  setRegisterArray: (addr, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((word, i) => {
      const at = addr + i;
      if (at >= REG_MIN && at <= REG_MAX) externalPosUntil = Date.now() + 2000;
      regs.set(at, u16(word));
    });
  },
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1',
  port: PORT,
  debug: false,
  unitId: 1,
});

serverTCP.on('initialized', () => {
  console.log(`✅ [MockGantryPLC] 监听 127.0.0.1:${PORT}（龙门虚拟 PLC 与参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockGantryPLC] socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    res.end(JSON.stringify({
      success: true,
      port: PORT,
      httpPort: HTTP_PORT,
      /** 与 B 档纯从站 :1508 区分：这里是自带教学参考程序的虚拟 PLC */
      role: 'virtual-plc',
      plcScans,
      running, estop, phase, routeIndex, completed,
      pickCell: regs.get(HR.GANTRY_PICK_CELL) ?? 0,
      placeCell: regs.get(HR.GANTRY_PLACE_CELL) ?? 0,
      position: { x: xPos, y: yPos, z: zPos },
      target: { x: xTgt, y: yTgt },
      vacuum, cylinderDown, held,
      externalPosUntil,
      registers: Object.fromEntries(regs),
      coils: Object.fromEntries(coils.map((v, i) => [i, v]).filter(([i]) => i >= 20 && i <= 37)),
    }));
  } else if (url.pathname === '/reset') {
    resetState();
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
});
httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockGantryPLC] 状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
