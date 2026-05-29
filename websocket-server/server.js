const WebSocket = require('ws');
const net = require('net');

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

class SimpleModbusTCP {
  constructor() {
    this.client = null;
    this.connected = false;
    this.transactionId = 0;
    this.pendingRequests = new Map();
    this.receiveBuffer = Buffer.alloc(0);
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
          resolve({ success: true });
        });
      });
    }
    return { success: true };
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

        this.pendingRequests.set(tid, { resolve, timeout, address, length });
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

        this.pendingRequests.set(tid, { resolve, timeout, address, value });
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

        this.pendingRequests.set(tid, { resolve, timeout, address, length: count });
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

  _isNodes7Connected() {
    if (!this.nodes7) return false;
    return this.nodes7.connectionID != null;
  }

  _startConnCheck() {
    if (this._connCheckInterval) clearInterval(this._connCheckInterval);
    this._connCheckInterval = setInterval(() => {
      if (this.connected && !this._isNodes7Connected()) {
        console.log('[S7] 检测到连接丢失 (connectionID=null)');
        this.connected = false;
      }
    }, 2000);
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
              resolve({ success: false, error: String(err) });
            } else {
              console.log(`[S7] 连接成功: ${host}:${port || 102} (Rack:${rack}, Slot:${slot})`);
              this.connected = true;

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
          resolve({ success: true });
        }, 3000);

        try {
          oldNodes7.dropConnection(() => {
            clearTimeout(timeout);
            console.log('[S7] 连接已断开');
            resolve({ success: true });
          });
        } catch {
          clearTimeout(timeout);
          resolve({ success: true });
        }
      });
    }
    return { success: true };
  }

  async readVars(varNames) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Connected()) {
      this.connected = false;
      return { success: false, error: 'S7连接已丢失' };
    }

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.readAllItems((err, values) => {
              if (err) {
                console.error('[S7] readAllItems 错误:', err);
                if (String(err).includes('disconnect') || String(err).includes('timeout')) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                const filtered = {};
                for (const name of varNames) {
                  if (values && values[name] !== undefined) {
                    filtered[name] = !!values[name];
                  } else {
                    filtered[name] = false;
                  }
                }
                console.log('[S7] 读取成功:', JSON.stringify(filtered));
                resolve({ success: true, values: filtered });
              }
            });
          } catch (e) {
            console.error('[S7] readAllItems 异常:', e);
            resolve({ success: false, error: e.message });
          }
        }),
        3000,
        'readVars'
      ).catch((e) => {
        console.error('[S7] readVars 超时或异常:', e.message);
        return { success: false, error: e.message };
      });
    });
  }

  async writeVar(varName, value) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Connected()) {
      this.connected = false;
      return { success: false, error: 'S7连接已丢失' };
    }

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.writeItems(varName, value, (err) => {
              if (err) {
                console.error('[S7] 写入失败:', varName, value, err);
                if (String(err).includes('disconnect') || String(err).includes('timeout')) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                console.log('[S7] 写入成功:', varName, '=', value);
                resolve({ success: true });
              }
            });
          } catch (e) {
            console.error('[S7] 写入异常:', varName, value, e);
            resolve({ success: false, error: e.message });
          }
        }),
        3000,
        'writeVar'
      ).catch((e) => {
        console.error('[S7] writeVar 超时或异常:', e.message);
        return { success: false, error: e.message };
      });
    });
  }

  async writeVars(varNames, values) {
    if (!this.connected || !this.nodes7) {
      return { success: false, error: 'S7未连接' };
    }
    if (!this._isNodes7Connected()) {
      this.connected = false;
      return { success: false, error: 'S7连接已丢失' };
    }

    return this._enqueue(() => {
      return this._withTimeout(
        new Promise((resolve) => {
          try {
            this.nodes7.writeItems(varNames, values, (err) => {
              if (err) {
                console.error('[S7] 批量写入失败:', varNames, err);
                if (String(err).includes('disconnect') || String(err).includes('timeout')) {
                  this.connected = false;
                }
                resolve({ success: false, error: String(err) });
              } else {
                console.log('[S7] 批量写入成功:', varNames.join(','));
                resolve({ success: true });
              }
            });
          } catch (e) {
            console.error('[S7] 批量写入异常:', varNames, e);
            resolve({ success: false, error: e.message });
          }
        }),
        3000,
        'writeVars'
      ).catch((e) => {
        console.error('[S7] writeVars 超时或异常:', e.message);
        return { success: false, error: e.message };
      });
    });
  }
}

const wss = new WebSocket.Server({ port: 8081 });
const modbusClient = new SimpleModbusTCP();
const s7Client = new SimpleS7Client();
let currentProtocol = null;

console.log('WebSocket服务器启动在端口 8081');
console.log('支持协议: Modbus TCP, Siemens S7 (ISO over TCP)');

async function gracefulShutdown() {
  console.log('正在优雅关闭...');
  if (currentProtocol === 's7' && s7Client.connected) {
    await s7Client.disconnect();
  } else if (currentProtocol === 'modbus' && modbusClient.connected) {
    await modbusClient.disconnect();
  }
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
          } else {
            result = await modbusClient.connect(parsedData.host, parsedData.port || 502);
          }
          break;

        case 'disconnect':
          if (currentProtocol === 's7') {
            result = await s7Client.disconnect();
          } else {
            result = await modbusClient.disconnect();
          }
          currentProtocol = null;
          break;

        case 'write-coil':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用write-var替代write-coil' };
          } else {
            result = await modbusClient.writeCoil(parsedData.address, parsedData.value);
          }
          break;

        case 'write-coils':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用write-vars替代write-coils' };
          } else {
            result = await modbusClient.writeCoils(parsedData.address, parsedData.values);
          }
          break;

        case 'read-coils':
          if (currentProtocol === 's7') {
            result = { success: false, error: 'S7协议使用read-vars替代read-coils' };
          } else {
            result = await modbusClient.readCoils(parsedData.address, parsedData.length);
          }
          break;

        case 'write-var':
          result = await s7Client.writeVar(parsedData.name, parsedData.value);
          break;

        case 'write-vars':
          result = await s7Client.writeVars(parsedData.names, parsedData.values);
          break;

        case 'read-vars':
          result = await s7Client.readVars(parsedData.names);
          break;

        case 'get-status':
          if (currentProtocol === 's7') {
            result = { success: true, connected: s7Client.connected, protocol: 's7' };
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
});
