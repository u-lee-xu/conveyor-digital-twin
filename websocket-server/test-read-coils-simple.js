const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

let connectionCount = 0;
let readCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket连接成功');
  
  // 连接到ModbusTCP
  const connectMessage = {
    type: 'connect',
    host: '127.0.0.1',
    port: 502,
    id: 'test_connect'
  };
  
  console.log('发送连接请求...');
  ws.send(JSON.stringify(connectMessage));
  
  connectionCount++;
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log(`\n[${new Date().toLocaleTimeString()}] 收到消息:`, JSON.stringify(response, null, 2));
  
  if (response.type === 'connect' && response.success) {
    console.log('✅ ModbusTCP连接成功，开始测试读取功能');
    
    // 连续测试多次读取
    let testCount = 0;
    const maxTests = 10;
    
    const testRead = () => {
      if (testCount >= maxTests) {
        console.log(`\n✅ 测试完成：共测试${maxTests}次读取，成功${readCount}次`);
        ws.close();
        process.exit(0);
        return;
      }
      
      testCount++;
      console.log(`\n📝 测试 ${testCount}/${maxTests}: 读取线圈1`);
      
      ws.send(JSON.stringify({
        type: 'read-coils',
        address: 1,
        length: 1,
        id: `test_read_${testCount}`
      }));
    };
    
    // 立即开始第一次测试
    setTimeout(testRead, 500);
    
    // 设置定时器进行后续测试
    const testInterval = setInterval(() => {
      testRead();
    }, 1000);
    
    // 清理定时器
    setTimeout(() => {
      clearInterval(testInterval);
    }, maxTests * 1000 + 1000);
  }
  
  if (response.type === 'read-coils') {
    if (response.success) {
      readCount++;
      console.log(`✅ 读取成功，值:`, response.values);
    } else {
      console.log(`❌ 读取失败:`, response.error);
    }
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket错误:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket连接关闭');
  
  if (connectionCount === 0) {
    console.log('❌ 从未建立连接');
    process.exit(1);
  } else if (readCount === 0) {
    console.log('❌ 所有读取请求都失败了');
    process.exit(1);
  }
});

setTimeout(() => {
  console.log('⏰ 测试超时');
  ws.close();
  process.exit(1);
}, 15000);