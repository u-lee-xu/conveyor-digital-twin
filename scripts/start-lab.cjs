#!/usr/bin/env node
/**
 * 实验室一键启动：装了软件的机器双击/运行本脚本，即成为主控并对外提供演示服务。
 *
 *   npm run start:lab
 *
 * 起 4 个进程，但浏览器（含智能电视）只需要访问一个地址：
 *   http://<教师机当前任一可达 IP>:5201/
 * 内部链路 8081 / 8082 / 1505 / 5085 已显式绑定 127.0.0.1，只有 Vite preview
 * 的 /ws/plc 与 /ws/relay 同源代理能触达，CSP 的 'self' 直接放行。
 *
 * 【不固化 IP】教室/实验室网络会变：DHCP 续租、换 WiFi、有线无线并存、虚拟网卡。因此：
 *  - 实际通信一律同源相对路径（wsEndpoints.ts 用 location.host），与 IP 无关；
 *  - /lab-info.json 由下面的 preview 插件按「每次请求」实时生成，返回当前 Host
 *    与全部可用网卡候选地址，绝不把某个 IP 写死进 dist 静态文件；
 *  - 界面默认显示默认路由网卡的「本地 IP」，其余网卡候选可切换复制；
 *    本机自己始终用 127.0.0.1，网络变化后刷新即更新。
 *
 * 环境变量：DT_PORT 改前端端口（默认 5201）；DT_SKIP_MOCK=1 不启虚拟 PLC。
 * 内部端口 8081 / 8082 与同源代理目标硬绑定，检测到不一致会拒绝启动。
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

/**
 * 取默认路由所在网卡的 IPv4，即「本机 IP」：不发包，只让内核按路由表选源地址。
 * 换 WiFi / DHCP 续租后每次调用都会变，所以 /lab-info.json 每次请求都重新取，
 * 绝不缓存成固定 IP。取不到时返回空串，由 fallbackIp() 兜底。
 */
function defaultRouteIp(timeoutMs = 400) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (addr) => { if (!settled) { settled = true; resolve(addr); } };
    let sock;
    const close = () => { try { sock?.close(); } catch { /* noop */ } };
    try {
      sock = dgram.createSocket('udp4');
      sock.connect(53, '223.5.5.5', () => {
        const addr = sock.address().address;
        close();
        done(addr && !addr.startsWith('169.254') ? addr : '');
      });
      sock.on('error', () => { close(); done(''); });
      const timer = setTimeout(() => { close(); done(''); }, timeoutMs);
      timer.unref?.();
    } catch {
      close();
      done('');
    }
  });
}

/** 控制台推荐地址：默认路由网卡，取不到时退回任一可用网卡 */
async function pickLanIp() {
  return (await defaultRouteIp()) || fallbackIp();
}

/**
 * 枚举本机所有可用于局域网访问的 IPv4。
 * 不猜「唯一正确 IP」：多网卡/换网时任何一个都可能是观众实际要走的那条，
 * 所以每次请求实时读 os.networkInterfaces()，由使用者按现场网络挑选。
 */
function lanAddresses() {
  const list = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (String(info.family) !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254')) continue; // APIPA 不是可达地址
      list.push({ name, address: info.address });
    }
  }
  return [...new Map(list.map((a) => [a.address, a])).values()];
}

function fallbackIp() {
  const all = lanAddresses();
  const preferred = all.find((x) => /^192\.168\./.test(x.address))
    || all.find((x) => /^10\./.test(x.address))
    || all[0];
  return preferred ? preferred.address : '127.0.0.1';
}

/** 从 Host 头取主机名，只去掉末尾端口，IPv6 字面量的方括号要保留 */
function hostOf(rawHost) {
  return String(rawHost || '').replace(/:\d+$/, '');
}

const LOOPBACK_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * /lab-info.json 动态端点（Vite preview 插件）。
 * 浏览器 fetch 时按当前请求的 Host + 实时网卡表生成候选地址；
 * Cache-Control: no-store 是关键，否则浏览器会缓存旧 IP 又变成「固定 IP」。
 */
function labInfoPlugin(port) {
  return {
    name: 'dt-lab-info-dynamic',
    configurePreviewServer(server) {
      server.middlewares.use('/lab-info.json', (req, res) => {
        void (async () => {
          const rawHost = typeof req.headers.host === 'string' ? req.headers.host : '';
          const host = hostOf(rawHost);
          const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
          // 界面默认显示的是默认路由网卡那个「本地 IP」，不是枚举到的第一块虚拟网卡
          const preferred = await defaultRouteIp();
          const all = lanAddresses();
          const addresses = preferred
            ? [
                ...all.filter((a) => a.address === preferred),
                ...all.filter((a) => a.address !== preferred),
              ]
            : all;
          const primaryAddress = addresses[0]?.address || '';
          const candidates = addresses.map((a) => `${scheme}://${a.address}:${port}/`);
          const sameOrigin = rawHost ? `${scheme}://${rawHost}/` : '';
          // 用 LAN IP / 域名访问本机时优先同源；本机 127.0.0.1 访问时本地 IP 放最前
          const viewerUrls = [...new Set(
            LOOPBACK_HOSTS.has(host) ? [...candidates, sameOrigin] : [sameOrigin, ...candidates],
          )].filter(Boolean);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(`${JSON.stringify({
            port,
            requestHost: rawHost,
            host,
            primaryAddress,
            addresses,
            viewerUrls,
            generatedAt: Date.now(),
          }, null, 2)}\n`);
        })().catch(() => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end('{"error":"lab-info unavailable"}\n');
        });
      });
    },
  };
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

/**
 * 内部端口是 vite.config.ts 里 WS_PROXY 的硬编码目标。若环境变量或配置把它们改掉，
 * 代理会静默打到一个不存在的服务，表现为「页面能开但 PLC 连不上」，所以启动前拦下。
 */
function assertInternalPorts() {
  const wsPort = process.env.WS_PORT;
  if (wsPort && wsPort !== '8081') {
    throw new Error(`WS_PORT=${wsPort} 与同源代理目标 127.0.0.1:8081 不一致，请清除 WS_PORT 后重试`);
  }
  let broadcastPort = 8082;
  try {
    const edge = JSON.parse(fs.readFileSync(path.join(WSS, 'edge-broadcast.json'), 'utf8'));
    if (typeof edge.broadcastPort === 'number') broadcastPort = edge.broadcastPort;
  } catch {
    // 配置文件缺失时 broadcast.js 会用默认 8082
  }
  if (broadcastPort !== 8082) {
    throw new Error(`edge-broadcast.json 的 broadcastPort=${broadcastPort} 与同源代理目标 127.0.0.1:8082 不一致`);
  }
}

const children = [];
function launch(name, command, args, cwd, needed) {
  if (!needed) {
    console.warn(`[lab] 警告：${name} 端口已被占用，沿用已运行实例；该实例可能不是当前版本，必要时请先停掉旧进程再重启`);
    return;
  }
  const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  child.on('exit', (code) => console.log(`[lab] ${name} 退出 (${code})`));
  children.push({ name, child });
  console.log(`[lab] 启动 ${name}`);
}

async function main() {
  assertInternalPorts();
  const addresses = lanAddresses();
  const recommended = await pickLanIp();

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.warn('[lab] 警告：packages/platform/dist 不存在，请先执行 npm run build:platform');
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
    plugins: [labInfoPlugin(PORT)],
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
  console.log('  观众访问：按现场网络选以下任一地址，IP 会变，界面底部实时显示并可复制');
  // 与 /lab-info.json 的 primaryAddress 同序：本地 IP 排第一，避免把虚拟网卡当成入口
  const ordered = [
    ...addresses.filter((a) => a.address === recommended),
    ...addresses.filter((a) => a.address !== recommended),
  ];
  const lines = ordered.length
    ? ordered.map((a) => `    http://${a.address}:${PORT}/    ${a.name}${a.address === recommended ? '    ← 默认' : ''}`)
    : [`    http://${recommended}:${PORT}/`];
  lines.forEach((l) => console.log(l));
  console.log(`  界面默认显示： http://${recommended}:${PORT}/ · 默认路由网卡，换网自动更新`);
  console.log('  对外：只需放行 :5201，观众浏览器访问上面的本地 IP 即可');
  console.log('  本机内部：8081 PLC 网关 / 8082 状态中继 / 1505 虚拟 PLC / 5085 状态口，均绑定 127.0.0.1，外部访问不到');
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
