const ModbusRTU = require('modbus-serial');

const client = new ModbusRTU();

// 新的地址映射
const MODBUS_ADDRESSES = {
  // 控制信号（PLC输出）
  START: 1,                      // 00001 启动
  RESET: 2,                      // 00002 复位
  FEED_CYLINDER_VALVE: 101,      // 00101 上料气缸伸出阀（单电控）
  SORTING1_CYLINDER_VALVE: 102,  // 00102 推料1气缸伸出阀（单电控）
  SORTING2_CYLINDER_VALVE: 103,  // 00103 推料2气缸伸出阀（单电控）
  CONVEYOR: 104,                 // 00104 传送带

  // 传感器反馈（PLC输入）
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

async function testManual() {
  try {
    console.log('=== 手动Modbus测试 ===\n');
    
    // 连接
    console.log('【步骤1】连接到ModbusTCP服务器');
    await client.connectTCP('127.0.0.1', { port: 502 });
    console.log('✅ 连接成功\n');
    
    client.setTimeout(5000);
    
    // 测试1: 读取按钮（启动/复位）
    console.log('【测试1】读取按钮信号（地址1-2）');
    const buttons = await client.readCoils(1, 2);
    console.log('✅ 读取成功:', buttons.data);
    console.log('  启动按钮(地址1):', buttons.data[0]);
    console.log('  复位按钮(地址2):', buttons.data[1], '\n');
    
    // 测试2: 读取传感器（地址3-11）
    console.log('【测试2】读取传感器信号（地址3-11）');
    const sensors = await client.readCoils(3, 9);
    console.log('✅ 读取成功:', sensors.data);
    console.log('  上料传感器(地址3):', sensors.data[0]);
    console.log('  色标传感器(地址4):', sensors.data[1]);
    console.log('  物料传感器(地址5):', sensors.data[2]);
    console.log('  上料气缸伸出限位(地址6):', sensors.data[3]);
    console.log('  上料气缸缩回限位(地址7):', sensors.data[4]);
    console.log('  推料1气缸伸出限位(地址8):', sensors.data[5]);
    console.log('  推料1气缸缩回限位(地址9):', sensors.data[6]);
    console.log('  推料2气缸伸出限位(地址10):', sensors.data[7]);
    console.log('  推料2气缸缩回限位(地址11):', sensors.data[8], '\n');
    
    // 测试3: 写入传感器信号
    console.log('【测试3】写入传感器信号');
    console.log('写入上料传感器(地址3) = true');
    await client.writeCoil(3, true);
    
    console.log('写入色标传感器(地址4) = false');
    await client.writeCoil(4, false);
    
    console.log('写入物料传感器(地址5) = true');
    await client.writeCoil(5, true);
    
    console.log('✅ 写入完成\n');
    
    // 测试4: 验证传感器写入
    console.log('【测试4】验证传感器写入');
    const verifySensors = await client.readCoils(3, 3);
    console.log('✅ 验证结果:', verifySensors.data);
    console.log('  预期: [true, false, true]');
    console.log('  实际: [', verifySensors.data[0], ',', verifySensors.data[1], ',', verifySensors.data[2], ']', '\n');
    
    // 测试5: 读取输出控制信号
    console.log('【测试5】读取输出控制信号（地址101-104）');
    const controls = await client.readCoils(101, 4);
    console.log('✅ 读取成功:', controls.data);
    console.log('  上料气缸阀(地址101):', controls.data[0]);
    console.log('  推料1气缸阀(地址102):', controls.data[1]);
    console.log('  推料2气缸阀(地址103):', controls.data[2]);
    console.log('  传送带(地址104):', controls.data[3], '\n');
    
    // 测试6: 写入磁性开关
    console.log('【测试6】写入磁性开关信号');
    console.log('写入上料气缸缩回限位(地址7) = true');
    await client.writeCoil(7, true);
    
    console.log('写入推料1气缸缩回限位(地址9) = true');
    await client.writeCoil(9, true);
    
    console.log('写入推料2气缸缩回限位(地址11) = true');
    await client.writeCoil(11, true);
    
    console.log('✅ 写入完成\n');
    
    // 测试7: 验证磁性开关写入
    console.log('【测试7】验证磁性开关写入');
    const verifyMagnetics = await client.readCoils(7, 5);
    console.log('✅ 验证结果:', verifyMagnetics.data);
    console.log('  上料气缸缩回限位(地址7):', verifyMagnetics.data[0]);
    console.log('  推料1气缸伸出限位(地址8):', verifyMagnetics.data[1]);
    console.log('  推料1气缸缩回限位(地址9):', verifyMagnetics.data[2]);
    console.log('  推料2气缸伸出限位(地址10):', verifyMagnetics.data[3]);
    console.log('  推料2气缸缩回限位(地址11):', verifyMagnetics.data[4], '\n');
    
    // 测试8: 读取所有相关线圈
    console.log('【测试8】读取所有相关线圈（地址1-11和101-104）');
    const part1 = await client.readCoils(1, 11);
    const part2 = await client.readCoils(101, 4);
    console.log('✅ 地址1-11:', part1.data);
    console.log('✅ 地址101-104:', part2.data, '\n');
    
    console.log('=== 所有测试完成 ===');
    console.log('✅ 所有读写操作成功\n');
    
  } catch (error) {
    console.error('=== 测试失败 ===');
    console.error('错误:', error.message);
    console.error('堆栈:', error.stack);
  } finally {
    if (client.isOpen) {
      await client.close();
      console.log('连接已关闭');
    }
  }
}

testManual().catch(console.error);