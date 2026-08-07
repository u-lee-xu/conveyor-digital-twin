/**
 * ================================================
 * mock-robot-server.js — 气动机械手参考程序虚拟PLC (Modbus TCP Slave)
 * ================================================
 * 用途：无硬件环境下端到端验证"评分系统"（useRobotScoring）。
 * 本服务器模拟"学生已正确实现的PLC程序"，完整实现 6 条控制要求：
 *   ① 原点（水平缩回+升降升起+夹爪张开）→ 蓝色原点灯
 *   ② 启动 → 下降取料 → 夹紧 → 升起
 *   ③ 前进 → 下降放料
 *   ④ 张开 → 升起 → 缩回回位
 *   ⑤ 运行=绿灯 / 加工=黄灯 / 急停=红灯
 *   ⑥ 停止完成当前动作后停；急停后需复位再启动
 *
 * 变量地址（与 websocket-server/server.js PNEUMATIC_MODBUS_VARS 一致）：
 *   0-2  按钮(启动/急停/停止)   —— DT 写入
 *   3-8  磁性开关               —— DT 写入（模型反馈）
 *   10-15 电磁阀线圈            —— 本程序驱动
 *   16-19 指示灯                —— 本程序驱动
 *
 * 运行：node mock-robot-server.js [端口] （默认 1502）
 * 调试：HTTP 状态接口 http://127.0.0.1:5082/status
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');

const PORT = parseInt(process.argv[2] || '1502', 10);
const HTTP_PORT = 5082;

const coils = new Array(64).fill(false);

const A = {
  BUTTON_START: 0,
  BUTTON_ESTOP: 1,
  BUTTON_STOP: 2,
  MAG_FORWARD_REAR: 3,
  MAG_FORWARD_FRONT: 4,
  MAG_LIFT_REAR: 5,
  MAG_LIFT_FRONT: 6,
  MAG_CLAMP_OPEN: 7,
  MAG_CLAMP_CLOSE: 8,
  SOLENOID_FORWARD_RETRACT: 10,
  SOLENOID_FORWARD_EXTEND: 11,
  SOLENOID_LIFT_RETRACT: 12,
  SOLENOID_LIFT_EXTEND: 13,
  SOLENOID_CLAMP_OPEN: 14,
  SOLENOID_CLAMP_CLOSE: 15,
  INDICATOR_ORIGIN: 16,
  INDICATOR_WORKING: 17,
  INDICATOR_PROCESSING: 18,
  INDICATOR_ALARM: 19,
};

// 上电初始状态：机械手位于原点（磁性开关反馈与模型一致）
coils[A.MAG_FORWARD_REAR] = true;
coils[A.MAG_LIFT_REAR] = true;
coils[A.MAG_CLAMP_OPEN] = true;

// 程序状态
let running = false;      // 运行中（循环取料-搬运-放料-回位）
let estop = false;        // 急停激活
let phase = 'DONE';       // 当前动作步
let prevStart = false;
let prevStop = false;
let prevEstop = false;

const sols = {
  FORWARD_RETRACT: A.SOLENOID_FORWARD_RETRACT,
  FORWARD_EXTEND: A.SOLENOID_FORWARD_EXTEND,
  LIFT_RETRACT: A.SOLENOID_LIFT_RETRACT,
  LIFT_EXTEND: A.SOLENOID_LIFT_EXTEND,
  CLAMP_OPEN: A.SOLENOID_CLAMP_OPEN,
  CLAMP_CLOSE: A.SOLENOID_CLAMP_CLOSE,
};

function setSolenoid(key, on) {
  for (const k of Object.keys(sols)) {
    if (k === key) coils[sols[k]] = on;
    else coils[sols[k]] = false;
  }
}
function allSolenoidsOff() { setSolenoid('FORWARD_RETRACT', false); }

function atOrigin() {
  return !!coils[A.MAG_FORWARD_REAR] && !!coils[A.MAG_LIFT_REAR] && !!coils[A.MAG_CLAMP_OPEN];
}

function startCycle() {
  running = true;
  phase = 'LIFT_DOWN';
  setSolenoid('LIFT_EXTEND', true); // ② 启动 → 下降取料
}

/**
 * PLC 扫描循环（每 50ms 一次）：
 *  - 按钮边沿检测（DT 以 800ms 脉冲写入）
 *  - 急停优先：报警灯亮、输出全断；复位（再按启动）后报警灭并重新启动
 *  - 运行状态机：每个动作等待对应磁性开关到位后切换（如同真实程序）
 */
function scan() {
  const startBtn = !!coils[A.BUTTON_START];
  const stopBtn = !!coils[A.BUTTON_STOP];
  const estopBtn = !!coils[A.BUTTON_ESTOP];
  const startEdge = startBtn && !prevStart;
  const stopEdge = stopBtn && !prevStop;
  const estopEdge = estopBtn && !prevEstop;
  prevStart = startBtn;
  prevStop = stopBtn;
  prevEstop = estopBtn;

  // 急停处理（⑥）
  if (estopEdge) estop = true;
  if (estop) {
    running = false;
    allSolenoidsOff();
    coils[A.INDICATOR_WORKING] = false;
    coils[A.INDICATOR_PROCESSING] = false;
    coils[A.INDICATOR_ORIGIN] = false;
    coils[A.INDICATOR_ALARM] = true;   // ⑤ 急停红灯
    if (startEdge) {
      // 急停复位后重新启动：报警灭，重新开始取料循环
      estop = false;
      startCycle();
    }
    return;
  }

  // 正常运行（报警灯灭）
  coils[A.INDICATOR_ALARM] = false;

  if (!running) {
    if (startEdge) {
      startCycle();                    // ② 启动
    } else {
      allSolenoidsOff();
      coils[A.INDICATOR_WORKING] = false;
      coils[A.INDICATOR_PROCESSING] = false;
      coils[A.INDICATOR_ORIGIN] = atOrigin();   // ① 原点蓝色灯
    }
    return;
  }

  // 运行中：绿/黄灯亮（⑤）
  coils[A.INDICATOR_WORKING] = true;
  coils[A.INDICATOR_PROCESSING] = true;
  coils[A.INDICATOR_ORIGIN] = false;

  switch (phase) {
    case 'LIFT_DOWN':          // ② 下降取料
      if (coils[A.MAG_LIFT_FRONT]) {
        phase = 'CLAMP';
        setSolenoid('CLAMP_CLOSE', true);     // 夹紧
      }
      break;
    case 'CLAMP':
      if (coils[A.MAG_CLAMP_CLOSE]) {
        phase = 'LIFT_UP';
        setSolenoid('LIFT_RETRACT', true);    // 升起
      }
      break;
    case 'LIFT_UP':
      if (coils[A.MAG_LIFT_REAR]) {
        phase = 'FORWARD';
        setSolenoid('FORWARD_EXTEND', true);  // ③ 前进
      }
      break;
    case 'FORWARD':
      if (coils[A.MAG_FORWARD_FRONT]) {
        phase = 'LIFT_DOWN2';
        setSolenoid('LIFT_EXTEND', true);     // ③ 放料下降
      }
      break;
    case 'LIFT_DOWN2':
      if (coils[A.MAG_LIFT_FRONT]) {
        phase = 'RELEASE';
        setSolenoid('CLAMP_OPEN', true);      // ④ 张开放料
      }
      break;
    case 'RELEASE':
      if (coils[A.MAG_CLAMP_OPEN]) {
        phase = 'LIFT_UP2';
        setSolenoid('LIFT_RETRACT', true);    // ④ 升起
      }
      break;
    case 'LIFT_UP2':
      if (coils[A.MAG_LIFT_REAR]) {
        phase = 'BACK';
        setSolenoid('FORWARD_RETRACT', true); // ④ 缩回回位
      }
      break;
    case 'BACK':
      if (coils[A.MAG_FORWARD_REAR]) {
        // 完成当前动作后停止（⑥）
        running = false;
        phase = 'DONE';
        allSolenoidsOff();
      }
      break;
    default:
      break;
  }
}

setInterval(scan, 50);

const vector = {
  getCoil: (addr) => !!coils[addr],
  setCoil: (addr, value) => {
    coils[addr] = !!value;
  },
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
  console.log(`✅ [MockRobotPLC] 监听 127.0.0.1:${PORT}（参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockRobotPLC] socket错误:', err.message);
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
    res.end(JSON.stringify({
      success: true,
      program: { running, estop, phase },
      coils: status,
    }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    coils[A.MAG_FORWARD_REAR] = true;
    coils[A.MAG_LIFT_REAR] = true;
    coils[A.MAG_CLAMP_OPEN] = true;
    running = false;
    estop = false;
    phase = 'DONE';
    prevStart = prevStop = prevEstop = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.end(JSON.stringify({ success: false, error: '未知路径' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockRobotPLC] HTTP状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
