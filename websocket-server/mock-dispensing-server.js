/**
 * ================================================
 * mock-dispensing-server.js — 自动配药参考程序虚拟PLC (Modbus TCP Slave)
 * ================================================
 * 用途：无/未接 PLC 环境下端到端验证自动配药场景"仿真模式"链路
 *   （前端连接面板 → websocket-server 网关 → 本虚拟 PLC → 输出回读驱动 3D）
 *
 * 地址与 packages/auto-dispensing/src/scenes/auto-dispensing/constants.ts 一致（线圈 0-47）：
 *   0-4   启动/停止/复位/急停/取药确认 —— DT 写入（孪生按钮）
 *   10-15 限位/空仓/取药仓有药          —— DT 写入（孪生模型反馈）
 *   20-27 送药缸×3 前后 + 翻转缸双位磁性开关 —— DT 写入（孪生反馈）
 *   30-31 电机正/反转                   —— 本程序驱动
 *   32-35 送药缸 A/B/C、翻转缸          —— 本程序驱动
 *   36-38 灯塔 绿/黄/红                 —— 本程序驱动
 *   40-47 编码器位置（8 位二进制，0.01m=1 脉冲）—— DT 写入（孪生编码器反馈）
 *
 * 程序逻辑（参考演示流程，固定配方默认 A2/B1/C1，HTTP /preset 可改）：
 *   - 启动(0)上升沿 → 按配方逐仓（移动→伸缸→缩缸×份数）→ 终点翻转倒药 → 回起点 → 黄灯等取药
 *   - 取药确认(4)上升沿 → 下一轮
 *   - 停止(1)暂停；急停(3)→全停+红灯，松开复位解除；复位(2)→回起源+清状态
 *
 * 运行：node mock-dispensing-server.js [端口]（默认 1505）
 * 状态：http://127.0.0.1:5085/status | 配方：/preset?A=2&B=1&C=1 | 复位：/reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { DISPENSING_ADDRESSES } = require('./mock-addresses');

const PORT = parseInt(process.argv[2] || '1505', 10);
const HTTP_PORT = 5085;
const CYL_HOLD_MS = 900;      // 送药缸伸出保持
const CYL_OFF_MS = 400;       // 送药缸缩回保持
const TILT_HOLD_MS = 1200;    // 翻转保持
const POS_TOL = 4;            // 到位容差（脉冲）

const coils = new Array(64).fill(false);
const A = DISPENSING_ADDRESSES;

// 编码器脉冲换算：0.01m = 1 脉冲（与前端 ENCODER_BIT 约定一致）
const PULSES_PER_M = 100;
const MAGA_PULSE = Math.round(0.68 * PULSES_PER_M);
const MAGB_PULSE = Math.round(1.10 * PULSES_PER_M);
const MAGC_PULSE = Math.round(1.52 * PULSES_PER_M);
const END_PULSE = Math.round(1.95 * PULSES_PER_M);
const START_PULSE = Math.round(0.25 * PULSES_PER_M);

let recipe = { A: 2, B: 1, C: 1 };
let mode = 'idle';            // idle | running | stopped
let curPos = START_PULSE;     // 当前位置（脉冲，从编码器反馈积分）
let step = 'toA';             // toA | doseA | toB | doseB | toC | doseC | toEnd | tilt | back | waitConfirm
let stepDeadline = 0;
let remain = 0;               // 当前仓剩余份数
let cyc = 0;                  // 轮次
let prevStart = false, prevStop = false, prevReset = false, prevEStop = false, prevConfirm = false;

function readEncoder() {
  let v = 0;
  for (let i = 0; i < 8; i++) if (coils[A['ENCODER_BIT' + i]]) v |= (1 << i);
  return v;
}

function setLamps(green, yellow, red) {
  coils[A.LAMP_GREEN] = green;
  coils[A.LAMP_YELLOW] = yellow;
  coils[A.LAMP_RED] = red;
}

function motorOff() { coils[A.MOTOR_FWD] = false; coils[A.MOTOR_REV] = false; }
function motorFwd() { coils[A.MOTOR_FWD] = true; coils[A.MOTOR_REV] = false; }
function motorRev() { coils[A.MOTOR_REV] = true; coils[A.MOTOR_FWD] = false; }
function cyOff() {
  coils[A.CYL_SEND_A] = false; coils[A.CYL_SEND_B] = false;
  coils[A.CYL_SEND_C] = false; coils[A.CYL_TILT] = false;
}
function moveToward(target) {
  const d = target - curPos;
  if (Math.abs(d) <= POS_TOL) { motorOff(); return true; }
  if (d > 0) motorFwd(); else motorRev();
  // 虚拟 PLC 以 0.32 m/s 积分位置
  curPos += (d > 0 ? 1 : -1) * Math.round(0.32 * PULSES_PER_M * 0.1);
  return false;
}

function scan() {
  const now = Date.now();
  const start = coils[A.BUTTON_START];
  const stop = coils[A.BUTTON_STOP];
  const reset = coils[A.BUTTON_RESET];
  const estop = coils[A.BUTTON_ESTOP];
  const confirm = coils[A.BUTTON_CONFIRM];

  // 急停：全停 + 红灯；松开后红灯灭（需复位命令进入 idle）
  if (estop && !prevEStop) {
    mode = 'stopped';
    motorOff(); cyOff(); setLamps(false, false, true);
    step = 'toA'; remain = 0;
  } else if (!estop && prevEStop) {
    setLamps(false, false, false);
    if (mode === 'stopped') mode = 'idle';
  }
  if (mode === 'stopped') {
    prevStart = start; prevStop = stop; prevReset = reset; prevEStop = estop; prevConfirm = confirm;
    return;
  }

  // 启动：锁存配方 → 开始第一仓
  if (start && !prevStart) {
    mode = 'running';
    step = 'toA'; remain = recipe.A;
    cyc = 0;
    setLamps(true, false, false);
  }
  // 停止：暂停（输出清，位置保持）
  if (stop && !prevStop && mode === 'running') {
    mode = 'stopped';
    motorOff(); cyOff(); setLamps(false, true, false);
  } else if (mode === 'stopped' && stop && !prevStop) {
    mode = 'idle';
    setLamps(false, false, false);
  }
  // 复位：回起点清状态
  if (reset && !prevReset) {
    mode = 'idle';
    motorOff(); cyOff(); remain = 0; step = 'toA';
    setLamps(false, false, false);
  }

  if (mode !== 'running') {
    prevStart = start; prevStop = stop; prevReset = reset; prevEStop = estop; prevConfirm = confirm;
    return;
  }

  // ---- 运行流程 ----
  switch (step) {
    case 'toA':
      if (moveToward(MAGA_PULSE)) { step = 'doseA'; remain = recipe.A; }
      break;
    case 'doseA': {
      if (remain <= 0) { step = 'toB'; remain = recipe.B; break; }
      if (!coils[A.CYL_SEND_A] && now >= stepDeadline) {
        coils[A.CYL_SEND_A] = true;
        stepDeadline = now + CYL_HOLD_MS;
      } else if (coils[A.CYL_SEND_A] && now >= stepDeadline) {
        coils[A.CYL_SEND_A] = false;
        stepDeadline = now + CYL_OFF_MS;
        remain--;
      }
      break;
    }
    case 'toB':
      if (moveToward(MAGB_PULSE)) { step = 'doseB'; remain = recipe.B; }
      break;
    case 'doseB': {
      if (remain <= 0) { step = 'toC'; remain = recipe.C; break; }
      if (!coils[A.CYL_SEND_B] && now >= stepDeadline) {
        coils[A.CYL_SEND_B] = true;
        stepDeadline = now + CYL_HOLD_MS;
      } else if (coils[A.CYL_SEND_B] && now >= stepDeadline) {
        coils[A.CYL_SEND_B] = false;
        stepDeadline = now + CYL_OFF_MS;
        remain--;
      }
      break;
    }
    case 'toC':
      if (moveToward(MAGC_PULSE)) { step = 'doseC'; remain = recipe.C; }
      break;
    case 'doseC': {
      if (remain <= 0) { step = 'toEnd'; break; }
      if (!coils[A.CYL_SEND_C] && now >= stepDeadline) {
        coils[A.CYL_SEND_C] = true;
        stepDeadline = now + CYL_HOLD_MS;
      } else if (coils[A.CYL_SEND_C] && now >= stepDeadline) {
        coils[A.CYL_SEND_C] = false;
        stepDeadline = now + CYL_OFF_MS;
        remain--;
      }
      break;
    }
    case 'toEnd':
      if (moveToward(END_PULSE)) { step = 'tilt'; }
      break;
    case 'tilt':
      if (!coils[A.CYL_TILT] && now >= stepDeadline) {
        coils[A.CYL_TILT] = true;
        stepDeadline = now + TILT_HOLD_MS;
      } else if (coils[A.CYL_TILT] && now >= stepDeadline) {
        coils[A.CYL_TILT] = false;
        stepDeadline = now + 200;
        setLamps(false, true, false); // 请取药
        step = 'back';
      }
      break;
    case 'back':
      if (moveToward(START_PULSE)) {
        motorOff();
        step = 'waitConfirm';
      }
      break;
    case 'waitConfirm':
      if (confirm && !prevConfirm) {
        remain = 0;
        cyc++;
        setLamps(true, false, false);
        step = 'toA'; remain = recipe.A;
      }
      break;
  }

  prevStart = start; prevStop = stop; prevReset = reset; prevEStop = estop; prevConfirm = confirm;
}

setInterval(scan, 100);

const vector = {
  getCoil: (addr) => !!coils[addr],
  setCoil: (addr, value) => { coils[addr] = !!value; },
  getDiscreteInput: () => false,
  getHoldingRegister: () => 0,
  setRegister: () => {},
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1',
  port: PORT,
  debug: false,
  unitId: 1,
});

serverTCP.on('initialized', () => {
  console.log(`✅ [MockDispensingPLC] 监听 127.0.0.1:${PORT}（自动配药参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockDispensingPLC] socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    const status = {};
    for (const [name, addr] of Object.entries(A)) status[name] = { addr, value: !!coils[addr] };
    res.end(JSON.stringify({ success: true, program: { mode, step, remain, cyc, encoder: readEncoder() }, coils: status }));
  } else if (url.pathname === '/preset') {
    const a = parseInt(url.searchParams.get('A') || '', 10);
    const b = parseInt(url.searchParams.get('B') || '', 10);
    const c = parseInt(url.searchParams.get('C') || '', 10);
    recipe = {
      A: Number.isInteger(a) && a >= 0 && a <= 9 ? a : recipe.A,
      B: Number.isInteger(b) && b >= 0 && b <= 9 ? b : recipe.B,
      C: Number.isInteger(c) && c >= 0 && c <= 9 ? c : recipe.C,
    };
    res.end(JSON.stringify({ success: true, recipe }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    mode = 'idle'; step = 'toA'; remain = 0; cyc = 0;
    curPos = START_PULSE;
    prevStart = prevStop = prevReset = prevEStop = prevConfirm = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockDispensingPLC] 状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});