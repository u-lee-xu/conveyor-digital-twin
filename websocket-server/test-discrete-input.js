const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

async function testDiscreteInputs() {
  try {
    console.log('=== 测试离散输入功能 ===');
    
    // 连接到ModbusTCP服务器
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 测试1: 读取离散输入 0-9（对应10001-10010）
    console.log('\n测试1: 读取离散输入 0-9（10001-10010）');
    try {
      const inputs = await client.readDiscreteInputs(0, 10);
      console.log('✅ 读取离散输入成功:', inputs.data);
    } catch (error) {
      console.log('❌ 读取离散输入失败:', error.message);
    }
    
    // 测试2: 读取离散输入 0-19
    console.log('\n测试2: 读取离散输入 0-19（10001-10020）');
    try {
      const inputs = await client.readDiscreteInputs(0, 20);
      console.log('✅ 读取离散输入成功:', inputs.data);
    } catch (error) {
      console.log('❌ 读取离散输入失败:', error.message);
    }
    
    // 测试3: 读取离散输入 100-109
    console.log('\n测试3: 读取离散输入 100-109');
    try {
      const inputs = await client.readDiscreteInputs(100, 10);
      console.log('✅ 读取离散输入成功:', inputs.data);
    } catch (error) {
      console.log('❌ 读取离散输入失败:', error.message);
    }
    
    // 测试4: 尝试写入离散输入（使用writeDiscreteInputs方法）
    console.log('\n测试4: 尝试写入离散输入（writeDiscreteInputs方法）');
    try {
      await client.writeDiscreteInputs(0, [true, false, true]);
      console.log('✅ 写入离散输入成功');
    } catch (error) {
      console.log('❌ 写入离散输入失败:', error.message);
    }
    
    // 测试5: 读取保持寄存器（看看是否有相关功能）
    console.log('\n测试5: 读取保持寄存器 0-9');
    try {
      const holding = await client.readHoldingRegisters(0, 10);
      console.log('✅ 读取保持寄存器成功:', holding.data);
    } catch (error) {
      console.log('❌ 读取保持寄存器失败:', error.message);
    }
    
    // 测试6: 读取输入寄存器
    console.log('\n测试6: 读取输入寄存器 0-9');
    try {
      const inputRegs = await client.readInputRegisters(0, 10);
      console.log('✅ 读取输入寄存器成功:', inputRegs.data);
    } catch (error) {
      console.log('❌ 读取输入寄存器失败:', error.message);
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

testDiscreteInputs().catch(console.error);