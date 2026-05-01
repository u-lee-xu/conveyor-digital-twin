const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function testDetailed() {
  try {
    console.log('=== 详细测试离散输入 ===');
    
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 首先测试线圈，确保连接正常
    console.log('\n【参考】读取线圈 0-9（确保连接正常）');
    try {
      const coils = await client.readCoils(0, 10);
      console.log('✅ 线圈读取成功:', coils.data);
    } catch (error) {
      console.log('❌ 线圈读取失败:', error.message);
    }
    
    // 尝试不同地址范围的离散输入
    const testRanges = [
      { name: '0-0 (单个地址)', address: 0, length: 1 },
      { name: '0-1', address: 0, length: 2 },
      { name: '0-4', address: 0, length: 5 },
      { name: '1-1 (地址1)', address: 1, length: 1 },
      { name: '10-10 (地址10)', address: 10, length: 1 },
      { name: '0-15', address: 0, length: 16 },
      { name: '16-31', address: 16, length: 16 },
      { name: '0-7', address: 0, length: 8 },
    ];
    
    for (const range of testRanges) {
      console.log(`\n测试离散输入 ${range.name}`);
      try {
        const inputs = await client.readDiscreteInputs(range.address, range.length);
        console.log(`✅ 成功: [${range.address}-${range.address + range.length - 1}] =`, inputs.data);
      } catch (error) {
        console.log(`❌ 失败: ${error.message}`);
      }
    }
    
    // 尝试检查服务器的设备信息（如果有）
    console.log('\n尝试读取设备标识（如果有支持）');
    try {
      const deviceInfo = await client.readDeviceIdentification(0x01, 0x00);
      console.log('✅ 设备信息:', deviceInfo);
    } catch (error) {
      console.log('❌ 设备信息读取失败:', error.message);
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

testDetailed().catch(console.error);