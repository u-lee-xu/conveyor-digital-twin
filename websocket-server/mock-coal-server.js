/**
 * ================================================
 * mock-coal-server.js — 煤料智能分拣参考程序虚拟PLC (Modbus TCP Slave)
 * ================================================
 * 用途：无硬件环境下端到端验证煤料场景"仿真模式"链路
 *   （前端连接面板 → websocket-server 网关 → 本虚拟 PLC → 状态回读驱动 3D 场景）
 *
 * 地址与 packages/coal-sorting/src/scenes/coal-sorting/constants.ts 一致（线圈 0-26）：
 *   0-2   启动/停止/急停按钮         —— DT 写入（孪生按钮）
 *   3-6   1#~4# 皮带运行             —— 本程序驱动
 *   7-8   上料气缸伸出/缩回          —— DT 写入（孪生反馈）
 *   9     分拣机（气吹排矸）开启      —— 本程序驱动
 *   10-19 入口/运行/出口传感器+堆料   —— DT 写入（孪生模型反馈）
 *   20-21 上料气缸磁性开关           —— DT 写入（孪生反馈）
 *   22-26 皮带运行/故障指示灯        —— 本程序驱动（跟随皮带）
 *
 * 程序逻辑（参考演示流程）：
 *   - 启动(0)上升沿 → 依次启动 1#→4# 皮带（800ms 间隔）→ 开启分拣机 + 指示灯跟随
 *   - 停止(1) → 全部停止，分拣机关闭
 *   - 急停(2) → 立即全停 + 故障灯，复位后故障灯熄灭
 *
 * 运行：node mock-coal-server.js [端口]（默认 1502）
 * 状态：HTTP 状态接口 http://127.0.0.1:5084/status，复位 /reset
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');
const { COAL_ADDRESSES } = require('./mock-addresses');

const PORT = parseInt(process.argv[2] || '1502', 10);
const HTTP_PORT = 5084;
const STARTUP_STEP_MS = 800;

const coils = new Array(64).fill(false);

// 地址表单一来源：mock-addresses.js（与前端 constants.ts 一致，可用 --check 校验）
const A = COAL_ADDRESSES;

const BELT_ORDER = ['BELT1_RUN', 'BELT2_RUN', 'BELT3_RUN', 'BELT4_RUN'];

let mode = 'idle'; // idle | starting | running
let beltStep = 0;   // 已启动皮带数 0..4
let stepDeadline = 0;
let prevStart = false, prevStop = false, prevEStop = false;

function setBeltCount(n) {
  BELT_ORDER.forEach((name, i) => { coils[A[name]] = i < n; });
}

function scan() {
  const now = Date.now();
  const start = coils[A.BUTTON_START];
  const stop = coils[A.BUTTON_STOP];
  const estop = coils[A.BUTTON_ESTOP];

  // 急停
  if (estop && !prevEStop) {
    mode = 'idle';
    beltStep = 0;
    coils.fill(false);
    coils[A.IND_FAULT] = true;
  } else if (!estop && prevEStop) {
    coils[A.IND_FAULT] = false;
  }

  // 启动：依次启带
  if (start && !prevStart && !estop) {
    mode = 'starting';
    beltStep = 0;
    stepDeadline = now;
    coils[A.IND_FAULT] = false;
  }

  // 停止
  if (stop && !prevStop && !estop) {
    mode = 'idle';
    beltStep = 0;
    setBeltCount(0);
    coils[A.SEPARATOR_ON] = false;
  }

  if (mode === 'starting' && now >= stepDeadline) {
    beltStep++;
    setBeltCount(beltStep);
    stepDeadline = now + STARTUP_STEP_MS;
    if (beltStep >= 4) {
      mode = 'running';
      coils[A.SEPARATOR_ON] = true;
    }
  }

  // 指示灯跟随皮带运行
  for (let i = 0; i < 4; i++) {
    coils[A.IND_BELT1_RUN + i] = coils[A.BELT1_RUN + i];
  }

  prevStart = start;
  prevStop = stop;
  prevEStop = estop;
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
  console.log(`✅ [MockCoalPLC] 监听 127.0.0.1:${PORT}（煤料参考程序已就绪）`);
});
serverTCP.on('socketError', (err) => {
  console.error('[MockCoalPLC] socket错误:', err.message);
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
    res.end(JSON.stringify({ success: true, program: { mode }, coils: status }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    mode = 'idle';
    beltStep = 0;
    prevStart = prevStop = prevEStop = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockCoalPLC] 状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
