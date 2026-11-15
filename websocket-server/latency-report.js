'use strict';
/**
 * 三协议（Modbus TCP / S7 / 三菱 MX）通信延迟统计的单一来源。
 *
 * 之前三个协议类各有一份约 79 行的 _printLatencyStats，差异只有 4 行字符串，
 * 改 P95 定义 / 样本窗口 / 报告格式必须记得同步三处，漏一处就会让论文表 3
 * 的三协议对比混进口径不同的数字。这里把统计与格式化抽成纯函数，副作用
 * （console / 写日志 / 写最终报告）集中在 printLatencyStats，便于单测边界。
 */
const fs = require('fs');
const path = require('path');

/** 有界窗口：10Hz 课堂跑几小时也不能让延迟数组无限增长 */
const MAX_SAMPLES = 2000;

/** 三协议之间唯一的差异：控制台标签、报告文件名、协议标题、测试环境 */
const LATENCY_META = {
  modbus: {
    label: 'ModbusTCP',
    reportTag: 'ModbusTCP',
    protocol: 'ModbusTCP协议',
    env: 'AutoShop仿真',
  },
  s7: {
    label: 'S7',
    reportTag: 'S7',
    protocol: 'S7 Communication协议',
    env: 'TIA Portal + PLCSIM + NetToPLCSim',
  },
  mitsubishi: {
    label: '三菱MX',
    reportTag: '三菱MX',
    protocol: '三菱MX Component',
    env: '三菱FX3U via MX Component + GX Simulator 2',
  },
};

/** 原地裁剪到最近 MAX_SAMPLES 个样本；返回同一个 stats 的 read / write 数组 */
function trimSamples(stats) {
  const read = (stats && stats.read) || [];
  const write = (stats && stats.write) || [];
  if (read.length > MAX_SAMPLES) read.splice(0, read.length - MAX_SAMPLES);
  if (write.length > MAX_SAMPLES) write.splice(0, write.length - MAX_SAMPLES);
  return { read, write };
}

/** 纯函数：排序求 avg / min / max / p95；空数组返回全 0（与旧实现一致） */
function calcStats(arr) {
  if (!arr || arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
  };
}

/** YYYYMMDD_HHmm */
function dateSuffix(now) {
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
}

function reportFilePath(meta, now, outDir) {
  return path.join(outDir || __dirname, `延迟测试报告_${meta.reportTag}_${dateSuffix(now)}.txt`);
}

function formatConsole(meta, read, write, readStats, writeStats, timestamp) {
  return '\n' +
    '='.repeat(60) + '\n' +
    `[${meta.label} 通信延迟统计] ${timestamp}\n` +
    `读请求次数: ${read.length}, 平均: ${readStats.avg}ms, 最小: ${readStats.min}ms, 最大: ${readStats.max}ms, P95: ${readStats.p95}ms\n` +
    `写请求次数: ${write.length}, 平均: ${writeStats.avg}ms, 最小: ${writeStats.min}ms, 最大: ${writeStats.max}ms, P95: ${writeStats.p95}ms\n` +
    '='.repeat(60) + '\n';
}

function formatFinalReport(meta, read, write, readStats, writeStats, now) {
  return `通信延迟测试报告 - ${meta.protocol}\n` +
    `测试时间: ${now.toLocaleString('zh-CN')}\n` +
    `测试环境: ${meta.env}\n` +
    `${'='.repeat(50)}\n` +
    `\n` +
    `读操作:\n` +
    `  请求次数: ${read.length}\n` +
    `  平均延迟: ${readStats.avg}ms\n` +
    `  P95延迟:  ${readStats.p95}ms\n` +
    `  最小延迟: ${readStats.min}ms\n` +
    `  最大延迟: ${readStats.max}ms\n` +
    `\n` +
    `写操作:\n` +
    `  请求次数: ${write.length}\n` +
    `  平均延迟: ${writeStats.avg}ms\n` +
    `  P95延迟:  ${writeStats.p95}ms\n` +
    `  最小延迟: ${writeStats.min}ms\n` +
    `  最大延迟: ${writeStats.max}ms\n` +
    `\n` +
    `${'='.repeat(50)}\n` +
    `论文表3填写参考:\n` +
    `  读操作平均延迟: ${readStats.avg}ms\n` +
    `  读操作P95延迟:  ${readStats.p95}ms\n` +
    `  写操作平均延迟: ${writeStats.avg}ms\n` +
    `  写操作P95延迟:  ${writeStats.p95}ms\n` +
    `  最大延迟: ${Math.max(readStats.max, writeStats.max)}ms\n`;
}

/**
 * 副作用封装。三个协议类只调用本函数：
 *   printLatencyStats(this.latencyStats, LATENCY_META.modbus, { isFinal, logFile })
 * options: { isFinal, logFile, now, outDir, silent } —— now / outDir / silent 供单测注入。
 * 返回 { readStats, writeStats, output, reportFile? }，空样本返回 null。
 */
function printLatencyStats(stats, meta, options) {
  const opts = options || {};
  const { read, write } = trimSamples(stats);
  if (read.length + write.length === 0) return null;

  const readStats = calcStats(read);
  const writeStats = calcStats(write);
  const now = opts.now || new Date();
  const output = formatConsole(meta, read, write, readStats, writeStats, now.toISOString());

  if (!opts.silent) console.log(output);
  // 异步落盘：课堂 10Hz 下同步 I/O 会阻塞事件循环、抬高 PLC 读写延迟
  if (opts.logFile) {
    fs.appendFile(opts.logFile, output, (e) => {
      if (e) console.warn('[latency] 统计写盘失败:', e.message);
    });
  }

  const result = { readStats, writeStats, output };
  if (opts.isFinal) {
    const reportFile = reportFilePath(meta, now, opts.outDir);
    fs.writeFile(reportFile, formatFinalReport(meta, read, write, readStats, writeStats, now),
      'utf-8', (e) => { if (e) console.warn('[latency] 统计写盘失败:', e.message); });
    if (!opts.silent) console.log(`\n延迟测试报告已保存到: ${reportFile}`);
    result.reportFile = reportFile;
  }
  return result;
}

module.exports = {
  MAX_SAMPLES, LATENCY_META,
  trimSamples, calcStats, dateSuffix, reportFilePath,
  formatConsole, formatFinalReport, printLatencyStats,
};
