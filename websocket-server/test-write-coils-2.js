const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('WebSocket连接成功');
  
  // 连接到ModbusTCP
  const connectMessage = {
    type: 'connect',
    host: '127.0.0.1',
    port: 502,
    id: 'test_connect'
  };
  
  console.log('发送连接请求...');
  ws.send(JSON.stringify(connectMessage));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('收到消息:', response);
  
  if (response.type === 'connect' && response.success) {
    console.log('✅ ModbusTCP连接成功');
    
    // 测试写入线圈1（启动按钮）
    console.log('\n测试1: 写入线圈1 = true（启动按钮按下）');
    ws.send(JSON.stringify({
      type: 'write-coil',
      address: 1,
      value: true,
      id: 'test_write_start'
    }));
  }
  
  if (response.type === 'write-coil' && response.id === 'test_write_start') {
    if (response.success) {
      console.log('✅ 写入启动按钮成功');
      
      setTimeout(() => {
        console.log('\n测试2: 写入线圈1 = false（启动按钮松开）');
        ws.send(JSON.stringify({
          type: 'write-coil',
          address: 1,
          value: false,
          id: 'test_write_release'
        }));
      }, 1000);
    } else {
      console.log('❌ 写入启动按钮失败:', response.error);
    }
  }
  
  if (response.type === 'write-coil' && response.id === 'test_write_release') {
    if (response.success) {
      console.log('✅ 释放启动按钮成功');
      
      setTimeout(() => {
        console.log('\n测试3: 写入线圈2 = true（停止按钮按下）');
        ws.send(JSON.stringify({
          type: 'write-coil',
          address: 2,
          value: true,
          id: 'test_write_stop'
        }));
      }, 1000);
    } else {
      console.log('❌ 释放启动按钮失败:', response.error);
    }
  }
  
  if (response.type === 'write-coil' && response.id === 'test_write_stop') {
    if (response.success) {
      console.log('✅ 写入停止按钮成功');
      console.log('\n✅ 所有测试完成');
    } else {
      console.log('❌ 写入停止按钮失败:', response.error);
    }
    
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 1000);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket错误:', error);
});

ws.on('close', () => {
  console.log('WebSocket连接关闭');
});

setTimeout(() => {
  console.log('测试超时');
  ws.close();
  process.exit(1);
}, 10000);