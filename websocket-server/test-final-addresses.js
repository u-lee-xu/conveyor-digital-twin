const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

// 新的地址映射（按用户要求）
const MODBUS_ADDRESSES = {
  // 控制信号（PLC输出）- 线圈
  START: 1,                      // 00001 启动
  RESET: 2,                      // 00002 复位
  FEED_CYLINDER_VALVE: 101,      // 00101 上料气缸伸出阀（单电控）
  SORTING1_CYLINDER_VALVE: 102,  // 00102 推料1气缸伸出阀（单电控）
  SORTING2_CYLINDER_VALVE: 103,  // 00103 推料2气缸伸出阀（单电控）
  CONVEYOR: 104,                 // 00104 传送带

  // 传感器反馈（PLC输入）- 线圈（使用地址3-11）
  SENSOR_FEED: 3,                // 00003 上料传感器
  SENSOR_COLOR: 4,               // 00004 色标传感器
  SENSOR_MATERIAL: 5,            // 00005 物料传感器
  MAGNETIC_FEED_EXTEND: 6,       // 00006 上料气缸伸出限位
  MAGNETIC_FEED_RETRACT: 7,      // 00007 上料气缸缩回限位
  MAGNETIC_SORTING1_EXTEND: 8,   // 00008 推料1气缸伸出限位
  MAGNETIC_SORTING1_RETRACT: 9,  // 00009 推料1气缸缩回限位
  MAGNETIC_SORTING2_EXTEND: 10,  // 00010 推料2气缸伸出限位
  MAGNETIC_SORTING2_RETRACT: 11, // 00011 推料2气缸缩回限位
};

async function testFinalAddresses() {
  try {
    console.log('=== 测试最终地址映射 ===');
    
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功');
    
    client.setTimeout(5000);
    
    // 测试1: 测试基本控制信号（地址1, 2）
    console.log('\n【测试1】测试基本控制信号');
    console.log('写入启动 (地址1) = true');
    await client.writeCoil(MODBUS_ADDRESSES.START, true);
    
    console.log('写入复位 (地址2) = false');
    await client.writeCoil(MODBUS_ADDRESSES.RESET, false);
    
    // 测试2: 测试控制设备（地址101-104）
    console.log('\n【测试2】测试控制设备（地址101-104）');
    console.log('写入上料气缸阀 (地址101) = false（单电控，无信号自动缩回）');
    await client.writeCoil(MODBUS_ADDRESSES.FEED_CYLINDER_VALVE, false);
    
    console.log('写入推料1气缸阀 (地址102) = false');
    await client.writeCoil(MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE, false);
    
    console.log('写入推料2气缸阀 (地址103) = false');
    await client.writeCoil(MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE, false);
    
    console.log('写入传送带 (地址104) = false');
    await client.writeCoil(MODBUS_ADDRESSES.CONVEYOR, false);
    
    // 测试3: 测试传感器反馈（地址3-11）
    console.log('\n【测试3】测试传感器反馈（地址3-11）');
    console.log('写入上料传感器 (地址3) = true');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_FEED, true);
    
    console.log('写入色标传感器 (地址4) = false');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_COLOR, false);
    
    console.log('写入物料传感器 (地址5) = true');
    await client.writeCoil(MODBUS_ADDRESSES.SENSOR_MATERIAL, true);
    
    // 测试4: 测试磁性开关
    console.log('\n【测试4】测试磁性开关（地址6-11）');
    console.log('上料气缸缩回状态 (地址7) = true（默认缩回）');
    await client.writeCoil(MODBUS_ADDRESSES.MAGNETIC_FEED_RETRACT, true);
    
    console.log('推料1气缸缩回状态 (地址9) = true');
    await client.writeCoil(MODBUS_ADDRESSES.MAGNETIC_SORTING1_RETRACT, true);
    
    console.log('推料2气缸缩回状态 (地址11) = true');
    await client.writeCoil(MODBUS_ADDRESSES.MAGNETIC_SORTING2_RETRACT, true);
    
    // 测试5: 验证所有写入
    console.log('\n【测试5】验证传感器反馈状态');
    const sensors = await client.readCoils(3, 9);
    console.log('传感器反馈 (地址3-11):', sensors.data);
    
    console.log('\n【测试6】验证控制设备状态');
    const controls = await client.readCoils(101, 4);
    console.log('控制设备 (地址101-104):', controls.data);
    
    console.log('\n【测试7】验证基本控制信号');
    const basic = await client.readCoils(1, 2);
    console.log('基本控制 (地址1-2):', basic.data);
    
    console.log('\n=== 测试完成 ===');
    console.log('地址映射:');
    console.log('- 启动/复位: 1-2');
    console.log('- 传感器反馈: 3-11');
    console.log('- 控制设备: 101-104');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

testFinalAddresses().catch(console.error);