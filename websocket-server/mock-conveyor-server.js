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
 * 运行：node mock-conveyor-server.js [端口] （默认 1503）
 * 调试：HTTP 状态接口 http://127.0.0.1:5083/status
 */
const ModbusRTU = require('modbus-serial');
const http = require('http');

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
    res.end(JSON.stringify({ success: true, program: { mode, cycle, startsSinceReset }, coils: status }));
  } else if (url.pathname === '/reset') {
    coils.fill(false);
    mode = 'idle';
    cycle = 'black';
    startsSinceReset = 0;
    prevStart = prevReset = false;
    res.end(JSON.stringify({ success: true }));
  } else {
    res.end(JSON.stringify({ success: false, error: '未知路径' }));
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [MockConveyorPLC] HTTP状态接口 http://127.0.0.1:${HTTP_PORT}/status`);
});
