const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8081');

ws.on('open', () => {
  console.log('WebSocket连接成功');
  
  // 测试连接到ModbusTCP
  const connectMessage = {
    type: 'connect',
    host: '127.0.0.1',
    port: 502,
    id: 'test_connect_1'
  };
  
  console.log('发送连接请求:', JSON.stringify(connectMessage));
  ws.send(JSON.stringify(connectMessage));
});

ws.on('message', (data) => {
  console.log('收到消息:', data.toString());
  const response = JSON.parse(data.toString());
  
  if (response.type === 'connect') {
    console.log('连接测试结果:', response.success ? '成功' : '失败');
    
    if (response.success) {
      // 如果连接成功，尝试写入一个线圈
      const writeMessage = {
        type: 'write-coil',
        address: 100,
        value: true,
        id: 'test_write_1'
      };
      console.log('发送写入请求:', JSON.stringify(writeMessage));
      ws.send(JSON.stringify(writeMessage));
    } else {
      ws.close();
    }
  } else if (response.type === 'write-coil') {
    console.log('写入测试结果:', response.success ? '成功' : '失败');
    
    // 尝试读取线圈
    const readMessage = {
      type: 'read-coils',
      address: 100,
      length: 1,
      id: 'test_read_1'
    };
    console.log('发送读取请求:', JSON.stringify(readMessage));
    ws.send(JSON.stringify(readMessage));
  } else if (response.type === 'read-coils') {
    console.log('读取测试结果:', response.success ? '成功' : '失败', '值:', response.values);
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('WebSocket错误:', error);
});

ws.on('close', () => {
  console.log('WebSocket连接关闭');
});
