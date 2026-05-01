const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('WebSocket连接成功');
  
  // 测试连接到ModbusTCP
  const connectMessage = {
    type: 'connect',
    host: '127.0.0.1',
    port: 502,
    id: 'test_connect_1'
  };
  
  console.log('发送连接请求:', connectMessage);
  ws.send(JSON.stringify(connectMessage));
});

ws.on('message', (data) => {
  console.log('收到消息:', data.toString());
  const response = JSON.parse(data.toString());
  console.log('解析后的响应:', response);
  
  if (response.type === 'connect') {
    console.log('连接测试结果:', response.success ? '成功' : '失败');
    if (!response.success) {
      console.log('错误信息:', response.error);
    }
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('WebSocket错误:', error);
});

ws.on('close', () => {
  console.log('WebSocket连接关闭');
  process.exit(0);
});

// 设置超时
setTimeout(() => {
  console.log('测试超时');
  ws.close();
  process.exit(1);
}, 10000);