const WebSocket = require('ws');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { clampDint32, splitDint32, joinDint32, toSigned16, toUnsigned16 } = require('./dint32');
const { verifyInternalRequest } = require('./runtime-role');

// 获取桌面路径，用于输出延迟测试报告
function getDesktopPath() {
  const desktop = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(desktop)) return desktop;
  // 中文系统桌面可能是"桌面"
  const cn = path.join(os.homedir(), '桌面');
  if (fs.existsSync(cn)) return cn;
  return __dirname;
}

const MODBUS_ADDRESSES = {
  START: 0,
  RESET: 1,
  FEED_CYLINDER_VALVE: 100,
  SORTING1_CYLINDER_VALVE: 101,
  SORTING2_CYLINDER_VALVE: 102,
  CONVEYOR: 103,
  SENSOR_FEED: 8,
  SENSOR_COLOR: 9,
  SENSOR_MATERIAL: 10,
  MAGNETIC_FEED_RETRACT: 2,
  MAGNETIC_FEED_EXTEND: 3,
  MAGNETIC_SORTING1_RETRACT: 4,
  MAGNETIC_SORTING1_EXTEND: 5,
  MAGNETIC_SORTING2_RETRACT: 6,
  MAGNETIC_SORTING2_EXTEND: 7,
};

const S7_VARIABLES = {
  START: 'M10.0',
  RESET: 'M10.1',
  FEED_CYLINDER_VALVE: 'M100.0',
  SORTING1_CYLINDER_VALVE: 'M101.0',
  SORTING2_CYLINDER_VALVE: 'M102.0',
  CONVEYOR: 'M103.0',
  SIGNAL_RED: 'M104.0',
  SIGNAL_GREEN: 'M105.0',
  SIGNAL_YELLOW: 'M106.0',
  MAGNETIC_FEED_RETRACT: 'M12.0',
  MAGNETIC_FEED_EXTEND: 'M12.1',
  MAGNETIC_SORTING1_RETRACT: 'M14.0',
  MAGNETIC_SORTING1_EXTEND: 'M14.1',
  MAGNETIC_SORTING2_RETRACT: 'M16.0',
  MAGNETIC_SORTING2_EXTEND: 'M16.1',
  SENSOR_FEED: 'M18.0',
  SENSOR_COLOR: 'M19.0',
  SENSOR_MATERIAL: 'M20.0',
  STOP: 'M21.0',
};

const MITSUBISHI_VARIABLES = {
  // 输入 — 面板按钮 (X0~X2)
  BUTTON_START: 'X0',
  BUTTON_ESTOP: 'X1',
  BUTTON_STOP:  'X2',
  // 输入 — 磁性开关 (X3~X7, X10)
  MAG_FORWARD_REAR:  'X3',
  MAG_FORWARD_FRONT: 'X4',
  MAG_LIFT_REAR:     'X5',
  MAG_LIFT_FRONT:    'X6',
  MAG_CLAMP_OPEN:    'X7',
  MAG_CLAMP_CLOSE:   'X10',
  // 输出 — 电磁阀线圈 (Y0~Y5)
  SOLENOID_FORWARD_RETRACT: 'Y0',
  SOLENOID_FORWARD_EXTEND:  'Y1',
  SOLENOID_LIFT_RETRACT:    'Y2',
  SOLENOID_LIFT_EXTEND:     'Y3',
  SOLENOID_CLAMP_OPEN:      'Y4',
  SOLENOID_CLAMP_CLOSE:     'Y5',
  // 输出 — 指示灯 (Y6~Y7, Y10~Y11)
  INDICATOR_ORIGIN:     'Y6',
  INDICATOR_WORKING:    'Y7',
  INDICATOR_PROCESSING: 'Y10',
  INDICATOR_ALARM:      'Y11',
};

/** 气动机械手 Modbus 变量映射（变量名 → 线圈地址） */
const PNEUMATIC_MODBUS_VARS = {
  BUTTON_START: 0,
  BUTTON_ESTOP: 1,
  BUTTON_STOP:  2,
  MAG_FORWARD_REAR:   3,
  MAG_FORWARD_FRONT:  4,
  MAG_LIFT_REAR:      5,
  MAG_LIFT_FRONT:     6,
  MAG_CLAMP_OPEN:     7,
  MAG_CLAMP_CLOSE:    8,
  SOLENOID_FORWARD_RETRACT: 10,
  SOLENOID_FORWARD_EXTEND:  11,
  SOLENOID_LIFT_RETRACT:    12,
  SOLENOID_LIFT_EXTEND:     13,
  SOLENOID_CLAMP_OPEN:      14,
  SOLENOID_CLAMP_CLOSE:     15,
  INDICATOR_ORIGIN:     16,
  INDICATOR_WORKING:    17,
  INDICATOR_PROCESSING: 18,
  INDICATOR_ALARM:      19,
};

class SimpleModbusTCP {
  constructor() {
    this.client = null;
    this.connected = false;
    this.transactionId = 0;
    this.pendingRequests = new Map();
    this.receiveBuffer = Buffer.alloc(0);
    // 变量名 → 线圈地址 映射（connect 消息下发，缺省气动机械手）
    this.variables = {};
    // 32 位 DINT 数值变量表（connect 消息下发，缺省为空；不与布尔线圈混用）
    this.wordVariables = {};
    // 延迟统计
    this.latencyStats = {
      read: [], // 读延迟
      write: [], // 写延迟
      last10Read: [], // 最近10次读延迟
      last10Write: [] // 最近10次写延迟
    };
    // 日志文件路径（延迟测试用）
    this.latencyLogFile = path.join(getDesktopPath(), 'latency_modbus.log');
  }

  async connect(host, port) {
    return new Promise((resolve, reject) => {
      // 幂等：重复 connect 前释放旧 socket（多客户端共享网关场景）
      if (this.client) {
        try { this.client.destroy(); } catch {}
      }
      this.connected = false;
      this.client = new net.Socket();
      
      this.client.on('connect', () => {
        this.connected = true;
        console.log(`ModbusTCP连接成功: ${host}:${port}`);
        
        this.client.on('data', (data) => {
          this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

          while (this.receiveBuffer.length >= 8) {
            const msgLength = this.receiveBuffer.readUInt16BE(4);
            const totalPacketSize = 6 + msgLength;

            if (this.receiveBuffer.length < totalPacketSize) break;

            const packet = this.receiveBuffer.slice(0, totalPacketSize);
            this.receiveBuffer = this.receiveBuffer.slice(totalPacketSize);

            const respTransactionId = packet.readUInt16BE(0);
            const pendingRequest = this.pendingRequests.get(respTransactionId);

            if (pendingRequest) {
              clearTimeout(pendingRequest.timeout);
              this.pendingRequests.delete(respTransactionId);

              // ===== 测量并记录延迟
              if (pendingRequest.startTime) {
                const latency = Date.now() - pendingRequest.startTime;
                const type = pendingRequest.type || 'unknown';
                if (type === 'read') {
                  this.latencyStats.read.push(latency);
                  this.latencyStats.last10Read.push(latency);
                  if (this.latencyStats.last10Read.length > 10) {
                    this.latencyStats.last10Read.shift();
                  }
                } else if (type === 'write') {
                  this.latencyStats.write.push(latency);
                  this.latencyStats.last10Write.push(latency);
                  if (this.latencyStats.last10Write.length > 10) {
                    this.latencyStats.last10Write.shift();
                  }
                }
                // 每10次打印一次统计
                const total = this.latencyStats.read.length + this.latencyStats.write.length;
                if (total % 50 === 0) {
                  this._printLatencyStats();
                }
              }

              try {
                const functionCode = packet.readUInt8(7);
                if (functionCode === 0x01) {
                  const byteCount = packet.readUInt8(8);
                  const values = [];
                  for (let i = 0; i < byteCount; i++) {
                    const byte = packet.readUInt8(9 + i);
                    for (let j = 0; j < 8; j++) {
                      if (values.length < pendingRequest.length) {
                        values.push(((byte >> j) & 0x01) === 1);
                      }
                    }
                  }
                  pendingRequest.resolve({ success: true, values: values.slice(0, pendingRequest.length) });
                } else if (functionCode === 0x03) {
                  // 读保持寄存器响应：字节数 + N 个大端 16 位字
                  const byteCount = packet.readUInt8(8);
                  const registers = [];
                  for (let i = 0; i + 1 < byteCount && registers.length < pendingRequest.length; i += 2) {
                    registers.push(packet.readUInt16BE(9 + i));
                  }
                  pendingRequest.resolve({ success: true, registers });
                } else if (functionCode === 0x05 || functionCode === 0x06 || functionCode === 0x0F || functionCode === 0x10) {
                  pendingRequest.resolve({ success: true });
                } else if (functionCode >= 0x80) {
                  const errorCode = packet.readUInt8(8);
                  pendingRequest.resolve({ success: false, error: `Modbus错误码: ${errorCode}` });
                } else {
                  pendingRequest.resolve({ success: false, error: `意外的功能码: ${functionCode}` });
                }
              } catch (error) {
                pendingRequest.resolve({ success: false, error: error.message });
              }
            }
          }
        });

        resolve({ success: true });
      });

      this.client.on('error', (error) => {
        console.error('ModbusTCP连接失败:', error);
        this.receiveBuffer = Buffer.alloc(0);
        reject({ success: false, error: error.message });
      });

      this.client.on('close', () => {
        this.receiveBuffer = Buffer.alloc(0);
      });

      this.client.connect(port, host);
    });
  }

  async disconnect() {
    if (this.connected && this.client) {
      return new Promise((resolve) => {
        this.client.end(() => {
          this.connected = false;
          this.client = null;
          console.log('ModbusTCP连接已断开');
          this._printLatencyStats(true); // 断开连接时输出最终汇总报告
          resolve({ success: true });
        });
      });
    }
    // 即使没有连接也打印统计
    this._printLatencyStats();
    return { success: true };
  }

  _printLatencyStats(isFinal = false) {
    const read = this.latencyStats.read;
    const write = this.latencyStats.write;
    if (read.length + write.length === 0) return;

    const calcStats = (arr) => {
      if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
      };
    };

    const readStats = calcStats(read);
    const writeStats = calcStats(write);

    const timestamp = new Date().toISOString();
    const output =
      '\n' +
      '='.repeat(60) + '\n' +
      `[ModbusTCP 通信延迟统计] ${timestamp}\n` +
      `读请求次数: ${read.length}, 平均: ${readStats.avg}ms, 最小: ${readStats.min}ms, 最大: ${readStats.max}ms, P95: ${readStats.p95}ms\n` +
      `写请求次数: ${write.length}, 平均: ${writeStats.avg}ms, 最小: ${writeStats.min}ms, 最大: ${writeStats.max}ms, P95: ${writeStats.p95}ms\n` +
      '='.repeat(60) + '\n';

    // 输出到控制台
    console.log(output);
    // 输出到日志文件
    fs.appendFileSync(this.latencyLogFile, output);

    // 断开连接时输出格式化汇总报告到桌面
    if (isFinal) {
      const now = new Date();
      const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      const reportFile = path.join(__dirname, `延迟测试报告_ModbusTCP_${dateStr}.txt`);
      const report =
        `通信延迟测试报告 - ModbusTCP协议\n` +
        `测试时间: ${now.toLocaleString('zh-CN')}\n` +
        `测试环境: AutoShop仿真\n` +
        `${'='.repeat(50)}\n` +
        `\n` +
        `读操作:\n` +
        `  请求次数: ${read.length}\n` +
        `  平均延迟: ${readStats.avg}ms\n` +
        `  P95延迟:  ${readStats.p95}ms\n` +
        `  最小延迟: ${readStats.min}ms\n` +
        `  最大延迟: ${readStats.max}ms\n` +
        `\n` +
        `写操作:\n` +
        `  请求次数: ${write.length}\n` +
        `  平均延迟: ${writeStats.avg}ms\n` +
        `  P95延迟:  ${writeStats.p95}ms\n` +
        `  最小延迟: ${writeStats.min}ms\n` +
        `  最大延迟: ${writeStats.max}ms\n` +
        `\n` +
        `${'='.repeat(50)}\n` +
        `论文表3填写参考:\n` +
        `  读操作平均延迟: ${readStats.avg}ms\n` +
        `  读操作P95延迟:  ${readStats.p95}ms\n` +
        `  写操作平均延迟: ${writeStats.avg}ms\n` +
        `  写操作P95延迟:  ${writeStats.p95}ms\n` +
        `  最大延迟: ${Math.max(readStats.max, writeStats.max)}ms\n`;
      fs.writeFileSync(reportFile, report, 'utf-8');
      console.log(`\n延迟测试报告已保存到: ${reportFile}`);
    }
  }

  async readCoils(address, length) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise((resolve) => {
      try {
        this.transactionId++;
        const tid = this.transactionId;
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(6, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x01, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(length, 10);

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '读取超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, address, length, type: 'read', startTime: Date.now() });
        this.client.write(buffer);
      } catch (e) { resolve({ success: false, error: e.message }); }
    });
  }

  async writeCoil(address, value) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise((resolve) => {
      try {
        this.transactionId++;
        const tid = this.transactionId;
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(6, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x05, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(value ? 0xFF00 : 0x0000, 10);

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '写入超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, address, value, type: 'write', startTime: Date.now() });
        this.client.write(buffer);
      } catch (e) { resolve({ success: false, error: e.message }); }
    });
  }

  async writeCoils(address, values) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };

    return new Promise((resolve) => {
      try {
        this.transactionId = (this.transactionId + 1) % 65536;
        const tid = this.transactionId;
        const count = values.length;
        const byteCount = Math.ceil(count / 8);
        const buffer = Buffer.alloc(13 + byteCount);
        
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(7 + byteCount, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x0F, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(count, 10);
        buffer.writeUInt8(byteCount, 12);

        for (let i = 0; i < byteCount; i++) {
          let byte = 0;
          for (let j = 0; j < 8; j++) {
            const idx = i * 8 + j;
            if (idx < count && values[idx]) byte |= (1 << j);
          }
          buffer.writeUInt8(byte, 13 + i);
        }

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '批量写入超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, address, length: count, type: 'write', startTime: Date.now() });
        this.client.write(buffer);
      } catch (e) { resolve({ success: false, error: e.message }); }
    });
  }

  /** FC03：读保持寄存器，供 32 位 DINT 变量取低/高字 */
  async readHoldingRegisters(address, length) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    return new Promise((resolve) => {
      try {
        this.transactionId = (this.transactionId + 1) % 65536;
        const tid = this.transactionId;
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(6, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x03, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(length, 10);

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '读保持寄存器超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, address, length, type: 'read', startTime: Date.now() });
        this.client.write(buffer);
      } catch (e) { resolve({ success: false, error: e.message }); }
    });
  }

  /** FC10：一帧写多个保持寄存器，保证 32 位 DINT 的两个字原子更新 */
  async writeRegisters(address, values) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    return new Promise((resolve) => {
      try {
        this.transactionId = (this.transactionId + 1) % 65536;
        const tid = this.transactionId;
        const count = values.length;
        const byteCount = count * 2;
        const buffer = Buffer.alloc(13 + byteCount);
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(7 + byteCount, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x10, 7);
        buffer.writeUInt16BE(address, 8);
        buffer.writeUInt16BE(count, 10);
        buffer.writeUInt8(byteCount, 12);
        for (let i = 0; i < count; i++) {
          buffer.writeUInt16BE(toUnsigned16(values[i]), 13 + i * 2);
        }

        const timeout = setTimeout(() => {
          this.pendingRequests.delete(tid);
          resolve({ success: false, error: '写保持寄存器超时' });
        }, 2000);

        this.pendingRequests.set(tid, { resolve, timeout, address, length: count, type: 'write', startTime: Date.now() });
        this.client.write(buffer);
      } catch (e) { resolve({ success: false, error: e.message }); }
    });
  }

  /** 读 32 位 DINT 数值变量：HR120 低字 + HR121 高字，低字在前 */
  async readWords(varNames) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    try {
      const values = {};
      for (const name of varNames) {
        const spec = (this.wordVariables || {})[name];
        const m = spec && spec.modbus;
        if (!m) return { success: false, error: `未知数值变量: ${name}` };
        const result = await this.readHoldingRegisters(m.address, m.words);
        if (!result.success) return result;
        const low = result.registers[0] || 0;
        const high = result.registers[1] || 0;
        values[name] = spec.type === 'uint16' ? (low & 0xffff) : joinDint32(low, high);
      }
      return { success: true, values };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 写 32 位 DINT 数值变量：FC10 一次写两个字，PLC 不会读到撕裂值 */
  async writeWords(varNames, values) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    try {
      for (let i = 0; i < varNames.length; i++) {
        const name = varNames[i];
        const spec = (this.wordVariables || {})[name];
        const m = spec && spec.modbus;
        if (!m) return { success: false, error: `未知数值变量: ${name}` };
        const words = spec.type === 'uint16'
          ? [Math.max(0, Math.min(0xffff, Math.trunc(Number(values[i]) || 0)))]
          : splitDint32(clampDint32(values[i]));
        const result = await this.writeRegisters(m.address, words);
        if (!result.success) return result;
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 批量读取变量（按 connect 下发的变量名→线圈地址映射） */
  async readVars(varNames) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    try {
      const vars = this.variables || PNEUMATIC_MODBUS_VARS;
      // 一次读取 0~最大地址（缺省 20 个线圈），映射回变量名
      const addrs = Object.values(vars).filter((v) => typeof v === 'number');
      const maxAddr = addrs.length > 0 ? Math.max(...addrs) : 19;
      const result = await this.readCoils(0, maxAddr + 1);
      if (!result.success) return result;
      const values = {};
      for (const name of varNames) {
        const addr = vars[name];
        if (addr === undefined) return { success: false, error: `未知变量名: ${name}` };
        if (addr >= result.values.length) return { success: false, error: `线圈读数不足: ${name}` };
        values[name] = !!result.values[addr];
      }
      return { success: true, values };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 写入单个变量（按名称写线圈） */
  async writeVar(varName, value) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    const vars = this.variables || PNEUMATIC_MODBUS_VARS;
    const addr = vars[varName];
    if (addr === undefined) return { success: false, error: `未知变量名: ${varName}` };
    try {
      const result = await this.writeCoil(addr, !!value);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 批量写入变量（逐个写线圈） */
  async writeVars(varNames, values) {
    if (!this.connected) return { success: false, error: 'Modbus未连接' };
    try {
      const vars = this.variables || PNEUMATIC_MODBUS_VARS;
      for (let i = 0; i < varNames.length; i++) {
        const addr = vars[varNames[i]];
        if (addr === undefined) return { success: false, error: `未知变量名: ${varNames[i]}` };
        await this.writeCoil(addr, !!values[i]);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

class SimpleS7Client {
  constructor() {
    this.nodes7 = null;
    this.connected = false;
    this.variables = {};
    // 32 位 DINT 数值变量表（connect 消息下发；S7 用 MDI 地址原生读写）
    this.wordVariables = {};
    this.connecting = false;
    this.itemsRegistered = false;
    this._opQueue = [];
    this._processing = false;
    this._connCheckInterval = null;
    // S7 延迟统计
    this.latencyStats = {
      read: [],
      write: [],
      last10Read: [],
      last10Write: []
    };
    // 日志文件路径（延迟测试用）
    this.latencyLogFile = path.join(getDesktopPath(), 'latency_s7.log');
  }

  _cleanup() {
    if (this._connCheckInterval) {
      clearInterval(this._connCheckInterval);
      this._connCheckInterval = null;
    }
    if (this.nodes7) {
      try {
        this.nodes7.dropConnection(() => {});
      } catch {}
      this.nodes7 = null;
    }
    this.connected = false;
    this.connecting = false;
    this.itemsRegistered = false;
    this._opQueue = [];
    this._processing = false;
  }

  _enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._opQueue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this._processing) return;
    this._processing = true;
    while (this._opQueue.length > 0) {
      const { fn, resolve, reject } = this._opQueue.shift();
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
    this._processing = false;
  }

  _withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} 超时(${ms}ms)`));
      }, ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  _isNodes7Ready() {
    if (!this.nodes7) return false;
    return this.nodes7.isoConnectionState === 4;
  }

  _printLatencyStats(isFinal = false) {
    const read = this.latencyStats.read;
    const write = this.latencyStats.write;
    if (read.length + write.length === 0) return;

    const calcStats = (arr) => {
      if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
      };
    };

    const readStats = calcStats(read);
    const writeStats = calcStats(write);

    const timestamp = new Date().toISOString();
    const output =
      '\n' +
      '='.repeat(60) + '\n' +
      `[S7 通信延迟统计] ${timestamp}\n` +
      `读请求次数: ${read.length}, 平均: ${readStats.avg}ms, 最小: ${readStats.min}ms, 最大: ${readStats.max}ms, P95: ${readStats.p95}ms\n` +
      `写请求次数: ${write.length}, 平均: ${writeStats.avg}ms, 最小: ${writeStats.min}ms, 最大: ${writeStats.max}ms, P95: ${writeStats.p95}ms\n` +
      '='.repeat(60) + '\n';

    // 输出到控制台
    console.log(output);
    // 输出到日志文件
    fs.appendFileSync(this.latencyLogFile, output);

    // 断开连接时输出格式化汇总报告到桌面
    if (isFinal) {
      const now = new Date();
      const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      const reportFile = path.join(__dirname, `延迟测试报告_S7_${dateStr}.txt`);
      const report =
        `通信延迟测试报告 - S7 Communication协议\n` +
        `测试时间: ${now.toLocaleString('zh-CN')}\n` +
        `测试环境: TIA Portal + PLCSIM + NetToPLCSim\n` +
        `${'='.repeat(50)}\n` +
        `\n` +
        `读操作:\n` +
        `  请求次数: ${read.length}\n` +
        `  平均延迟: ${readStats.avg}ms\n` +
        `  P95延迟:  ${readStats.p95}ms\n` +
        `  最小延迟: ${readStats.min}ms\n` +
        `  最大延迟: ${readStats.max}ms\n` +
        `\n` +
        `写操作:\n` +
        `  请求次数: ${write.length}\n` +
        `  平均延迟: ${writeStats.avg}ms\n` +
        `  P95延迟:  ${writeStats.p95}ms\n` +
        `  最小延迟: ${writeStats.min}ms\n` +
        `  最大延迟: ${writeStats.max}ms\n` +
        `\n` +
        `${'='.repeat(50)}\n` +
        `论文表3填写参考:\n` +
        `  读操作平均延迟: ${readStats.avg}ms\n` +
        `  读操作P95延迟:  ${readStats.p95}ms\n` +
        `  写操作平均延迟: ${writeStats.avg}ms\n` +
        `  写操作P95延迟:  ${writeStats.p95}ms\n` +
        `  最大延迟: ${Math.max(readStats.max, writeStats.max)}ms\n`;
      fs.writeFileSync(reportFile, report, 'utf-8');
      console.log(`\n延迟测试报告已保存到: ${reportFile}`);
    }
  }

  _startConnCheck() {
    if (this._connCheckInterval) clearInterval(this._connCheckInterval);
    this._connCheckInterval = setInterval(() => {
      if (this.connected && !this._isNodes7Ready()) {
        console.log('[S7] 检测到连接丢失 (isoConnectionState=' + (this.nodes7 ? this.nodes7.isoConnectionState : 'null') + ')');
        this.connected = false;
      }
    }, 5000);
  }

  async connect(host, port, rack = 0, slot = 1) {
    if (this.connecting) {
      return { success: false, error: '正在连接中，请稍后' };
    }

    this._cleanup();

    try {
      const nodes7 = require('nodes7');
      this.nodes7 = new nodes7();
      this.connecting = true;

      return new Promise((resolve) => {
        const connectTimeout = setTimeout(() => {
          this.connecting = false;
          this._cleanup();
          resolve({ success: false, error: 'S7连接超时(10秒)' });
        }, 10000);

        this.nodes7.initiateConnection(
          { port: port || 102, host: host, rack: rack, slot: slot },
          (err) => {
            clearTimeout(connectTimeout);
            this.connecting = false;

            if (err) {
              console.error('[S7] 连接失败:', err);
              this._cleanup();
              let errMsg = String(err);
              if (errMsg.includes('ISO didn\'t') || errMsg.includes('ISO did not')) {
                errMsg = 'TCP已连接但ISO握手失败 — 请在博途中启用 PUT/GET 功能（CPU属性 → Protection → Allow PUT/GET）';
              } else if (errMsg.includes('ECONNREFUSED')) {
                errMsg = '连接被拒绝 — 请检查PLC/NetToPLCSim是否已启动，端口是否正确';
              } else if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timed out')) {
                errMsg = '连接超时 — 请检查IP地址和端口是否正确，防火墙是否放行';
              } else if (errMsg.includes('EHOSTUNREACH')) {
                errMsg = '主机不可达 — 请检查网络连接和IP地址';
              }
              resolve({ success: false, error: errMsg });
            } else {
              console.log(`[S7] 连接成功: ${host}:${port || 102} (Rack:${rack}, Slot:${slot}), isoState=${this.nodes7.isoConnectionState}`);
              this.connected = true;

              if (this.nodes7.isoclient) {
                this.nodes7.isoclient.on('close', () => {
                  console.log('[S7] TCP连接关闭');
                  if (this.connected) {
                    this.connected = false;
                  }
                });
                this.nodes7.isoclient.on('end', () => {
                  console.log('[S7] TCP连接收到FIN');
                });
                this.nodes7.isoclient.on('error', (e) => {
                  console.log('[S7] TCP连接错误:', e.message || e);
                });
              }

              this.nodes7.setTranslationCB((tag) => {
                // P0-4：地址表缺项不再静默把逻辑名当 S7 地址（会读到完全无关的存储区）
                if (Object.prototype.hasOwnProperty.call(this.variables, tag)) return this.variables[tag];
                const word = this.wordVariables[tag];
                if (word && word.s7 && word.s7.address) return word.s7.address;
                throw new Error(`未知 S7 变量: ${tag}`);
              });

              // 布尔变量与 32 位 DINT 数值变量一起注册进轮询列表；
              // readVars 只取布尔，readWords 只取数值，互不串味。
              const allVarNames = [...Object.keys(this.variables), ...Object.keys(this.wordVariables)];
              if (allVarNames.length > 0) {
                this.nodes7.addItems(allVarNames);
                this.itemsRegistered = true;
                console.log(`[S7] 已注册 ${allVarNames.length} 个变量:`, allVarNames.join(', '));
              }

              this._startConnCheck();
              resolve({ success: true });
            }
          }
        );
      });
    } catch (e) {
      this.connecting = false;
      this._cleanup();
      return { success: false, error: e.message };
    }
  }

  async disconnect() {
    const oldNodes7 = this.nodes7;
    this.connected = false;
    this.nodes7 = null;
    this.connecting = false;
    this.itemsRegistered = false;
    this._opQueue = [];
    this._processing = false;
    if (this._connCheckInterval) {
      clearInterval(this._connCheckInterval);
      this._connCheckInterval = null;
    }

    if (oldNodes7) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('[S7] 断开超时，强制清理');
          this._printLatencyStats(true);
          resolve({ success: true });
        }, 3000);

        try {
          oldNodes7.dropConnection(() => {
            clearTimeout(timeout);
            console.log('[S7] 连接已断开');
            this._printLatencyStats(true);
            resolve({ success: true });
          });
        } catch {
          clearTimeout(timeout);
          this._printLatencyStats(true);
          resolve({ success: true });
        }
      });
    }
    this._printLatencyStats(true);
    return { success: true };
  }

  /** raw=true 时保留数值原值（供 32 位 DINT 变量读取），默认仍是布尔通道 */
  async readVars(varNames, raw = false) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Ready()) {
      console.warn('[S7] readVars: isoConnectionState=' + this.nodes7.isoConnectionState + ', 连接未就绪');
      this.connected = false;
      return { success: false, error: 'S7连接未就绪' };
    }

    const startTime = Date.now();

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.readAllItems((err, values) => {
              // 记录读延迟
              const latency = Date.now() - startTime;
              this.latencyStats.read.push(latency);
              this.latencyStats.last10Read.push(latency);
              if (this.latencyStats.last10Read.length > 10) {
                this.latencyStats.last10Read.shift();
              }
              // 每50次打印统计
              const total = this.latencyStats.read.length + this.latencyStats.write.length;
              if (total % 50 === 0) {
                this._printLatencyStats();
              }

              if (err) {
                console.error('[S7] readAllItems 错误:', err, 'isoState=' + this.nodes7.isoConnectionState);
                if (!this._isNodes7Ready()) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                const filtered = {};
                let trueCount = 0;
                for (const name of varNames) {
                  if (values && values[name] !== undefined && values[name] !== null) {
                    filtered[name] = raw ? (Number(values[name]) || 0) : !!values[name];
                    if (filtered[name]) trueCount++;
                  } else {
                    filtered[name] = false;
                  }
                }
                console.log('[S7] 读取完成: ' + trueCount + '/' + varNames.length + ' 个为true, 延迟=' + latency + 'ms, isoState=' + this.nodes7.isoConnectionState);
                resolve({ success: true, values: filtered });
              }
            });
          } catch (e) {
            console.error('[S7] readAllItems 异常:', e);
            resolve({ success: false, error: e.message });
          }
        }),
        5000,
        'readVars'
      ).catch((e) => {
        console.error('[S7] readVars 超时:', e.message);
        return { success: false, error: e.message };
      });
    });
  }

  /** 读 32 位 DINT：MDI120 是 nodes7 原生 32 位整数，无需拆字 */
  async readWords(varNames) {
    return this.readVars(varNames, true);
  }

  /** 写 32 位 DINT：writeVars 原样把数值交给 nodes7.writeItems */
  async writeWords(varNames, values) {
    return this.writeVars(varNames, values.map((v) => clampDint32(v)));
  }

  async writeVar(varName, value) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Ready()) {
      console.warn('[S7] writeVar: isoConnectionState=' + this.nodes7.isoConnectionState + ', 连接未就绪');
      this.connected = false;
      return { success: false, error: 'S7连接未就绪' };
    }

    const startTime = Date.now();

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.writeItems(varName, value, (err) => {
              // 记录写延迟
              const latency = Date.now() - startTime;
              this.latencyStats.write.push(latency);
              this.latencyStats.last10Write.push(latency);
              if (this.latencyStats.last10Write.length > 10) {
                this.latencyStats.last10Write.shift();
              }
              // 每50次打印统计
              const total = this.latencyStats.read.length + this.latencyStats.write.length;
              if (total % 50 === 0) {
                this._printLatencyStats();
              }

              if (err) {
                console.error('[S7] 写入失败:', varName, value, err, 'isoState=' + this.nodes7.isoConnectionState);
                if (!this._isNodes7Ready()) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                console.log('[S7] 写入成功:', varName, '=', value, '延迟=' + latency + 'ms');
                resolve({ success: true });
              }
            });
          } catch (e) {
            console.error('[S7] 写入异常:', varName, value, e);
            resolve({ success: false, error: e.message });
          }
        }),
        5000,
        'writeVar'
      ).catch((e) => {
        console.error('[S7] writeVar 超时:', e.message);
        return { success: false, error: e.message };
      });
    });
  }

  async writeVars(varNames, values) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Ready()) {
      console.warn('[S7] writeVars: isoConnectionState=' + this.nodes7.isoConnectionState + ', 连接未就绪');
      this.connected = false;
      return { success: false, error: 'S7连接未就绪' };
    }

    const startTime = Date.now();

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.writeItems(varNames, values, (err) => {
              // 记录写延迟
              const latency = Date.now() - startTime;
              this.latencyStats.write.push(latency);
              this.latencyStats.last10Write.push(latency);
              if (this.latencyStats.last10Write.length > 10) {
                this.latencyStats.last10Write.shift();
              }
              // 每50次打印统计
              const total = this.latencyStats.read.length + this.latencyStats.write.length;
              if (total % 50 === 0) {
                this._printLatencyStats();
              }

              if (err) {
                console.error('[S7] 批量写入失败:', varNames, err, 'isoState=' + this.nodes7.isoConnectionState);
                if (!this._isNodes7Ready()) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                console.log('[S7] 批量写入成功:', varNames.join(','), '延迟=' + latency + 'ms');
                resolve({ success: true });
              }
            });
          } catch (e) {
            console.error('[S7] 批量写入异常:', varNames, e);
            resolve({ success: false, error: e.message });
          }
        }),
        5000,
        'writeVars'
      ).catch((e) => {
        console.error('[S7] writeVars 超时:', e.message);
        return { success: false, error: e.message };
      });
    });
  }
}

class MitsubishiMX {
  constructor() {
    this.connected = false;
    this.variables = {};
    // 32 位 DINT 数值变量表（connect 消息下发；三菱侧只取 D 寄存器，不接高速计数器）
    this.wordVariables = {};
    this._station = 0;
    this._ps = null;
    this._psExe = '';
    this._busy = false;
    this._queue = [];
    this._pending = null;
    this._lineBuffer = '';
    this._ready = false;
    this._cmdId = 0;
    this.latencyStats = { read: [], write: [], last10Read: [], last10Write: [] };
    this.latencyLogFile = path.join(__dirname, 'latency_mitsubishi.log');
  }

  async _lock() {
    if (!this._busy) { this._busy = true; return; }
    return new Promise((resolve) => { this._queue.push(resolve); });
  }

  _unlock() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._busy = false;
    }
  }

  _printLatencyStats(isFinal = false) {
    const read = this.latencyStats.read;
    const write = this.latencyStats.write;
    if (read.length + write.length === 0) return;

    const calcStats = (arr) => {
      if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
      };
    };

    const readStats = calcStats(read);
    const writeStats = calcStats(write);

    const timestamp = new Date().toISOString();
    const output =
      '\n' +
      '='.repeat(60) + '\n' +
      `[三菱MX 通信延迟统计] ${timestamp}\n` +
      `读请求次数: ${read.length}, 平均: ${readStats.avg}ms, 最小: ${readStats.min}ms, 最大: ${readStats.max}ms, P95: ${readStats.p95}ms\n` +
      `写请求次数: ${write.length}, 平均: ${writeStats.avg}ms, 最小: ${writeStats.min}ms, 最大: ${writeStats.max}ms, P95: ${writeStats.p95}ms\n` +
      '='.repeat(60) + '\n';

    console.log(output);
    fs.appendFileSync(this.latencyLogFile, output);

    if (isFinal) {
      const now = new Date();
      const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      const reportFile = path.join(__dirname, `延迟测试报告_三菱MX_${dateStr}.txt`);
      const report =
        `通信延迟测试报告 - 三菱MX Component\n` +
        `测试时间: ${now.toLocaleString('zh-CN')}\n` +
        `测试环境: 三菱FX3U via MX Component + GX Simulator 2\n` +
        `${'='.repeat(50)}\n` +
        `\n` +
        `读操作:\n` +
        `  请求次数: ${read.length}\n` +
        `  平均延迟: ${readStats.avg}ms\n` +
        `  P95延迟:  ${readStats.p95}ms\n` +
        `  最小延迟: ${readStats.min}ms\n` +
        `  最大延迟: ${readStats.max}ms\n` +
        `\n` +
        `写操作:\n` +
        `  请求次数: ${write.length}\n` +
        `  平均延迟: ${writeStats.avg}ms\n` +
        `  P95延迟:  ${writeStats.p95}ms\n` +
        `  最小延迟: ${writeStats.min}ms\n` +
        `  最大延迟: ${writeStats.max}ms\n` +
        `\n` +
        `${'='.repeat(50)}\n` +
        `论文表3填写参考:\n` +
        `  读操作平均延迟: ${readStats.avg}ms\n` +
        `  读操作P95延迟:  ${readStats.p95}ms\n` +
        `  写操作平均延迟: ${writeStats.avg}ms\n` +
        `  写操作P95延迟:  ${writeStats.p95}ms\n` +
        `  最大延迟: ${Math.max(readStats.max, writeStats.max)}ms\n`;
      fs.writeFileSync(reportFile, report, 'utf-8');
      console.log(`\n延迟测试报告已保存到: ${reportFile}`);
    }
  }

  /**
   * PS 桥脚本正文只含常量，绝不拼接任何来自 WebSocket 的字段（P0-1）。
   * 逻辑站号由 spawn 的 env 传入，并在 PS 里强制 [int] 转换，即使环境变量被污染
   * 也只是数值，无法变成可执行语句。
   */
  _buildPSScript() {
    return [
      '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$ErrorActionPreference = "Stop"',
      `try {`,
      `  $station = [int]$env:DT_MX_STATION`,
      `  if ($station -lt 0 -or $station -gt 1023) { throw 'Logical station number out of range' }`,
      `  $p = New-Object -ComObject 'ActUtlType.ActUtlType'`,
      `  $p.ActLogicalStationNumber = $station`,
      `  $r = $p.Open(); if ($r -ne 0) { throw 'Open failed (logical station not configured or MX Component not installed)' }`,
      `  $v = -1; $r = $p.GetDevice('D0', [ref]$v)`,
      `  if ($r -ne 0) { throw "GetDevice failed (code=$r, is GX Simulator2 running?)" }`,
      `  Write-Host 'READY'`,
      `} catch {`,
      `  Write-Host ('ERRINIT:' + $_.Exception.Message)`,
      `  exit 1`,
      `}`,
      `while ($line = [Console]::In.ReadLine()) {`,
      `  $line = $line.Trim()`,
      `  if ($line -eq '') { continue }`,
      `  try {`,
      `    $cmd = $line | ConvertFrom-Json`,
      `    switch ($cmd.type) {`,
      `      'read' {`,
      `        $o = @{}`,
      `        foreach ($d in $cmd.devices) {`,
      `          try { $v = 0; $rc = $p.GetDevice($d, [ref]$v); $o[$d] = if ($rc -eq 0) { $v } else { -1 } }`,
      `          catch { $o[$d] = -1 }`,
      `        }`,
      `        Write-Host ($o | ConvertTo-Json -Compress)`,
      `      }`,
      `      'read-words' {`,
      `        $items = @()`,
      `        foreach ($d in $cmd.devices) {`,
      `          try {`,
      `            $v = 0; $rc = $p.GetDevice($d, [ref]$v)`,
      `            $items += @{ ok = ($rc -eq 0); value = [int]$v }`,
      `          } catch { $items += @{ ok = $false; value = 0 } }`,
      `        }`,
      `        Write-Host (@{ items = $items } | ConvertTo-Json -Compress -Depth 5)`,
      `      }`,
      `      'write' {`,
      `        $r = $p.SetDevice($cmd.device, $cmd.value)`,
      `        if ($r -eq 0) { Write-Host '{"ok":true}' }`,
      // 失败必须带 error 字段：_resolvePending 只认 error，否则写失败会被吞成成功（P1-1）
      `        else { Write-Host (@{ ok = $false; error = "SetDevice failed (code=$r)" } | ConvertTo-Json -Compress) }`,
      `      }`,
      `      'write-batch' {`,
      `        $e = @()`,
      `        for ($i = 0; $i -lt $cmd.devices.Count; $i++) {`,
      `          $r = $p.SetDevice($cmd.devices[$i], $cmd.values[$i])`,
      `          if ($r -ne 0) { $e += ($cmd.devices[$i] + ':' + $r) }`,
      `        }`,
      `        if ($e.Count -eq 0) { Write-Host '{"ok":true}' }`,
      `        else { Write-Host (@{ ok = $false; error = ($e -join ',') } | ConvertTo-Json -Compress) }`,
      `      }`,
      `      'exit' {`,
      `        $null = $p.Close()`,
      `        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($p) | Out-Null`,
      `        [System.GC]::Collect()`,
      `        [System.GC]::WaitForPendingFinalizers()`,
      `        Write-Host '{"ok":true}'`,
      `        exit 0`,
      `      }`,
      `      default { Write-Host '{"error":"unknown command"}' }`,
      `    }`,
      `  } catch {`,
      `    $msg = $_.Exception.Message -replace '"', "'"`,
      `    Write-Host ('{"error":"' + $msg + '"}')`,
      `  }`,
      `}`,
      `try { $null = $p.Close() } catch {}`,
    ].join('\n');
  }

  _sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      if (!this._ps || this._ps.killed) {
        reject(new Error('PS进程未运行'));
        return;
      }
      if (this._pending) {
        reject(new Error('上一个命令尚未完成'));
        return;
      }
      const timeout = setTimeout(() => {
        this._pending = null;
        reject(new Error('命令超时(15s)'));
      }, 15000);
      this._pending = { resolve, reject, timeout };
      try {
        this._ps.stdin.write(JSON.stringify(cmd) + '\n');
      } catch (e) {
        clearTimeout(timeout);
        this._pending = null;
        reject(e);
      }
    });
  }

  _resolvePending(data) {
    if (!this._pending) return;
    const { resolve, reject, timeout } = this._pending;
    this._pending = null;
    clearTimeout(timeout);
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        reject(new Error(parsed.error));
      } else {
        resolve(parsed);
      }
    } catch (e) {
      reject(new Error('PS 响应解析失败: ' + data));
    }
  }

  _rejectPending(err) {
    if (!this._pending) return;
    const { reject, timeout } = this._pending;
    this._pending = null;
    clearTimeout(timeout);
    reject(err);
  }

  async connect(host, port) {
    await this._lock();
    try {
      // P0-1：逻辑站号必须是一个有界整数，绝不允许字符串/NaN/Infinity 进入 PS 链路
      const station = port ?? 0;
      if (!Number.isInteger(station) || station < 0 || station > 1023) {
        return { success: false, error: '三菱逻辑站号必须是 0~1023 的整数' };
      }
      if (this._ps) {
        this._killPS();
      }

      this._station = station;
      this._psExe = process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe';

      console.log(`[三菱MX] 正在启动持久化PS进程，站号=${this._station}`);

      const script = this._buildPSScript();
      const tmpFile = path.join(__dirname, '_mx_bridge.ps1');
      fs.writeFileSync(tmpFile, script, 'utf-8');

      return new Promise((resolveConnect) => {
        this._ready = false;
        this._lineBuffer = '';

        this._ps = spawn(this._psExe, [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile,
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          // 站号只走环境量，脚本正文不含任何客户端数据
          env: { ...process.env, DT_MX_STATION: String(this._station) },
        });

        const startTimeout = setTimeout(() => {
          this._killPS();
          try { fs.unlinkSync(tmpFile); } catch {}
          resolveConnect({ success: false, error: 'PS进程启动超时(30s)' });
        }, 30000);

        this._ps.stdout.on('data', (data) => {
          this._lineBuffer += data.toString();
          const lines = this._lineBuffer.split(/\r?\n/);
          this._lineBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (!this._ready) {
              if (trimmed === 'READY') {
                this._ready = true;
                this.connected = true;
                clearTimeout(startTimeout);
                try { fs.unlinkSync(tmpFile); } catch {}
                console.log(`[三菱MX] 持久化PS进程就绪，站号=${this._station}`);
                resolveConnect({ success: true });
              } else if (trimmed.startsWith('ERRINIT:')) {
                clearTimeout(startTimeout);
                this._killPS();
                try { fs.unlinkSync(tmpFile); } catch {}
                console.log(`[三菱MX] COM初始化失败: ${trimmed}`);
                resolveConnect({ success: false, error: trimmed.slice(8) });
              }
              continue;
            }

            this._resolvePending(trimmed);
          }
        });

        this._ps.stderr.on('data', (data) => {
          console.error('[三菱MX PS stderr]', data.toString().trim());
        });

        this._ps.on('close', (code) => {
          clearTimeout(startTimeout);
          try { fs.unlinkSync(tmpFile); } catch {}
          this._rejectPending(new Error('PS进程意外退出(code=' + code + ')'));
          this._ps = null;
          this.connected = false;
          this._ready = false;
          console.log(`[三菱MX] PS进程退出, code=${code}`);
        });

        this._ps.on('error', (e) => {
          clearTimeout(startTimeout);
          try { fs.unlinkSync(tmpFile); } catch {}
          this._rejectPending(e);
          this._ps = null;
          this.connected = false;
          this._ready = false;
          console.error('[三菱MX] PS进程错误:', e.message);
          if (!this._ready) {
            resolveConnect({ success: false, error: e.message });
          }
        });
      });
    } finally { this._unlock(); }
  }

  _killPS() {
    if (this._ps && !this._ps.killed) {
      try { this._ps.stdin.end(); } catch {}
      try { this._ps.kill(); } catch {}
    }
    this._ps = null;
    this.connected = false;
    this._ready = false;
  }

  async disconnect() {
    await this._lock();
    try {
      this._printLatencyStats(true);
      if (this._ps && this._ready) {
        try {
          await this._sendCommand({ type: 'exit' });
        } catch {}
      }
      // PS 进程已在 exit 命令中自行清理退出，不调用 _killPS() 强杀
      this._ps = null;
      this.connected = false;
      this._ready = false;
      return { success: true };
    } finally { this._unlock(); }
  }

  shutdown() {
    this._printLatencyStats(true);
    this._killPS();
  }

  async readVars(varNames) {
    if (!this.connected || !this._ps) {
      return { success: false, error: '三菱MX未连接' };
    }
    await this._lock();
    try {
      const startTime = Date.now();
      const devices = varNames.map(name => this._device(name));

      const result = await this._sendCommand({ type: 'read', devices });

      const latency = Date.now() - startTime;
      this.latencyStats.read.push(latency);
      this.latencyStats.last10Read.push(latency);
      if (this.latencyStats.last10Read.length > 10) this.latencyStats.last10Read.shift();
      const total = this.latencyStats.read.length + this.latencyStats.write.length;
      if (total % 50 === 0) this._printLatencyStats();

      const values = {};
      let trueCount = 0;
      for (let i = 0; i < varNames.length; i++) {
        const val = result[devices[i]];
        // PS 的 GetDevice 失败哨兵是 -1；!!(-1) 会把读失败伪造成 ON（P1-1）
        if (val === undefined || val === null || val === -1) {
          return { success: false, error: `读软元件失败: ${devices[i]}` };
        }
        const on = Number(val) !== 0;
        values[varNames[i]] = on;
        if (on) trueCount++;
      }
      console.log('[三菱MX] 读取完成: ' + trueCount + '/' + varNames.length + ' 个为true, 延迟=' + latency + 'ms');
      return { success: true, values };
    } catch (e) {
      console.error('[三菱MX] 读取失败:', e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }

  async writeVar(varName, value) {
    if (!this.connected || !this._ps) {
      return { success: false, error: '三菱MX未连接' };
    }
    await this._lock();
    try {
      const startTime = Date.now();
      const device = this._device(varName);

      const result = await this._sendCommand({ type: 'write', device, value: value ? 1 : 0 });
      // PS 失败帧带 error → _resolvePending 会 reject；这里再兜一层 ok 检查（P1-1）
      if (result.ok === false) {
        return { success: false, error: result.error || 'SetDevice 写入失败' };
      }

      const latency = Date.now() - startTime;
      this.latencyStats.write.push(latency);
      this.latencyStats.last10Write.push(latency);
      if (this.latencyStats.last10Write.length > 10) this.latencyStats.last10Write.shift();
      const total = this.latencyStats.read.length + this.latencyStats.write.length;
      if (total % 50 === 0) this._printLatencyStats();

      console.log('[三菱MX] 写入成功:', varName, '=', value, '延迟=' + latency + 'ms');
      return { success: true };
    } catch (e) {
      console.error('[三菱MX] 写入失败:', varName, e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }

  async writeVars(varNames, values) {
    if (!this.connected || !this._ps) {
      return { success: false, error: '三菱MX未连接' };
    }
    await this._lock();
    try {
      const startTime = Date.now();
      const devices = varNames.map(name => this._device(name));
      const vals = values.map(v => v ? 1 : 0);

      const result = await this._sendCommand({ type: 'write-batch', devices, values: vals });

      const latency = Date.now() - startTime;
      this.latencyStats.write.push(latency);
      this.latencyStats.last10Write.push(latency);
      if (this.latencyStats.last10Write.length > 10) this.latencyStats.last10Write.shift();
      const total = this.latencyStats.read.length + this.latencyStats.write.length;
      if (total % 50 === 0) this._printLatencyStats();

      if (result.ok) {
        console.log('[三菱MX] 批量写入成功:', varNames.join(','), '延迟=' + latency + 'ms');
        return { success: true };
      } else {
        console.error('[三菱MX] 批量写入失败:', varNames, result.err);
        return { success: false, error: result.error || result.err || '批量写入失败' };
      }
    } catch (e) {
      console.error('[三菱MX] 批量写入失败:', varNames, e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }

  /** 数值变量 → 两个连续 D 寄存器（D120 低字 / D121 高字） */
  _wordDevices(name) {
    const spec = (this.wordVariables || {})[name];
    const m = spec && spec.mitsubishi;
    if (!m) return null;
    const base = parseInt(String(m.address).replace(/^D/i, ''), 10);
    if (!Number.isFinite(base)) return null;
    return [`D${base}`, `D${base + 1}`];
  }

  /**
   * 变量名 → 软元件名（P0-4）：查不到映射一律报错，绝不能把抽象变量名
   * 当成软元件名直接送给 MX Component / nodes7。
   */
  _device(name) {
    if (!Object.prototype.hasOwnProperty.call(this.variables, name)) {
      throw new Error(`未知变量名: ${name}（不在 connect 下发的地址表内）`);
    }
    return this.variables[name];
  }

  /** 读 32 位 DINT：只取 D 寄存器数值，不占用 X 输入点、不接高速计数器 */
  async readWords(varNames) {
    if (!this.connected || !this._ps) {
      return { success: false, error: '三菱MX未连接' };
    }
    await this._lock();
    try {
      const devices = [];
      const specs = [];
      for (const name of varNames) {
        const pair = this._wordDevices(name);
        if (!pair) return { success: false, error: `未知数值变量: ${name}` };
        specs.push({ name, offset: devices.length });
        devices.push(...pair);
      }
      const raw = await this._sendCommand({ type: 'read-words', devices });
      const items = Array.isArray(raw.items) ? raw.items : (raw.items ? [raw.items] : []);
      if (items.length < devices.length) {
        return { success: false, error: 'D 寄存器读数不完整' };
      }
      const values = {};
      for (const s of specs) {
        const lo = items[s.offset];
        const hi = items[s.offset + 1];
        if (!lo || !hi || !lo.ok || !hi.ok) {
          return { success: false, error: `读 D 寄存器失败 (offset=${s.offset})` };
        }
        values[s.name] = joinDint32(toUnsigned16(lo.value), toUnsigned16(hi.value));
      }
      return { success: true, values };
    } catch (e) {
      console.error('[三菱MX] 数值读取失败:', e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }

  /** 写 32 位 DINT：一次 write-batch 连写两个字，字值按有符号 short 传递 */
  async writeWords(varNames, values) {
    if (!this.connected || !this._ps) {
      return { success: false, error: '三菱MX未连接' };
    }
    await this._lock();
    try {
      const devices = [];
      const words = [];
      for (let i = 0; i < varNames.length; i++) {
        const pair = this._wordDevices(varNames[i]);
        if (!pair) return { success: false, error: `未知数值变量: ${varNames[i]}` };
        const [low, high] = splitDint32(clampDint32(values[i]));
        devices.push(...pair);
        words.push(toSigned16(low), toSigned16(high));
      }
      const result = await this._sendCommand({ type: 'write-batch', devices, values: words });
      if (result.ok) return { success: true };
      return { success: false, error: result.error || result.err || 'D 寄存器写入失败' };
    } catch (e) {
      console.error('[三菱MX] 数值写入失败:', e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }
}

/* ==========================================================================
 * 网关接入边界（P0-1 / P0-3 / P0-4 / P1-2）
 *
 * 旧实现只有一个模块级 currentProtocol + 三个共享客户端：任意第二个连接发 connect
 * 就能改协议、改地址表、把 PLC 重连到别的主机；任意连接发 disconnect 会切断所有人；
 * 未连接时读写还会被 else 分支静默路由到 S7。现在改为：
 *   - 协议白名单 + connect 帧逐字段校验 + PLC 主机白名单；
 *   - 每个 WS 连接一份 session，同一时刻只有一个主控（controller）持有 PLC 会话；
 *   - 其余本机连接只读镜像主控会话，写帧一律拒绝；
 *   - 所有分支显式 switch，null / 未知协议统一报「未连接」或「未知协议」。
 * ========================================================================== */

const WS_PORT = parseInt(process.env.WS_PORT || '8081', 10);
/** 网关只对本机同源反代开放：不绑回环会让局域网绕过 /ws/plc 直连写 PLC 线圈 */
const WS_HOST = '127.0.0.1';

const PROTOCOLS = new Set(['modbus', 's7', 'mitsubishi']);
const ALLOWED_TYPES = new Set([
  'connect', 'disconnect', 'get-status',
  'read-coils', 'write-coil', 'write-coils',
  'read-vars', 'write-var', 'write-vars',
  'read-words', 'write-words',
]);
const WRITE_TYPES = new Set(['write-coil', 'write-coils', 'write-var', 'write-vars', 'write-words']);
const MAX_VAR_KEYS = 256;
const MAX_NAME_BATCH = 128;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const HOST_RE = /^[A-Za-z0-9._:[\]-]{1,253}$/;
const DEVICE_RE = /^[A-Za-z][A-Za-z0-9_.:]{0,63}$/;

function isRecord(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function fail(message) { return { success: false, error: message }; }
function intBetween(value, min, max, label) {
  if (!Number.isInteger(value)) throw new Error(`${label} 必须是整数`);
  if (value < min || value > max) throw new Error(`${label} 超出范围 ${min}~${max}`);
  return value;
}

/** 变量表复制成无原型对象，杜绝 __proto__ 污染与「查不到就当软元件名」的回退 */
function copyVarTable(raw, protocol, label) {
  if (raw === undefined) return null;
  if (!isRecord(raw)) throw new Error(`${label} 必须是对象`);
  const keys = Object.keys(raw);
  if (keys.length > MAX_VAR_KEYS) throw new Error(`${label} 变量过多`);
  const out = Object.create(null);
  for (const key of keys) {
    if (!NAME_RE.test(key) || UNSAFE_KEYS.has(key)) throw new Error(`${label} 变量名非法: ${key}`);
    const value = raw[key];
    if (protocol === 'modbus') {
      out[key] = intBetween(value, 0, 0xffff, `${label}.${key}`);
    } else {
      if (typeof value !== 'string' || !DEVICE_RE.test(value)) throw new Error(`${label}.${key} 地址非法`);
      out[key] = value;
    }
  }
  return out;
}

function copyWordTable(raw, label) {
  if (raw === undefined) return null;
  if (!isRecord(raw)) throw new Error(`${label} 必须是对象`);
  const keys = Object.keys(raw);
  if (keys.length > MAX_VAR_KEYS) throw new Error(`${label} 变量过多`);
  const out = Object.create(null);
  for (const key of keys) {
    if (!NAME_RE.test(key) || UNSAFE_KEYS.has(key)) throw new Error(`${label} 变量名非法: ${key}`);
    const spec = raw[key];
    if (!isRecord(spec)) throw new Error(`${label}.${key} 必须是对象`);
    // MD520 485 专用参数是 16 位单字；配药编码器 DINT 仍是 32 位双字
    if (spec.type !== undefined && spec.type !== 'dint32' && spec.type !== 'uint16') {
      throw new Error(`${label}.${key}.type 非法`);
    }
    if (spec.wordOrder !== undefined && spec.wordOrder !== 'low-first') throw new Error(`${label}.${key}.wordOrder 非法`);
    const copy = { type: spec.type || 'dint32', wordOrder: 'low-first' };
    for (const proto of PROTOCOLS) {
      const p = spec[proto];
      if (p === undefined) continue;
      if (!isRecord(p)) throw new Error(`${label}.${key}.${proto} 必须是对象`);
      const words = intBetween(p.words, 1, 64, `${label}.${key}.${proto}.words`);
      if (copy.type === 'uint16' && words !== 1) {
        throw new Error(`${label}.${key}.${proto}.words 单字变量必须为 1`);
      }
      if (proto === 'modbus') {
        copy[proto] = { address: intBetween(p.address, 0, 0xffff, `${label}.${key}.${proto}.address`), words };
      } else {
        if (typeof p.address !== 'string' || !DEVICE_RE.test(p.address)) {
          throw new Error(`${label}.${key}.${proto}.address 非法`);
        }
        copy[proto] = { address: p.address, words };
      }
    }
    out[key] = copy;
  }
  return out;
}

/**
 * PLC 主机白名单：默认只允许回环（虚拟 PLC / PLCSIM / MX Component 都走本机）。
 * 接实体 PLC 时用 DT_PLC_HOSTS=192.168.1.50,plc.local 或 websocket-server/plc-hosts.json
 * 显式放行；DT_PLC_HOSTS=* 恢复「允许任意主机」，仅在完全可信的内网使用。
 * 这样即使拿到 WS 通道也不能指使网关去连任意内网设备（SSRF + 写线圈）。
 */
function loadPlcHostAllowlist() {
  const env = String(process.env.DT_PLC_HOSTS || '').trim();
  if (env === '*') return null;
  const list = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const add = (item) => {
    if (typeof item !== 'string' || !HOST_RE.test(item.trim())) throw new Error(`PLC 主机白名单含非法条目: ${item}`);
    list.add(item.trim().toLowerCase());
  };
  for (const item of env.split(',').map((s) => s.trim()).filter(Boolean)) add(item);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'plc-hosts.json'), 'utf8'));
    const entries = Array.isArray(cfg) ? cfg : (cfg && cfg.hosts) || [];
    for (const item of entries) add(item);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') console.warn('[WS] plc-hosts.json 读取失败:', e.message);
  }
  return list;
}

const PLC_HOSTS = loadPlcHostAllowlist();

function validateConnect(frame) {
  const protocol = frame.protocol === undefined ? 'modbus' : frame.protocol;
  if (typeof protocol !== 'string' || !PROTOCOLS.has(protocol)) throw new Error(`未知协议: ${String(protocol)}`);
  const rawHost = frame.host === undefined ? '127.0.0.1' : frame.host;
  if (typeof rawHost !== 'string') throw new Error('connect.host 非法');
  // 三菱 MX 的 host 不生效（逻辑站里配置），面板可能下发空串，统一回落本机
  const host = rawHost.trim() || '127.0.0.1';
  if (!HOST_RE.test(host)) throw new Error('connect.host 非法');
  if (PLC_HOSTS && !PLC_HOSTS.has(host.toLowerCase())) {
    throw new Error(`目标主机 ${host} 不在允许列表（DT_PLC_HOSTS）`);
  }
  let port;
  if (protocol === 'mitsubishi') {
    port = frame.port === undefined ? 0 : intBetween(frame.port, 0, 1023, 'connect.port(逻辑站号)');
  } else {
    const fallback = protocol === 's7' ? 102 : 502;
    port = frame.port === undefined ? fallback : intBetween(frame.port, 1, 65535, 'connect.port');
  }
  const rack = frame.rack === undefined ? 0 : intBetween(frame.rack, 0, 7, 'connect.rack');
  const slot = frame.slot === undefined ? 1 : intBetween(frame.slot, 0, 31, 'connect.slot');
  return {
    protocol, host, port, rack, slot,
    variables: copyVarTable(frame.variables, protocol, 'connect.variables'),
    wordVariables: copyWordTable(frame.wordVariables, 'connect.wordVariables'),
  };
}

function validateNames(raw, table, label) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_NAME_BATCH) {
    throw new Error(`${label} 必须是 1~${MAX_NAME_BATCH} 项数组`);
  }
  const out = [];
  for (const name of raw) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error(`${label} 含非法变量名`);
    if (!table || !Object.prototype.hasOwnProperty.call(table, name)) {
      throw new Error(`未知变量名: ${name}（不在 connect 下发的地址表内）`);
    }
    out.push(name);
  }
  return out;
}

function validateBoolValue(value, label) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  throw new Error(`${label} 必须是布尔或数值`);
}

function validateBoolValues(raw, expected, label) {
  if (!Array.isArray(raw) || raw.length !== expected) throw new Error(`${label} 长度与 names 不一致`);
  return raw.map((v, i) => validateBoolValue(v, `${label}[${i}]`));
}

function validateNumberValues(raw, expected, label) {
  if (!Array.isArray(raw) || raw.length !== expected) throw new Error(`${label} 长度与 names 不一致`);
  return raw.map((v, i) => {
    const num = Number(v);
    if (!Number.isFinite(num)) throw new Error(`${label}[${i}] 必须是有限数值`);
    return num;
  });
}

const wss = new WebSocket.Server({
  port: WS_PORT,
  host: WS_HOST,
  // 第二道防线：代理层已按 localAddress 拦截 LAN；网关再复核一次角色与一次性 token
  verifyClient: (info) => {
    const verdict = verifyInternalRequest(info.req, { allowViewer: false });
    if (!verdict.ok) console.warn(`[WS] 拒绝越权接入 (${verdict.reason})`);
    return verdict.ok;
  },
});

const clients = {
  modbus: new SimpleModbusTCP(),
  s7: new SimpleS7Client(),
  mitsubishi: new MitsubishiMX(),
};
const DEFAULT_VARS = {
  modbus: Object.assign(Object.create(null), PNEUMATIC_MODBUS_VARS),
  s7: Object.assign(Object.create(null), S7_VARIABLES),
  mitsubishi: Object.assign(Object.create(null), MITSUBISHI_VARIABLES),
};

/** per-connection session；controller 是当前唯一持有 PLC 链路的 WS 连接 */
const sessions = new Map();
let controller = null;

function sessionOf(ws) {
  let s = sessions.get(ws);
  if (!s) {
    s = { protocol: null, variables: null, wordVariables: null, client: null };
    sessions.set(ws, s);
  }
  return s;
}
function activeSession() { return controller ? sessions.get(controller) || null : null; }

async function releaseController(ws) {
  if (!ws || controller !== ws) return;
  const s = sessions.get(ws);
  controller = null;
  if (s) {
    if (s.client) {
      try { await s.client.disconnect(); } catch { /* 断开失败也要释放会话 */ }
    }
    s.protocol = null;
    s.variables = null;
    s.wordVariables = null;
    s.client = null;
  }
  console.log('[WS] PLC 主控会话已释放');
}

console.log(`WebSocket服务器启动在 ${WS_HOST}:${WS_PORT}（仅本机可达）`);
console.log('支持协议: Modbus TCP, Siemens S7 (ISO over TCP), 三菱 MX Component (via PowerShell)');
console.log(`[WS] PLC 主机白名单: ${PLC_HOSTS ? [...PLC_HOSTS].join(', ') : '允许任意主机 (DT_PLC_HOSTS=*)'}`);

async function gracefulShutdown() {
  console.log('正在优雅关闭...');
  const s = activeSession();
  if (s && s.client && s.client.connected) {
    try { await s.client.disconnect(); } catch { /* noop */ }
  }
  clients.mitsubishi.shutdown();
  wss.close();
  process.exit(0);
}

process.stdin.on('data', (data) => {
  try {
    const msg = JSON.parse(data.toString().trim());
    if (msg.type === 'shutdown') {
      gracefulShutdown();
    }
  } catch {}
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('exit', () => { clients.mitsubishi.shutdown(); });

/** 帧分发：所有分支显式 switch，不允许 null / 未知协议落到 else 兜底 */
async function dispatch(ws, d) {
  const type = d.type;

  if (type === 'get-status') {
    const s = activeSession();
    return {
      success: true,
      connected: !!(s && s.client && s.client.connected),
      protocol: s ? s.protocol : null,
    };
  }

  if (type === 'connect') {
    if (controller && controller !== ws && controller.readyState === WebSocket.OPEN) {
      return fail('已有主控连接 PLC，请先断开原连接');
    }
    if (controller && controller !== ws) await releaseController(controller);
    const cfg = validateConnect(d);
    if (controller === ws) await releaseController(ws);

    const client = clients[cfg.protocol];
    const variables = cfg.variables || DEFAULT_VARS[cfg.protocol];
    const wordVariables = cfg.wordVariables || Object.create(null);
    client.variables = variables;
    client.wordVariables = wordVariables;

    let result;
    switch (cfg.protocol) {
      case 'modbus':
        result = await client.connect(cfg.host, cfg.port);
        break;
      case 's7':
        result = await client.connect(cfg.host, cfg.port, cfg.rack, cfg.slot);
        break;
      case 'mitsubishi':
        result = await client.connect(cfg.host, cfg.port);
        break;
      default:
        return fail('未知协议');
    }
    if (!result || !result.success) return result || fail('连接失败');

    controller = ws;
    const session = sessionOf(ws);
    session.protocol = cfg.protocol;
    session.variables = variables;
    session.wordVariables = wordVariables;
    session.client = client;
    console.log(`[WS] PLC 主控已建立: ${cfg.protocol} @ ${cfg.host}:${cfg.port}`);
    return { success: true };
  }

  if (type === 'disconnect') {
    if (controller && controller !== ws) return fail('当前连接不是 PLC 主控');
    if (!controller) return { success: true };
    await releaseController(controller);
    return { success: true };
  }

  const session = activeSession();
  if (!session || !session.protocol || !session.client) {
    return fail('PLC 未连接，请先发送 connect');
  }
  // 非主控连接只能读；写帧（含 disconnect）一律拒绝，杜绝第二个本地标签页串扰
  if (WRITE_TYPES.has(type) && controller !== ws) {
    return fail('当前连接不是 PLC 主控（只读）');
  }
  const protocol = session.protocol;
  const client = session.client;

  switch (type) {
    case 'write-coil': {
      if (protocol !== 'modbus') return fail(`${protocol} 协议请使用 write-var`);
      const address = intBetween(d.address, 0, 0xffff, 'address');
      return client.writeCoil(address, validateBoolValue(d.value, 'value'));
    }
    case 'write-coils': {
      if (protocol !== 'modbus') return fail(`${protocol} 协议请使用 write-vars`);
      const address = intBetween(d.address, 0, 0xffff, 'address');
      const raw = Array.isArray(d.values) ? d.values : [];
      if (raw.length === 0 || raw.length > 1968) return fail('批量线圈数量超出 1~1968');
      return client.writeCoils(address, validateBoolValues(raw, raw.length, 'values'));
    }
    case 'read-coils': {
      if (protocol !== 'modbus') return fail(`${protocol} 协议请使用 read-vars`);
      const address = intBetween(d.address, 0, 0xffff, 'address');
      const length = intBetween(d.length, 1, 2000, 'length');
      return client.readCoils(address, length);
    }
    case 'write-var': {
      const names = validateNames([d.name], session.variables, 'name');
      return client.writeVar(names[0], validateBoolValue(d.value, 'value'));
    }
    case 'write-vars': {
      const names = validateNames(d.names, session.variables, 'names');
      return client.writeVars(names, validateBoolValues(d.values, names.length, 'values'));
    }
    case 'read-vars': {
      const names = validateNames(d.names, session.variables, 'names');
      return client.readVars(names);
    }
    case 'read-words': {
      const names = validateNames(d.names, session.wordVariables, 'names');
      return client.readWords(names);
    }
    case 'write-words': {
      const names = validateNames(d.names, session.wordVariables, 'names');
      return client.writeWords(names, validateNumberValues(d.values, names.length, 'values'));
    }
    default:
      return fail('未知消息类型');
  }
}

wss.on('connection', (ws) => {
  sessionOf(ws);
  ws.on('message', async (message) => {
    let parsedData = null;
    try {
      parsedData = JSON.parse(message);
      if (!isRecord(parsedData) || typeof parsedData.type !== 'string' || !ALLOWED_TYPES.has(parsedData.type)) {
        throw new Error(`未知消息类型: ${String(parsedData && parsedData.type)}`);
      }
      const result = await dispatch(ws, parsedData);
      ws.send(JSON.stringify({ id: parsedData.id, type: parsedData.type, ...result }));
    } catch (error) {
      ws.send(JSON.stringify({
        id: (parsedData && parsedData.id) || 'unknown',
        success: false,
        error: error.message,
      }));
    }
  });

  ws.on('close', () => {
    // 主控断开即释放 PLC 会话；不再把全局会话留给下一个连接复用，
    // 避免「主控唯一 PLC 客户端」的口径被悄悄破坏。
    void releaseController(ws).finally(() => sessions.delete(ws));
  });
});
