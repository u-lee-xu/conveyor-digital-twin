const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function testInputRW() {
  try {
    console.log('=== 测试客户端对INPUT的读写能力 ===');
    
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 测试1: 读取离散输入
    console.log('\n【测试1】客户端读取离散输入 0-4（10001-10005）');
    try {
      const inputs = await client.readDiscreteInputs(0, 5);
      console.log('✅ 读取成功:', inputs.data);
      console.log('说明: 客户端可以读取离散输入');
    } catch (error) {
      console.log('❌ 读取失败:', error.message);
    }
    
    // 测试2: 尝试写入离散输入
    console.log('\n【测试2】客户端尝试写入离散输入 0 = true');
    try {
      // 标准Modbus协议不支持写入离散输入
      // 但我们可以尝试看看是否有非标准实现
      await client.writeDiscreteInputs(0, [true]);
      console.log('✅ 写入成功（如果有此结果，说明服务器支持非标准写入）');
    } catch (error) {
      console.log('❌ 写入失败:', error.message);
      console.log('说明: writeDiscreteInputs方法不存在或不支持');
    }
    
    // 测试3: 尝试用writeCoil写入离散输入地址
    console.log('\n【测试3】客户端尝试用writeCoil写入离散输入地址 0');
    try {
      await client.writeCoil(0, false);
      console.log('✅ 写入成功');
    } catch (error) {
      console.log('❌ 写入失败:', error.message);
      console.log('说明: 不能用writeCoil方法写入离散输入');
    }
    
    // 测试4: 再次读取离散输入确认值是否改变
    console.log('\n【测试4】再次读取离散输入 0-4 检查值是否改变');
    try {
      const inputsAfter = await client.readDiscreteInputs(0, 5);
      console.log('当前值:', inputsAfter.data);
      console.log('对比: 值应该没有改变，因为离散输入是只读的');
    } catch (error) {
      console.log('❌ 读取失败:', error.message);
    }
    
    // 测试5: 对比线圈的读写能力
    console.log('\n【对比测试】客户端对线圈的读写能力');
    console.log('读取线圈 0:');
    const coilRead = await client.readCoils(0, 1);
    console.log('线圈0值:', coilRead.data);
    
    console.log('写入线圈 0 = true:');
    await client.writeCoil(0, true);
    console.log('✅ 写入成功');
    
    console.log('再次读取线圈 0:');
    const coilReadAfter = await client.readCoils(0, 1);
    console.log('线圈0新值:', coilReadAfter.data);
    console.log('说明: 线圈可以读写');
    
    console.log('\n=== 结论 ===');
    console.log('客户端对离散输入（INPUT）的能力:');
    console.log('- ✅ 可以读取（readDiscreteInputs）');
    console.log('- ❌ 不能写入（标准Modbus协议限制）');
    console.log('');
    console.log('客户端对线圈（COIL）的能力:');
    console.log('- ✅ 可以读取（readCoils）');
    console.log('- ✅ 可以写入（writeCoil）');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('\n连接已关闭');
    }
  }
}

testInputRW().catch(console.error);