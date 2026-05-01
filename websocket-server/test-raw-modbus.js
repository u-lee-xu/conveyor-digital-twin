const net = require('net');

// 创建TCP连接测试
const client = new net.Socket();

client.connect(502, '127.0.0.1', () => {
  console.log('已连接到ModbusTCP服务器');
  
  // 测试1: 我的实现格式
  console.log('\n=== 测试1: 我的格式 ===');
  const myBuffer = Buffer.alloc(12);
  myBuffer.writeUInt16BE(1, 0);    // 事务ID
  myBuffer.writeUInt16BE(0, 2);    // 协议ID
  myBuffer.writeUInt16BE(6, 4);    // 长度
  myBuffer.writeUInt8(1, 6);       // 单元ID
  myBuffer.writeUInt8(0x01, 7);    // 功能码
  myBuffer.writeUInt16BE(1, 8);    // 起始地址
  myBuffer.writeUInt16BE(1, 10);   // 线圈数量
  
  console.log('发送请求:', myBuffer.toString('hex'));
  client.write(myBuffer);
});

let responseData = Buffer.alloc(0);

client.on('data', (data) => {
  console.log('\n=== 收到响应 ===');
  console.log('原始数据:', data.toString('hex'));
  console.log('数据长度:', data.length);
  
  if (data.length >= 9) {
    console.log('事务ID:', data.readUInt16BE(0));
    console.log('协议ID:', data.readUInt16BE(2));
    console.log('长度:', data.readUInt16BE(4));
    console.log('单元ID:', data.readUInt8(6));
    console.log('功能码:', data.readUInt8(7));
    
    if (data.readUInt8(7) === 0x01) {
      const byteCount = data.readUInt8(8);
      console.log('字节计数:', byteCount);
      console.log('线圈值:', (data.readUInt8(9) & 0x01) === 1);
    }
  }
  
  responseData = Buffer.concat([responseData, data]);
});

client.on('error', (err) => {
  console.error('错误:', err);
});

setTimeout(() => {
  console.log('\n=== 5秒后关闭连接 ===');
  if (responseData.length === 0) {
    console.log('没有收到任何响应！');
  }
  client.end();
  process.exit(0);
}, 5000);