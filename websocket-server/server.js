const WebSocket = require('ws');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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

class SimpleModbusTCP {
  constructor() {
    this.client = null;
    this.connected = false;
    this.transactionId = 0;
    this.pendingRequests = new Map();
    this.receiveBuffer = Buffer.alloc(0);
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
                } else if (functionCode === 0x05 || functionCode === 0x0F) {
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
}

class SimpleS7Client {
  constructor() {
    this.nodes7 = null;
    this.connected = false;
    this.variables = {};
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
                return this.variables[tag] || tag;
              });

              const allVarNames = Object.keys(this.variables);
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

  async readVars(varNames) {
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
                    filtered[name] = !!values[name];
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

  _buildPSScript(station) {
    return [
      '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$ErrorActionPreference = "Stop"',
      `try {`,
      `  $p = New-Object -ComObject 'ActUtlType.ActUtlType'`,
      `  $p.ActLogicalStationNumber = ${station}`,
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
      `          try { $v = 0; $null = $p.GetDevice($d, [ref]$v); $o[$d] = $v }`,
      `          catch { $o[$d] = -1 }`,
      `        }`,
      `        Write-Host ($o | ConvertTo-Json -Compress)`,
      `      }`,
      `      'write' {`,
      `        $r = $p.SetDevice($cmd.device, $cmd.value)`,
      `        if ($r -eq 0) { Write-Host '{"ok":true}' }`,
      `        else { Write-Host ('{"ok":false,"err":"' + $r + '"}') }`,
      `      }`,
      `      'write-batch' {`,
      `        $e = @()`,
      `        for ($i = 0; $i -lt $cmd.devices.Count; $i++) {`,
      `          $r = $p.SetDevice($cmd.devices[$i], $cmd.values[$i])`,
      `          if ($r -ne 0) { $e += ($cmd.devices[$i] + ':' + $r) }`,
      `        }`,
      `        if ($e.Count -eq 0) { Write-Host '{"ok":true}' }`,
      `        else { Write-Host ('{"ok":false,"err":"' + ($e -join ',') + '"}') }`,
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
      if (this._ps) {
        this._killPS();
      }

      this._station = port ?? 0;
      this._psExe = process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe';

      console.log(`[三菱MX] 正在启动持久化PS进程，站号=${this._station}`);

      const script = this._buildPSScript(this._station);
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
      const devices = varNames.map(name => this.variables[name] || name);

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
        values[varNames[i]] = !!val;
        if (val) trueCount++;
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
      const device = this.variables[varName] || varName;

      await this._sendCommand({ type: 'write', device, value: value ? 1 : 0 });

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
      const devices = varNames.map(name => this.variables[name] || name);
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
        return { success: false, error: result.err };
      }
    } catch (e) {
      console.error('[三菱MX] 批量写入失败:', varNames, e.message);
      return { success: false, error: e.message };
    } finally { this._unlock(); }
  }
}

const wss = new WebSocket.Server({ port: 8081 });
const modbusClient = new SimpleModbusTCP();
const s7Client = new SimpleS7Client();
const mitsubishiClient = new MitsubishiMX();
let currentProtocol = null;

console.log('WebSocket服务器启动在端口 8081');
console.log('支持协议: Modbus TCP, Siemens S7 (ISO over TCP), 三菱 MX Component (via PowerShell)');

async function gracefulShutdown() {
  console.log('正在优雅关闭...');
  if (currentProtocol === 's7' && s7Client.connected) {
    await s7Client.disconnect();
  } else if (currentProtocol === 'modbus' && modbusClient.connected) {
    await modbusClient.disconnect();
  } else if (currentProtocol === 'mitsubishi' && mitsubishiClient.connected) {
    await mitsubishiClient.disconnect();
  }
  mitsubishiClient.shutdown();
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
process.on('exit', () => { mitsubishiClient.shutdown(); });

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    let parsedData = null;
    try {
      parsedData = JSON.parse(message);
      let result;

      switch (parsedData.type) {
        case 'connect':
          currentProtocol = parsedData.protocol || 'modbus';
          if (currentProtocol === 's7') {
            s7Client.variables = parsedData.variables || S7_VARIABLES;
            result = await s7Client.connect(
              parsedData.host,
              parsedData.port,
              parsedData.rack || 0,
              parsedData.slot || 1
            );
          } else if (currentProtocol === 'mitsubishi') {
            mitsubishiClient.variables = parsedData.variables || MITSUBISHI_VARIABLES;
            result = await mitsubishiClient.connect(parsedData.host, parsedData.port ?? 0);
          } else {
            result = await modbusClient.connect(parsedData.host, parsedData.port || 502);
          }
          break;

        case 'disconnect':
          if (currentProtocol === 's7') {
            result = await s7Client.disconnect();
          } else if (currentProtocol === 'mitsubishi') {
            result = await mitsubishiClient.disconnect();
          } else {
            result = await modbusClient.disconnect();
          }
          currentProtocol = null;
          break;

        case 'write-coil':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用write-var替代write-coil' };
          } else if (currentProtocol === 'mitsubishi') {
            result = { success: false, error: '三菱MC协议使用write-var替代write-coil' };
          } else {
            result = await modbusClient.writeCoil(parsedData.address, parsedData.value);
          }
          break;

        case 'write-coils':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用write-vars替代write-coils' };
          } else if (currentProtocol === 'mitsubishi') {
            result = { success: false, error: '三菱MC协议使用write-vars替代write-coils' };
          } else {
            result = await modbusClient.writeCoils(parsedData.address, parsedData.values);
          }
          break;

        case 'read-coils':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用read-vars替代read-coils' };
          } else if (currentProtocol === 'mitsubishi') {
            result = { success: false, error: '三菱MC协议使用read-vars替代read-coils' };
          } else {
            result = await modbusClient.readCoils(parsedData.address, parsedData.length);
          }
          break;

        case 'write-var':
          if (currentProtocol === 'mitsubishi') {
            result = await mitsubishiClient.writeVar(parsedData.name, parsedData.value);
          } else {
            result = await s7Client.writeVar(parsedData.name, parsedData.value);
          }
          break;

        case 'write-vars':
          if (currentProtocol === 'mitsubishi') {
            result = await mitsubishiClient.writeVars(parsedData.names, parsedData.values);
          } else {
            result = await s7Client.writeVars(parsedData.names, parsedData.values);
          }
          break;

        case 'read-vars':
          if (currentProtocol === 'mitsubishi') {
            result = await mitsubishiClient.readVars(parsedData.names);
          } else {
            result = await s7Client.readVars(parsedData.names);
          }
          break;

        case 'get-status':
          if (currentProtocol === 's7') {
            result = { success: true, connected: s7Client.connected, protocol: 's7' };
          } else if (currentProtocol === 'mitsubishi') {
            result = { success: true, connected: mitsubishiClient.connected, protocol: 'mitsubishi' };
          } else {
            result = { success: true, connected: modbusClient.connected, protocol: 'modbus' };
          }
          break;

        default:
          result = { success: false, error: '未知消息类型' };
      }

      ws.send(JSON.stringify({ id: parsedData.id, type: parsedData.type, ...result }));
    } catch (error) {
      ws.send(JSON.stringify({ id: parsedData?.id || 'unknown', success: false, error: error.message }));
    }
  });

  ws.on('close', async () => {
    console.log('[WS] 客户端断开，清理PLC连接');
    if (currentProtocol === 's7' && s7Client.connected) {
      await s7Client.disconnect();
    } else if (currentProtocol === 'modbus' && modbusClient.connected) {
      await modbusClient.disconnect();
    } else if (currentProtocol === 'mitsubishi' && mitsubishiClient.connected) {
      await mitsubishiClient.disconnect();
    }
    currentProtocol = null;
  });
});
