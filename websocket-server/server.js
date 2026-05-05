const WebSocket = require('ws');
const net = require('net');

// Modbus地址定义（全部使用线圈）
const MODBUS_ADDRESSES = {
  // 控制信号（PLC输出）- 线圈
  START: 0,                      // 00001 启动 (M0)
  RESET: 1,                      // 00002 复位 (M1)
  FEED_CYLINDER_VALVE: 100,      // 00101 上料气缸伸出阀 (M100)
  SORTING1_CYLINDER_VALVE: 101,  // 00102 推料1气缸伸出阀 (M101)
  SORTING2_CYLINDER_VALVE: 102,  // 00103 推料2气缸伸出阀 (M102)
  CONVEYOR: 103,                 // 00104 传送带 (M103)

  // 传感器反馈（PLC输入）- 线圈
  SENSOR_FEED: 8,                // 00009 上料传感器 (M8)
  SENSOR_COLOR: 9,               // 00010 色标传感器 (M9)
  SENSOR_MATERIAL: 10,           // 00011 物料传感器 (M10)
  MAGNETIC_FEED_RETRACT: 2,      // 00003 上料气缸缩回限位 (M2)
  MAGNETIC_FEED_EXTEND: 3,       // 00004 上料气缸伸出限位 (M3)
  MAGNETIC_SORTING1_RETRACT: 4,  // 00005 推料1气缸缩回限位 (M4)
  MAGNETIC_SORTING1_EXTEND: 5,   // 00006 推料1气缸伸出限位 (M5)
  MAGNETIC_SORTING2_RETRACT: 6,  // 00007 推料2气缸缩回限位 (M6)
  MAGNETIC_SORTING2_EXTEND: 7,   // 00008 推料2气缸伸出限位 (M7)
};

class SimpleModbusTCP {
  constructor() {
    this.client = null;
    this.connected = false;
    this.transactionId = 0;
    this.pendingRequests = new Map(); // 存储待处理的请求
    this.receiveBuffer = Buffer.alloc(0); // TCP粘包处理缓冲区
  }

  async connect(host, port) {
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();
      
      this.client.on('connect', () => {
        this.connected = true;
        console.log(`ModbusTCP连接成功: ${host}:${port}`);
        
        // 设置持久化数据处理器（正确处理TCP粘包和分包）
        this.client.on('data', (data) => {
          // 将新数据追加到缓冲区
          this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

          // 循环解析所有完整的Modbus TCP帧
          while (this.receiveBuffer.length >= 8) {
            const msgLength = this.receiveBuffer.readUInt16BE(4); // 6字节头之后的数据长度
            const totalPacketSize = 6 + msgLength;

            // 等待更多数据（分包情况）
            if (this.receiveBuffer.length < totalPacketSize) break;

            // 取出一个完整帧
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
                  // 读取线圈响应
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
                  // 写入响应
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
        this.receiveBuffer = Buffer.alloc(0); // 重置缓冲区
        reject({ success: false, error: error.message });
      });

      this.client.on('close', () => {
        this.receiveBuffer = Buffer.alloc(0); // 断开时清空缓冲区
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
        buffer.writeUInt16BE(tid, 0); // TID
        buffer.writeUInt16BE(0, 2);   // Protocol
        buffer.writeUInt16BE(6, 4);   // Length
        buffer.writeUInt8(1, 6);      // Unit ID
        buffer.writeUInt8(0x01, 7);   // FC
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
        this.transactionId++;
        const tid = this.transactionId;
        const count = values.length;
        const byteCount = Math.ceil(count / 8);
        const buffer = Buffer.alloc(13 + byteCount);
        
        buffer.writeUInt16BE(tid, 0);
        buffer.writeUInt16BE(0, 2);
        buffer.writeUInt16BE(7 + byteCount, 4);
        buffer.writeUInt8(1, 6);
        buffer.writeUInt8(0x0F, 7); // FC 0x0F
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

const wss = new WebSocket.Server({ port: 8081 });
const modbusClient = new SimpleModbusTCP();

console.log('WebSocket服务器启动在端口 8081');

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    let parsedData = null;
    try {
      parsedData = JSON.parse(message);
      let result;
      switch (parsedData.type) {
        case 'connect': result = await modbusClient.connect(parsedData.host, parsedData.port); break;
        case 'disconnect': result = await modbusClient.disconnect(); break;
        case 'write-coil': result = await modbusClient.writeCoil(parsedData.address, parsedData.value); break;
        case 'write-coils': result = await modbusClient.writeCoils(parsedData.address, parsedData.values); break;
        case 'read-coils': result = await modbusClient.readCoils(parsedData.address, parsedData.length); break;
        case 'get-status': result = { success: true, connected: modbusClient.connected }; break;
        default: result = { success: false, error: '未知消息类型' };
      }
      ws.send(JSON.stringify({ id: parsedData.id, type: parsedData.type, ...result }));
    } catch (error) {
      ws.send(JSON.stringify({ id: parsedData?.id || 'unknown', success: false, error: error.message }));
    }
  });
});