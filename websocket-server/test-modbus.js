const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function testModbus() {
  try {
    console.log('=== 开始测试ModbusTCP服务器 ===');
    console.log('连接到 127.0.0.1:502...');
    
    // 连接到ModbusTCP服务器
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    // 设置超时时间
    client.setTimeout(5000);
    
    // 测试1: 读取线圈（00001-00010）
    console.log('\n测试1: 读取线圈 00001-00010');
    try {
      const coils = await client.readCoils(0, 10);
      console.log('✅ 读取线圈成功:', coils.data);
    } catch (error) {
      console.log('❌ 读取线圈失败:', error.message);
    }
    
    // 测试2: 读取离散输入（10001-10010）
    console.log('\n测试2: 读取离散输入 10001-10010');
    try {
      const inputs = await client.readDiscreteInputs(0, 10);
      console.log('✅ 读取离散输入成功:', inputs.data);
    } catch (error) {
      console.log('❌ 读取离散输入失败:', error.message);
    }
    
    // 测试3: 写入线圈00001（上料气缸伸出）
    console.log('\n测试3: 写入线圈 00001 = true（上料气缸伸出）');
    try {
      await client.writeCoil(0, true);
      console.log('✅ 写入线圈 00001 成功');
    } catch (error) {
      console.log('❌ 写入线圈失败:', error.message);
    }
    
    // 测试4: 验证写入（再次读取线圈00001）
    console.log('\n测试4: 验证写入 - 读取线圈 00001');
    try {
      const verify = await client.readCoils(0, 1);
      console.log('✅ 验证结果:', verify.data[0]);
    } catch (error) {
      console.log('❌ 验证失败:', error.message);
    }
    
    // 测试5: 写入线圈00002（上料气缸缩回）
    console.log('\n测试5: 写入线圈 00002 = true（上料气缸缩回）');
    try {
      await client.writeCoil(1, true);
      console.log('✅ 写入线圈 00002 成功');
    } catch (error) {
      console.log('❌ 写入线圈失败:', error.message);
    }
    
    // 测试6: 读取所有线圈00001-00010
    console.log('\n测试6: 读取所有线圈 00001-00010');
    try {
      const allCoils = await client.readCoils(0, 10);
      console.log('✅ 所有线圈状态:', allCoils.data);
    } catch (error) {
      console.log('❌ 读取所有线圈失败:', error.message);
    }
    
    // 测试7: 尝试写入离散输入10001（使用线圈100模拟）
    console.log('\n测试7: 尝试写入离散输入 10001（使用线圈100模拟）');
    try {
      await client.writeCoil(100, true);
      console.log('✅ 写入离散输入（模拟）成功');
    } catch (error) {
      console.log('❌ 写入离散输入（模拟）失败:', error.message);
    }
    
    // 测试8: 验证离散输入写入
    console.log('\n测试8: 验证离散输入写入（读取线圈100）');
    try {
      const verifyInput = await client.readCoils(100, 1);
      console.log('✅ 验证结果:', verifyInput.data[0]);
    } catch (error) {
      console.log('❌ 验证失败:', error.message);
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('=== 测试过程中发生错误 ===');
    console.error('错误:', error);
  } finally {
    // 关闭连接
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

// 运行测试
testModbus().catch(console.error);