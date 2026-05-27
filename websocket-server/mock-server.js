const ModbusRTU = require('modbus-serial');
const http = require('http');

const coils = new Array(200).fill(false);

const ADDR = {
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
};

let autoResponseEnabled = true;
let conveyorTimer = null;
let feedExtendTimer = null;
let feedRetractTimer = null;
let sort1ExtendTimer = null;
let sort1RetractTimer = null;
let sort2ExtendTimer = null;
let sort2RetractTimer = null;

function clearAllTimers() {
  [conveyorTimer, feedExtendTimer, feedRetractTimer,
   sort1ExtendTimer, sort1RetractTimer, sort2ExtendTimer, sort2RetractTimer
  ].forEach(t => { if (t) clearTimeout(t); });
  conveyorTimer = feedExtendTimer = feedRetractTimer = null;
  sort1ExtendTimer = sort1RetractTimer = sort2ExtendTimer = sort2RetractTimer = null;
}

function simulateFeedCylinder() {
  coils[ADDR.FEED_CTRL] = true;
  coils[ADDR.FEED_IN] = false;
  feedExtendTimer = setTimeout(() => {
    coils[ADDR.FEED_OUT] = true;
    coils[ADDR.FEED_IN] = false;
    feedRetractTimer = setTimeout(() => {
      coils[ADDR.FEED_CTRL] = false;
      coils[ADDR.FEED_OUT] = false;
      coils[ADDR.FEED_IN] = true;
      coils[ADDR.FEED_SENSOR] = true;
    }, 500);
  }, 500);
}

function simulateSort1Cylinder() {
  coils[ADDR.SORT1_CTRL] = true;
  coils[ADDR.SORT1_IN] = false;
  sort1ExtendTimer = setTimeout(() => {
    coils[ADDR.SORT1_OUT] = true;
    coils[ADDR.SORT1_IN] = false;
    sort1RetractTimer = setTimeout(() => {
      coils[ADDR.SORT1_CTRL] = false;
      coils[ADDR.SORT1_OUT] = false;
      coils[ADDR.SORT1_IN] = true;
    }, 500);
  }, 500);
}

function simulateSort2Cylinder() {
  coils[ADDR.SORT2_CTRL] = true;
  coils[ADDR.SORT2_IN] = false;
  sort2ExtendTimer = setTimeout(() => {
    coils[ADDR.SORT2_OUT] = true;
    coils[ADDR.SORT2_IN] = false;
    sort2RetractTimer = setTimeout(() => {
      coils[ADDR.SORT2_CTRL] = false;
      coils[ADDR.SORT2_OUT] = false;
      coils[ADDR.SORT2_IN] = true;
    }, 500);
  }, 500);
}

function simulateReset() {
  coils[ADDR.FEED_CTRL] = false;
  coils[ADDR.SORT1_CTRL] = false;
  coils[ADDR.SORT2_CTRL] = false;
  coils[ADDR.FEED_OUT] = false;
  coils[ADDR.SORT1_OUT] = false;
  coils[ADDR.SORT2_OUT] = false;
  coils[ADDR.FEED_IN] = true;
  coils[ADDR.SORT1_IN] = true;
  coils[ADDR.SORT2_IN] = true;
  coils[ADDR.CONVEYOR] = true;
  if (conveyorTimer) clearTimeout(conveyorTimer);
  conveyorTimer = setTimeout(() => {
    coils[ADDR.CONVEYOR] = false;
  }, 5000);
}

function handleAutoResponse(addr, value) {
  if (!autoResponseEnabled) return;

  if (addr === ADDR.START && value) {
    console.log('[MockPLC] 启动信号 → 模拟上料气缸伸出');
    simulateFeedCylinder();
    setTimeout(() => {
      coils[ADDR.CONVEYOR] = true;
      coils[ADDR.COLOR_SENSOR] = true;
    }, 1500);
  }

  if (addr === ADDR.RESET && value) {
    console.log('[MockPLC] 复位信号 → 模拟气缸缩回+传送带清料');
    simulateReset();
  }

  if (addr === ADDR.CONVEYOR && !value) {
    console.log('[MockPLC] 传送带停止');
  }
}

const vector = {
  getCoil: (addr) => {
    return coils[addr] || false;
  },
  setCoil: (addr, value) => {
    console.log(`[MockServer] 写入线圈 地址:${addr} 值:${value}`);
    coils[addr] = value;
    handleAutoResponse(addr, value);
  },
  getDiscreteInput: (addr) => {
    return false;
  },
  getHoldingRegister: (addr) => {
    return 0;
  },
  setRegister: (addr, value) => {
  },
};

const serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: '127.0.0.1',
  port: 502,
  debug: true,
  unitId: 1,
});

serverTCP.on('initialized', () => {
  console.log('✅ Mock ModbusTCP Server listening on 127.0.0.1:502');
  console.log('   自动PLC响应: ' + (autoResponseEnabled ? '开启' : '关闭'));
  console.log('   HTTP状态接口: http://127.0.0.1:5080/status');
  console.log('   HTTP控制接口: http://127.0.0.1:5080/reset');
  console.log('                    http://127.0.0.1:5080/auto?enabled=true|false');
  console.log('                    http://127.0.0.1:5080/coil?addr=0&value=true');
});

serverTCP.on('socketError', (err) => {
  console.error('[MockServer] Socket错误:', err.message);
});

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  switch (url.pathname) {
    case '/status': {
      const status = {};
      for (const [name, addr] of Object.entries(ADDR)) {
        status[name] = { addr, value: coils[addr] };
      }
      res.end(JSON.stringify({ success: true, coils: status, autoResponse: autoResponseEnabled }));
      break;
    }
    case '/reset': {
      coils.fill(false);
      clearAllTimers();
      console.log('[MockServer] 所有线圈已重置');
      res.end(JSON.stringify({ success: true, message: '所有线圈已重置' }));
      break;
    }
    case '/auto': {
      const enabled = url.searchParams.get('enabled') !== 'false';
      autoResponseEnabled = enabled;
      console.log(`[MockServer] 自动PLC响应: ${enabled ? '开启' : '关闭'}`);
      res.end(JSON.stringify({ success: true, autoResponse: enabled }));
      break;
    }
    case '/coil': {
      const addr = parseInt(url.searchParams.get('addr'));
      const val = url.searchParams.get('value') === 'true';
      if (isNaN(addr) || addr < 0 || addr >= 200) {
        res.end(JSON.stringify({ success: false, error: '地址无效' }));
        break;
      }
      coils[addr] = val;
      handleAutoResponse(addr, val);
      res.end(JSON.stringify({ success: true, addr, value: val }));
      break;
    }
    default:
      res.end(JSON.stringify({ success: false, error: '未知路径' }));
  }
});

httpServer.listen(5080, '127.0.0.1', () => {
  console.log('✅ Mock HTTP控制接口 listening on 127.0.0.1:5080');
});
