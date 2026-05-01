const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function testWriteDiscrete() {
  try {
    console.log('=== 测试离散输入写入 ===');
    
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 先读取当前值
    console.log('\n【初始状态】读取离散输入 0-2');
    const initial = await client.readDiscreteInputs(0, 3);
    console.log('初始值:', initial.data);
    
    // 尝试写入单个离散输入
    console.log('\n【测试1】尝试写入离散输入 0 = false');
    try {
      // 注意：modbus-serial库可能不支持直接写入离散输入
      // 我们尝试使用writeCoil方法
      await client.writeCoil(0, false);
      console.log('❌ writeCoil对离散输入地址0无效（预期）');
    } catch (error) {
      console.log('预期失败:', error.message);
    }
    
    // 读取线圈地址100+，看看是否能模拟离散输入
    console.log('\n【测试2】读取线圈 100（尝试模拟离散输入）');
    try {
      const coil100 = await client.readCoils(100, 1);
      console.log('线圈100值:', coil100.data);
    } catch (error) {
      console.log('❌ 线圈100不支持:', error.message);
    }
    
    // 验证离散输入的值是否被修改
    console.log('\n【验证】重新读取离散输入 0-2');
    const after = await client.readDiscreteInputs(0, 3);
    console.log('当前值:', after.data);
    
    // 测试不同范围的离散输入
    console.log('\n【测试3】读取所有支持的离散输入 0-15');
    const allInputs = await client.readDiscreteInputs(0, 16);
    console.log('所有离散输入值:', allInputs.data);
    
    console.log('\n=== 结论 ===');
    console.log('离散输入只能读取，不能写入（这是正常的）');
    console.log('在仿真模式下，数字孪生应该：');
    console.log('- 读取线圈0-9获取控制信号');
    console.log('- 读取离散输入0-15获取传感器状态');
    console.log('- 但离散输入的值需要通过其他方式更新');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

testWriteDiscrete().catch(console.error);