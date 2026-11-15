#!/usr/bin/env node
/**
 * 延迟统计公共模块单元测试（不需要实验室，不连 PLC）
 *
 *   node websocket-server/latency-report-check.cjs
 *
 * 覆盖重构前无法单测的边界：空样本、单样本、2000 样本窗口、p95 取整、
 * 日期后缀、三协议文案逐字一致、以及「同一组样本在三协议下统计口径相同」。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MAX_SAMPLES, LATENCY_META, trimSamples, calcStats, dateSuffix,
  reportFilePath, formatConsole, formatFinalReport, printLatencyStats,
} = require('./latency-report');

let pass = 0;
let total = 0;
const check = (name, ok, detail) => {
  total += 1;
  if (ok) pass += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail === undefined ? '' : ' · ' + JSON.stringify(detail)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. 统计边界
  check('空样本返回全 0', JSON.stringify(calcStats([])) === JSON.stringify({ avg: 0, min: 0, max: 0, p95: 0 }));
  check('单样本 avg/min/max/p95 一致', JSON.stringify(calcStats([7])) === JSON.stringify({ avg: 7, min: 7, max: 7, p95: 7 }));
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  const h = calcStats(hundred);
  check('1~100：avg=51 / min=1 / max=100 / p95=96',
    h.avg === 51 && h.min === 1 && h.max === 100 && h.p95 === 96, h);
  check('calcStats 不改原数组顺序', hundred[0] === 1 && hundred[99] === 100);
  check('双样本 p95 按 floor(n*0.95) 取较大值', calcStats([2, 1]).p95 === 2);

  // 2. 有界窗口
  const big = { read: Array.from({ length: 2500 }, (_, i) => i), write: [1, 2, 3] };
  const trimmed = trimSamples(big);
  check('超过 2000 样本裁剪到 2000', trimmed.read.length === MAX_SAMPLES && big.read.length === MAX_SAMPLES);
  check('裁剪保留最近样本（首=500）', trimmed.read[0] === 500 && trimmed.read[1999] === 2499);
  check('短数组不被裁剪', trimSamples({ read: [1], write: [] }).read.length === 1);

  // 3. 日期与报告路径
  const now = new Date(2026, 10, 14, 7, 5);
  check('日期后缀 YYYYMMDD_HHmm', dateSuffix(now) === '20261114_0705', dateSuffix(now));
  const rp = reportFilePath(LATENCY_META.modbus, now, '/tmp/dt-latency');
  check('报告文件名含协议标签与日期', rp.includes('延迟测试报告_ModbusTCP_20261114_0705.txt'), rp);

  // 4. 三协议文案与旧实现逐字一致
  const expected = {
    modbus: ['ModbusTCP', 'ModbusTCP', 'ModbusTCP协议', 'AutoShop仿真'],
    s7: ['S7', 'S7', 'S7 Communication协议', 'TIA Portal + PLCSIM + NetToPLCSim'],
    mitsubishi: ['三菱MX', '三菱MX', '三菱MX Component', '三菱FX3U via MX Component + GX Simulator 2'],
  };
  for (const [key, want] of Object.entries(expected)) {
    const m = LATENCY_META[key];
    check(`${key} 协议文案未漂移`, m.label === want[0] && m.reportTag === want[1]
      && m.protocol === want[2] && m.env === want[3], m);
  }

  // 5. 格式化模板
  const stats = { read: [10, 20, 30], write: [5, 15] };
  const rs = calcStats(stats.read);
  const ws = calcStats(stats.write);
  const consoleText = formatConsole(LATENCY_META.s7, stats.read, stats.write, rs, ws, '2026-11-14T00:00:00.000Z');
  check('控制台输出含协议标签与读写次数与 P95',
    consoleText.includes('[S7 通信延迟统计]') && consoleText.includes('读请求次数: 3')
    && consoleText.includes('写请求次数: 2') && consoleText.includes('P95: 30ms'));
  const report = formatFinalReport(LATENCY_META.mitsubishi, stats.read, stats.write, rs, ws, now);
  check('最终报告含协议标题 / 测试环境 / 论文表 3',
    report.includes('通信延迟测试报告 - 三菱MX Component')
    && report.includes('测试环境: 三菱FX3U via MX Component + GX Simulator 2')
    && report.includes('论文表3填写参考'));

  // 6. 同一组样本在三协议下统计口径必须相同（本次重构的核心保证）
  const results = Object.values(LATENCY_META).map((meta) =>
    printLatencyStats({ read: [...hundred], write: [1, 2, 3] }, meta, { silent: true, now }));
  check('三协议 readStats / writeStats 完全一致',
    results.every((r) => r && JSON.stringify(r.readStats) === JSON.stringify(results[0].readStats)
      && JSON.stringify(r.writeStats) === JSON.stringify(results[0].writeStats)));
  check('三协议控制台标签各自不同',
    new Set(results.map((r) => r.output.split('\n')[2])).size === 3);

  // 7. 副作用：空样本不写盘、非空写日志与最终报告
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-latency-check-'));
  try {
    const logFile = path.join(tmp, 'latency.log');
    const empty = printLatencyStats({ read: [], write: [] }, LATENCY_META.modbus,
      { silent: true, logFile, isFinal: true, outDir: tmp, now });
    await sleep(150);
    check('空样本返回 null 且不产生任何文件', empty === null && fs.readdirSync(tmp).length === 0,
      fs.readdirSync(tmp));

    const done = printLatencyStats(stats, LATENCY_META.modbus,
      { silent: true, logFile, isFinal: true, outDir: tmp, now });
    await sleep(200);
    check('非空样本写出日志文件', fs.existsSync(logFile) && fs.readFileSync(logFile, 'utf8').includes('[ModbusTCP 通信延迟统计]'));
    check('返回最终报告路径且报告已落盘',
      !!done.reportFile && fs.existsSync(done.reportFile)
      && fs.readFileSync(done.reportFile, 'utf8').includes('论文表3填写参考'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 8. 网关接线：三协议类都必须走公共模块，且不再有本地 calcStats
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const callCount = (server.match(/printLatencyStats\(this\.latencyStats, LATENCY_META\./g) || []).length;
  check('网关三个协议类各调用一次公共函数', callCount === 3, { callCount });
  check('网关不再残留本地统计实现', !server.includes('const calcStats = (arr)'));
  check('网关引入公共模块', server.includes("require('./latency-report')"));
}

main().then(() => {
  console.log(`==== RESULT ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
}).catch((e) => {
  console.error('[latency-check] 执行失败:', e);
  process.exit(1);
});
