/**
 * S7 Communication 通信延迟测试脚本
 * 测试环境: TIA Portal + PLCSIM + NetToPLCSim
 * 用于填充论文表3的S7协议延迟数据
 *
 * 用法:
 *   node test-s7.js [host] [port] [rack] [slot]
 *   默认: node test-s7.js 127.0.0.1 102 0 1
 *
 * 前置条件:
 *   1. TIA Portal 中打开项目并启动 PLCSIM 仿真
 *   2. 启动 NetToPLCSim（将 127.0.0.1:102 转发到 PLCSIM）
 *   3. 确保 CPU 属性中启用了 PUT/GET 功能
 */

const nodes7 = require('nodes7');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ==================== 配置 ====================

const HOST = process.argv[2] || '127.0.0.1';
const PORT = parseInt(process.argv[3]) || 102;
const RACK = parseInt(process.argv[4]) || 0;
const SLOT = parseInt(process.argv[5]) || 1;

// 测试次数（与Modbus测试保持一致）
const READ_COUNT = 4200;
const WRITE_COUNT = 3000;

// 每N次操作打印一次中间统计
const STATS_INTERVAL = 100;

// S7 变量定义（与 server.js 保持一致）
const S7_VARIABLES = {
  START: 'M10.0',
  RESET: 'M10.1',
  FEED_CYLINDER_VALVE: 'M100.0',
  SORTING1_CYLINDER_VALVE: 'M101.0',
  SORTING2_CYLINDER_VALVE: 'M102.0',
  CONVEYOR: 'M103.0',
  SIGNAL_RED: 'M104.0',
  SIGNAL_GREEN: 'M105.0',
  SIGNAL_YELLOW: 'M106.0',
  MAGNETIC_FEED_RETRACT: 'M12.0',
  MAGNETIC_FEED_EXTEND: 'M12.1',
  MAGNETIC_SORTING1_RETRACT: 'M14.0',
  MAGNETIC_SORTING1_EXTEND: 'M14.1',
  MAGNETIC_SORTING2_RETRACT: 'M16.0',
  MAGNETIC_SORTING2_EXTEND: 'M16.1',
  SENSOR_FEED: 'M18.0',
  SENSOR_COLOR: 'M19.0',
  SENSOR_MATERIAL: 'M20.0',
  STOP: 'M21.0',
};

// 用于写测试的变量子集（写操作只需交替写几个变量）
const WRITE_VARS = ['START', 'RESET', 'CONVEYOR', 'STOP'];

// ==================== 工具函数 ====================

function getDesktopPath() {
  const desktop = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(desktop)) return desktop;
  const cn = path.join(os.homedir(), '桌面');
  if (fs.existsSync(cn)) return cn;
  return __dirname;
}

function calcStats(arr) {
  if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0, count: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    count: sorted.length,
  };
}

function printStats(readLatencies, writeLatencies) {
  const rs = calcStats(readLatencies);
  const ws = calcStats(writeLatencies);
  const total = rs.count + ws.count;

  console.log(
    `\n${'─'.repeat(55)}\n` +
    `[进度] 读: ${rs.count}/${READ_COUNT} | 写: ${ws.count}/${WRITE_COUNT} | 合计: ${total}\n` +
    `  读 → 平均: ${rs.avg}ms  P95: ${rs.p95}ms  最大: ${rs.max}ms\n` +
    `  写 → 平均: ${ws.avg}ms  P95: ${ws.p95}ms  最大: ${ws.max}ms\n` +
    `${'─'.repeat(55)}`
  );
}

function printFinalReport(readLatencies, writeLatencies, startTime) {
  const rs = calcStats(readLatencies);
  const ws = calcStats(writeLatencies);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const now = new Date();
  const report = [
    '',
    '='.repeat(60),
    '   S7 Communication 通信延迟测试报告',
    '='.repeat(60),
    '',
    `  测试时间:     ${now.toLocaleString('zh-CN')}`,
    `  测试环境:     TIA Portal + PLCSIM + NetToPLCSim`,
    `  连接参数:     ${HOST}:${PORT}  Rack=${RACK} Slot=${SLOT}`,
    `  测试耗时:     ${elapsed}s`,
    '',
    `  读操作:`,
    `    请求次数:   ${rs.count}`,
    `    平均延迟:   ${rs.avg}ms`,
    `    P95延迟:    ${rs.p95}ms`,
    `    最小延迟:   ${rs.min}ms`,
    `    最大延迟:   ${rs.max}ms`,
    '',
    `  写操作:`,
    `    请求次数:   ${ws.count}`,
    `    平均延迟:   ${ws.avg}ms`,
    `    P95延迟:    ${ws.p95}ms`,
    `    最小延迟:   ${ws.min}ms`,
    `    最大延迟:   ${ws.max}ms`,
    '',
    '-'.repeat(60),
    '  论文表3填写参考:',
    `    读操作平均延迟:  ${rs.avg}ms`,
    `    读操作P95延迟:   ${rs.p95}ms`,
    `    写操作平均延迟:  ${ws.avg}ms`,
    `    写操作P95延迟:   ${ws.p95}ms`,
    `    最大延迟:         ${Math.max(rs.max, ws.max)}ms`,
    '='.repeat(60),
    '',
  ].join('\n');

  console.log(report);

  // 保存到文件
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  const reportFile = path.join(__dirname, `延迟测试报告_S7_${dateStr}.txt`);
  fs.writeFileSync(reportFile, report, 'utf-8');
  console.log(`报告已保存到: ${reportFile}`);

  // 同时输出到桌面日志
  const desktopLog = path.join(getDesktopPath(), 'latency_s7.log');
  fs.appendFileSync(desktopLog, report);
}

// ==================== 主测试流程 ====================

async function runTest() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     S7 Communication 通信延迟测试工具            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n连接参数: ${HOST}:${PORT}  Rack=${RACK}  Slot=${SLOT}`);
  console.log(`计划: ${READ_COUNT}次读 + ${WRITE_COUNT}次写`);
  console.log('');

  const readLatencies = [];
  const writeLatencies = [];
  const startTime = Date.now();
  let s7 = null;

  // ========== 步骤1: 连接S7 ==========
  console.log('[1/4] 正在连接S7 PLC...');
  s7 = new nodes7();

  await new Promise((resolve, reject) => {
    s7.initiateConnection(
      { port: PORT, host: HOST, rack: RACK, slot: SLOT },
      (err) => {
        if (err) {
          let errMsg = String(err);
          if (errMsg.includes("ISO didn't") || errMsg.includes('ISO did not')) {
            errMsg = 'TCP已连接但ISO握手失败 — 请在博途中启用 PUT/GET 功能\n  → CPU属性 → Protection → Allow PUT/GET communication from remote partner';
          } else if (errMsg.includes('ECONNREFUSED')) {
            errMsg = '连接被拒绝 — 请检查:\n  1. NetToPLCSim是否已启动?\n  2. PLCSIM仿真是否已运行?\n  3. 端口是否正确?';
          } else if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timed out')) {
            errMsg = '连接超时 — 请检查IP地址和端口，防火墙是否放行';
          } else if (errMsg.includes('EHOSTUNREACH')) {
            errMsg = '主机不可达 — 请检查网络连接';
          }
          reject(new Error(errMsg));
        } else {
          resolve();
        }
      }
    );
  });

  console.log(`✅ S7连接成功! isoConnectionState=${s7.isoConnectionState}`);

  // ========== 步骤2: 注册变量 ==========
  console.log('\n[2/4] 正在注册变量...');
  const varNames = Object.keys(S7_VARIABLES);
  s7.setTranslationCB((tag) => S7_VARIABLES[tag] || tag);
  s7.addItems(varNames);
  console.log(`✅ 已注册 ${varNames.length} 个变量: ${varNames.join(', ')}`);

  // ========== 步骤3: 读操作测试 ==========
  console.log(`\n[3/4] 开始读操作测试 (目标: ${READ_COUNT}次)...`);
  console.log('(每次读取全部变量，通过readAllItems)\n');

  for (let i = 0; i < READ_COUNT; i++) {
    const t0 = Date.now();
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('读超时')), 5000);
        s7.readAllItems((err) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        });
      });
      readLatencies.push(Date.now() - t0);
    } catch (e) {
      console.error(`  ❌ 读操作 #${i + 1} 失败: ${e.message}`);
      // 失败也记录延迟（用于超时统计）
      readLatencies.push(Date.now() - t0);
    }

    // 每STATS_INTERVAL次打印中间统计
    if ((i + 1) % STATS_INTERVAL === 0) {
      printStats(readLatencies, writeLatencies);
    }
  }

  console.log('\n✅ 读操作测试完成');
  printStats(readLatencies, writeLatencies);

  // ========== 步骤4: 写操作测试 ==========
  console.log(`\n[4/4] 开始写操作测试 (目标: ${WRITE_COUNT}次)...`);
  console.log(`(交替写入: ${WRITE_VARS.join(', ')})\n`);

  for (let i = 0; i < WRITE_COUNT; i++) {
    const varName = WRITE_VARS[i % WRITE_VARS.length];
    const value = (i % 2 === 0); // 交替写入 true/false

    const t0 = Date.now();
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('写超时')), 5000);
        s7.writeItems(varName, value, (err) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        });
      });
      writeLatencies.push(Date.now() - t0);
    } catch (e) {
      console.error(`  ❌ 写操作 #${i + 1} (${varName}=${value}) 失败: ${e.message}`);
      writeLatencies.push(Date.now() - t0);
    }

    // 每STATS_INTERVAL次打印中间统计
    if ((i + 1) % STATS_INTERVAL === 0) {
      printStats(readLatencies, writeLatencies);
    }
  }

  console.log('\n✅ 写操作测试完成');

  // ========== 最终报告 ==========
  printFinalReport(readLatencies, writeLatencies, startTime);

  // ========== 断开连接 ==========
  console.log('\n正在断开S7连接...');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log('断开连接超时，强制退出');
      resolve();
    }, 3000);
    s7.dropConnection(() => {
      clearTimeout(timer);
      console.log('✅ S7连接已断开');
      resolve();
    });
  });

  process.exit(0);
}

// ==================== 启动 ====================

runTest().catch((err) => {
  console.error('\n❌ 测试失败:', err.message);
  console.error('\n请检查:');
  console.error('  1. TIA Portal 是否已打开项目并启动 PLCSIM 仿真?');
  console.error('  2. NetToPLCSim 是否已启动并配置了正确的IP和端口?');
  console.error('  3. CPU属性中是否已启用 PUT/GET 功能?');
  console.error('  4. 防火墙是否放行了端口 102?');
  process.exit(1);
});