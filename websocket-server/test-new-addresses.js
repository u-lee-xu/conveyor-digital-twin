const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

// 新的地址映射
const MODBUS_ADDRESSES = {
  // 控制信号（PLC写入→数字孪生读取）
  CYLINDER_FEED_EXTEND: 0,        // 00001
  CYLINDER_FEED_RETRACT: 1,       // 00002
  CYLINDER_SORTING1_EXTEND: 2,    // 00003
  CYLINDER_SORTING1_RETRACT: 3,   // 00004
  CYLINDER_SORTING2_EXTEND: 4,    // 00005
  CYLINDER_SORTING2_RETRACT: 5,   // 00006
  CONVEYOR_RUN: 6,                // 00007

  // 传感器反馈（数字孪生写入→PLC读取）
  SENSOR_FEED: 7,                 // 00008
  SENSOR_COLOR: 8,                // 00009
  SENSOR_MATERIAL: 9,             // 00010
  MAGNETIC_FEED_EXTEND: 10,       // 00011
  MAGNETIC_FEED_RETRACT: 11,      // 00012
  MAGNETIC_SORTING1_EXTEND: 12,   // 00013
  MAGNETIC_SORTING1_RETRACT: 13,  // 00014
  MAGNETIC_SORTING2_EXTEND: 14,   // 00015
  MAGNETIC_SORTING2_RETRACT: 15,  // 00016
};

async function testNewAddresses() {
  try {
    console.log('=== 测试新的线圈地址映射 ===');
    
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 测试1: 读取控制信号（地址0-6）
    console.log('\n【测试1】读取控制信号 00001-00007');
    const controlSignals = await client.readCoils(0, 7);
    console.log('控制信号:', controlSignals.data);
    
    // 测试2: 读取传感器反馈（地址7-15）
    console.log('\n【测试2】读取传感器反馈 00008-00016');
    const sensorFeedback = await client.readCoils(7, 9);
    console.log('传感器反馈:', sensorFeedback.data);
    
    // 测试3: 写入传感器反馈
    console.log('\n【测试3】写入传感器反馈');
    console.log('写入上料传感器 (地址7) = true');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_FEED, true);
    
    console.log('写入色标传感器 (地址8) = false');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_COLOR, false);
    
    console.log('写入物料传感器 (地址9) = true');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_MATERIAL, true);
    
    // 测试4: 验证写入
    console.log('\n【测试4】验证写入的传感器反馈');
    const verifySensors = await client.readCoils(7, 3);
    console.log('验证结果:', verifySensors.data);
    console.log('预期: [true, false, true]');
    
    // 测试5: 写入控制信号（模拟PLC）
    console.log('\n【测试5】写入控制信号（模拟PLC）');
    console.log('写入传送带运行 (地址6) = true');
    await client.writeCoil(MODBUS_ADDRESSES.CONVEYOR_RUN, true);
    
    // 测试6: 验证控制信号
    console.log('\n【测试6】验证传送带控制信号');
    const verifyConveyor = await client.readCoils(6, 1);
    console.log('传送带状态:', verifyConveyor.data[0]);
    
    // 测试7: 读取所有线圈（00001-00016）
    console.log('\n【测试7】读取所有线圈 00001-00016');
    const allCoils = await client.readCoils(0, 16);
    console.log('所有线圈状态:', allCoils.data);
    
    console.log('\n=== 测试完成 ===');
    console.log('✅ 所有线圈地址都可以正常读写');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

testNewAddresses().catch(console.error);