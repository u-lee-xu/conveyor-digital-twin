/**
 * ================================================
 * mock-dispensing-server.js — 自动配药参考程序虚拟PLC (Modbus TCP Slave)
 * ================================================
 * 用途：无/未接 PLC 环境下端到端验证自动配药场景"仿真模式"链路
 *   （前端连接面板 → websocket-server 网关 → 本虚拟 PLC → 输出回读驱动 3D）
 *
 * 地址与 packages/auto-dispensing/src/scenes/auto-dispensing/constants.ts 一致（线圈 0-45）：
 *   0-4   启动/停止/复位/急停/取药确认 —— DT 写入（孪生按钮）
 *   5-6   手动/自动 两位选择开关        —— DT 写入（两档互锁）
 *   10-16 限位/空仓/取药仓有药          —— DT 写入（生模型反馈）
 *   20-29 送药缸×4 前后 + 翻转缸双位磁性开关 —— DT 写入（生反馈）
 *   30-31 电机正/反转                   —— 本程序驱动
 *   32-36 送药缸 A/B/C/D、翻转缸动作线圈 —— 本程序驱动
 *   38-40 灯塔 绿/黄/红                 —— 本程序驱动
 *   41-45 双电控专用缩回 / 回位线圈     —— 本程序不使用（单电控参考程序），
 *                                          由外部 PLC 程序 / 仿真面板置位，急停时一并清掉
 *   HR120/HR121 = 32 位 DINT 位置寄存器 ENCODER_PULSES（低字在前）—— DT 写入，唯一真值
 *
 * 位置闭环：孪生按滑块位移增减一个 32 位 DINT → 网关用 FC10 一次写 HR120/HR121
 *   → 本程序读寄存器得到 curPos → 输出电机正/反转 → 孪生滑块移动 → 数值继续增减。
 *   回到原点传感器时寄存器归零（Z 相）。不再使用 8 位线圈镜像，也不绑定 X0/X1；
 *   物理 A/B 相高速计数、C0 当前值映射由真实 PLC 程序负责。
 *   若 1.5s 内没有 DT 反馈（单独运行虚拟PLC、未连前端），自动退回内部积分以便独立演示。
 *
 * 程序逻辑（参考演示流程，固定配方默认 A2/B1/C1/D1，HTTP /preset 可改）：
 *   - 启动(0)上升沿 → 按配方逐仓（移动→伸缸→缩缸×份数）→ 终点翻转倒药 → 回起点 → 黄灯等取药
 *   - 取药确认(4)上升沿 → 下一轮
 *   - 停止(1)暂停；急停(3)→全停+红灯，松开复位解除；复位(2)→回起源+清状态
 *
 * 运行：node mock-dispensing-server.js [端口]（默认 1505）
 * 状态：http://127.0.0.1:5085/status | 配方：/preset?A=2&B=1&C=1&D=1 | 复位：/reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { DISPENSING_ADDRESSES, DISPENSING_REGISTERS, ENCODER_SCALE } = require('./mock-addresses');
const { splitDint32, joinDint32, toUnsigned16 } = require('./dint32');

const PORT = parseInt(process.argv[2] || '1505', 10);
const HTTP_PORT = 5085;
const CYL_HOLD_MS = 900;      // 送药缸伸出保持
const CYL_OFF_MS = 400;       // 送药缸缩回保持
const TILT_HOLD_MS = 1200;    // 翻转保持
const POS_TOL = ENCODER_SCALE.POSITION_TOL_PULSES; // 到位容差（脉冲，按 40mm 位移折算）

const coils = new Array(64).fill(false);
const A = DISPENSING_ADDRESSES;
const R = DISPENSING_REGISTERS;

// 编码器 1024 脉冲/转 × 丝杆导程 20mm/转 = 51200 脉冲/m（与前端 PULSES_PER_M 同源）
const PULSES_PER_M = ENCODER_SCALE.PULSES_PER_M;
const MAGA_PULSE = Math.round(0.55 * PULSES_PER_M);
const MAGB_PULSE = Math.round(0.95 * PULSES_PER_M);
const MAGC_PULSE = Math.round(1.35 * PULSES_PER_M);
const MAGD_PULSE = Math.round(1.75 * PULSES_PER_M);
const END_PULSE = Math.round(ENCODER_SCALE.SLIDER_MAX_M * PULSES_PER_M);
const START_PULSE = ENCODER_SCALE.START_PULSE;

let recipe = { A: 2, B: 1, C: 1, D: 1 };
let mode = 'idle';            // idle | running | stopped
let curPos = START_PULSE;     // 当前位置（脉冲，从编码器反馈积分）
let step = 'toA';             // toA | doseA | toB | doseB | toC | doseC | toD | doseD | toEnd | tilt | back | waitConfirm
let stepDeadline = 0;
let remain = 0;               // 当前仓剩余份数
let cyc = 0;                  // 轮次
let prevStart = false, prevStop = false, prevReset = false, prevEStop = false, prevConfirm = false;

// 编码器反馈闭环：1.5s 内有「孪生写入编码器」活动就认为 DT 在线，位置一律以寄存器为准。
// 这里用写入活动而非数值变化判定：孪生停在药仓配药时寄存器会连续数秒不变，
// 若按变化判定会误判离线、回退内部积分，导致位置漂移。
let lastEncoderWriteAt = 0;
let encoderFromDT = false;
const ENCODER_FEEDBACK_TIMEOUT = 1500;

function markEncoderFeedback() {
  lastEncoderWriteAt = Date.now();
  // 立即刷新在线标志，让 /status 不必等下一个 100ms 扫描周期才反映 DT 已接入
  encoderFromDT = true;
}

function syncEncoderFeedback() {
  encoderFromDT = lastEncoderWriteAt > 0 && Date.now() - lastEncoderWriteAt < ENCODER_FEEDBACK_TIMEOUT;
  if (encoderFromDT) {
    // curPos 是 X×PULSES_PER_M；寄存器是「距原点的脉冲」，故要加上原点绝对脉冲
    curPos = START_PULSE + readEncoderReg();
  }
}

/**
 * 32 位 DINT 位置寄存器：HR120 低 16 位 / HR121 高 16 位（低字在前）。
 * 这是位置的唯一真值；线圈表里不再有任何编码器位，也不绑定物理 X0/X1。
 */
let encoderWords = [0, 0];

/** 读位置寄存器（脉冲，原点=0）：由两个字合并成有符号 32 位 DINT */
function readEncoderReg() {
  return joinDint32(encoderWords[0], encoderWords[1]);
}

/** 独立运行（无孪生）时按 curPos 自积分，也写回同一份 DINT 真值 */
function writeEncoderReg(pulses) {
  encoderWords = splitDint32(pulses);
}

/** FC16 一次写两个字：原子提交，PLC 不会读到只更新了一半的 DINT */
function writeEncoderWords(words) {
  encoderWords = [toUnsigned16(words[0]), toUnsigned16(words[1])];
  markEncoderFeedback();
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
  coils[A.CYL_SEND_C] = false; coils[A.CYL_SEND_D] = false;
  coils[A.CYL_TILT] = false;
  // 双电控缩回线圈也要一起清：残留的 ON 脉冲在 Twin 侧会被读成新的上升沿
  coils[A.CYL_SEND_A_RETRACT] = false; coils[A.CYL_SEND_B_RETRACT] = false;
  coils[A.CYL_SEND_C_RETRACT] = false; coils[A.CYL_SEND_D_RETRACT] = false;
  coils[A.CYL_TILT_RETRACT] = false;
}
function moveToward(target) {
  const d = target - curPos;
  if (Math.abs(d) <= POS_TOL) { motorOff(); return true; }
  if (d > 0) motorFwd(); else motorRev();
  // 有孪生反馈时位置由 DINT 寄存器决定；仅独立运行（无 DT）才按共享演示速度自积分
  if (!encoderFromDT) {
    curPos += (d > 0 ? 1 : -1) * Math.round(ENCODER_SCALE.SLIDER_SPEED * PULSES_PER_M * 0.1);
    writeEncoderReg(curPos - START_PULSE);
  }
  return false;
}

function scan() {
  const now = Date.now();
  syncEncoderFeedback();
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
      if (remain <= 0) { step = 'toD'; remain = recipe.D; break; }
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
    case 'toD':
      if (moveToward(MAGD_PULSE)) { step = 'doseD'; remain = recipe.D; }
      break;
    case 'doseD': {
      if (remain <= 0) { step = 'toEnd'; break; }
      if (!coils[A.CYL_SEND_D] && now >= stepDeadline) {
        coils[A.CYL_SEND_D] = true;
        stepDeadline = now + CYL_HOLD_MS;
      } else if (coils[A.CYL_SEND_D] && now >= stepDeadline) {
        coils[A.CYL_SEND_D] = false;
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
  /** FC03 读 HR120/HR121：逐字返回 32 位 DINT 的低/高 16 位 */
  getHoldingRegister: (addr) => {
    const i = addr - R.ENCODER_PULSES;
    return (i === 0 || i === 1) ? encoderWords[i] : 0;
  },
  /** FC06 写单个字（兼容外部单点写入） */
  setRegister: (addr, value) => {
    const i = addr - R.ENCODER_PULSES;
    if (i === 0 || i === 1) {
      encoderWords[i] = toUnsigned16(value);
      markEncoderFeedback();
    }
  },
  /** FC16 网关批量写：两个字一次原子提交，避免逐字写入产生撕裂值 */
  setRegisterArray: (addr, words) => {
    if (addr === R.ENCODER_PULSES && Array.isArray(words) && words.length >= 2) {
      writeEncoderWords(words);
    }
  },
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
    res.end(JSON.stringify({
      success: true,
      program: {
        mode, step, remain, cyc,
        encoder: readEncoderReg(),
        position: curPos,                       // X×100，用于核对寄存器闭环
        feedback: encoderFromDT ? 'twin' : 'internal',
      },
      register: {
        addr: R.ENCODER_PULSES, name: 'ENCODER_PULSES', value: readEncoderReg(),
        type: 'dint32', words: [...encoderWords],  // HR120 低字 / HR121 高字
        source: encoderFromDT ? 'twin' : 'internal',
        feedbackAgeMs: lastEncoderWriteAt ? Date.now() - lastEncoderWriteAt : null,
      },
      coils: status,
    }));
  } else if (url.pathname === '/preset') {
    const a = parseInt(url.searchParams.get('A') || '', 10);
    const b = parseInt(url.searchParams.get('B') || '', 10);
    const c = parseInt(url.searchParams.get('C') || '', 10);
    const d = parseInt(url.searchParams.get('D') || '', 10);
    recipe = {
      A: Number.isInteger(a) && a >= 0 && a <= 9 ? a : recipe.A,
      B: Number.isInteger(b) && b >= 0 && b <= 9 ? b : recipe.B,
      C: Number.isInteger(c) && c >= 0 && c <= 9 ? c : recipe.C,
      D: Number.isInteger(d) && d >= 0 && d <= 9 ? d : recipe.D,
    };
    res.end(JSON.stringify({ success: true, recipe }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    mode = 'idle'; step = 'toA'; remain = 0; cyc = 0;
    curPos = START_PULSE;
    lastEncoderWriteAt = 0; encoderFromDT = false;
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