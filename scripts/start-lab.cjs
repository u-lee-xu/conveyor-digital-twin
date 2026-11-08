#!/usr/bin/env node
/**
 * 实验室一键启动：装了软件的机器双击/运行本脚本，即成为主控并对外提供演示服务。
 *
 *   npm run start:lab
 *
 * 起 4 个进程，但浏览器（含智能电视）只需要访问一个地址：
 *   http://<教师机IP>:5201/        主控本机 或 观众（自动按来源判定）
 * 内部链路 8081（PLC 网关）/ 8082（状态中继）/ 1505（虚拟 PLC）/ 5085（状态口）
 * 全部只在本机使用，外部设备不直接碰这些端口；WebSocket 由 Vite preview
 * 的 /ws/plc 与 /ws/relay 同源代理转发，CSP 的 'self' 直接放行。
 *
 * 环境变量：DT_PORT 改前端端口（默认 5201）；DT_SKIP_MOCK=1 不启虚拟 PLC。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const WSS = path.join(ROOT, 'websocket-server');
const PLATFORM = path.join(ROOT, 'packages/platform');
const DIST = path.join(PLATFORM, 'dist');
const PORT = Number(process.env.DT_PORT || 5201);

/** 取默认路由所在网卡的 IPv4，避免误选 WSL/Hyper-V 虚拟网卡或 169.254 APIPA */
function pickLanIp() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (addr) => { if (!settled) { settled = true; resolve(addr); } };
    try {
      const sock = dgram.createSocket('udp4');
      sock.connect(53, '223.5.5.5', () => {
        const addr = sock.address().address;
        sock.close();
        done(addr && !addr.startsWith('169.254') ? addr : fallbackIp());
      });
      sock.on('error', () => { try { sock.close(); } catch { /* noop */ } done(fallbackIp()); });
      setTimeout(() => done(fallbackIp()), 800);
    } catch {
      done(fallbackIp());
    }
  });
}

function fallbackIp() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254')) continue;
      all.push({ name, address: info.address });
    }
  }
  const preferred = all.find((x) => /^192\.168\./.test(x.address))
    || all.find((x) => /^10\./.test(x.address))
    || all[0];
  return preferred ? preferred.address : '127.0.0.1';
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.setTimeout(600);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

const children = [];
function launch(name, command, args, cwd, needed) {
  if (!needed) { console.log(`[lab] 跳过 ${name}（端口已被占用，沿用已运行实例）`); return; }
  const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  child.on('exit', (code) => console.log(`[lab] ${name} 退出 (${code})`));
  children.push({ name, child });
  console.log(`[lab] 启动 ${name}`);
}

async function main() {
  const ip = await pickLanIp();
  const viewerUrl = `http://${ip}:${PORT}/`;

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.warn('[lab] 警告：packages/platform/dist 不存在，请先执行 npm run build:platform');
  } else {
    fs.writeFileSync(
      path.join(DIST, 'lab-info.json'),
      `${JSON.stringify({ viewerUrl, host: ip, port: PORT }, null, 2)}\n`,
    );
  }

  /**
   * 平台壳 Web 服务在本进程内直接托管：后台无 TTY 环境下 spawn 的
   * vite preview 会停在启动阶段不监听端口。用 Vite Node API 更可靠，
   * /ws/plc 与 /ws/relay 的同源代理仍由 packages/platform/vite.config.ts 提供。
   * 先启动 Web 服务再拉起内部服务，避免子进程继承 stdio 干扰 Vite 初始化。
   */
  process.env.VITE_CJS_IGNORE_WARNING = 'true';
  console.log(`[lab] 正在启动平台壳 Web 服务 :${PORT}`);
  const { preview } = require('vite');
  const previewServer = await preview({
    root: PLATFORM,
    preview: { host: '0.0.0.0', port: PORT, strictPort: true },
  });
  console.log(`[lab] 平台壳 Web 服务已监听 :${PORT}`);
  previewServer.printUrls();

  const [busy8081, busy8082, busy1505] = await Promise.all([
    portBusy(8081), portBusy(8082), portBusy(1505),
  ]);

  launch('PLC 网关 :8081', process.execPath, [path.join(WSS, 'server.js')], WSS, !busy8081);
  launch('状态中继 :8082', process.execPath, [path.join(WSS, 'broadcast.js')], WSS, !busy8082);
  if (process.env.DT_SKIP_MOCK !== '1') {
    launch('虚拟 PLC :1505', process.execPath, [path.join(WSS, 'mock-dispensing-server.js'), '1505'], WSS, !busy1505);
  }

  console.log('');
  console.log('  数字孪生仿真平台已启动');
  console.log(`  主控本机： http://127.0.0.1:${PORT}/`);
  console.log(`  观众访问： ${viewerUrl}  （智能电视 / 手机 / 学生机浏览器，打开即只读跟随）`);
  console.log('  内部端口： 8081 网关 / 8082 中继 / 1505 虚拟 PLC / 5085 状态口（仅本机）');
  console.log('  提示：若修改过源码，请先 npm run build:platform 再启动');
  console.log('');

  const stop = () => {
    for (const { child } of children) { try { child.kill(); } catch { /* noop */ } }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => { console.error('[lab] 启动失败:', e); process.exitCode = 1; });
