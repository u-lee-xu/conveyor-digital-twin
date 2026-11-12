#!/usr/bin/env node
/**
 * 实验室一键启动：装了软件的机器双击/运行本脚本，即成为主控并对外提供演示服务。
 *
 *   npm run start:lab
 *
 * 起 9 个进程，但浏览器（含智能电视）只需要访问一个地址：
 *   http://<教师机当前任一可达 IP>:5201/
 * 内部链路 8081 / 8082 / 1505 / 5085 / 1503 / 5083 / 1507 / 5087 / 1508 / 5088 / 1509 / 5089
 * 已显式绑定 127.0.0.1，只有 Vite preview 的 /ws/plc 与 /ws/relay 同源代理能触达，
 * CSP 的 'self' 直接放行。
 * 四个场景各自一个虚拟 PLC，不共用线圈表 / 数值段 / 参考程序：
 *   1505 自动配药、1503 传送带分拣、1507 MD520 变频器、1509 汇川龙门 XY（独立设备包）。
 * 另有 B 档独立 485 从站 1508（纯从站，无参考程序）与真实 Modbus 主站轮询进程；
 * 外部 PLC 要独占从站时设 DT_VFD_485_MASTER=0。
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
 *
 * 安全边界（P0-2）：本脚本每次启动签发一次性 DT_INTERNAL_TOKEN，仅 Vite 代理与
 * 子进程可见；代理按 TCP localAddress + Host 判定 teacher/viewer，/ws/plc 只对
 * 主控回环开放，LAN 观众只能订阅 /ws/relay。接实体 PLC 时另设
 * DT_PLC_HOSTS=192.168.1.50（或 websocket-server/plc-hosts.json）放行目标主机。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const net = require('net');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const WSS = path.join(ROOT, 'websocket-server');
const { hostOf, isLoopbackHost } = require(path.join(WSS, 'runtime-role.js'));

/**
 * P0-2：每次启动签发一次性内部链路 token，只通过环境变量传给 Vite 代理与 4 个子进程。
 * 它不进 dist、不进浏览器 bundle；代理在 WS 升级时覆写同名请求头。
 * 单独用 Vite CLI 跑 dev（无 token）时仍按角色把关，只是少了这层来源证明。
 */
process.env.DT_INTERNAL_TOKEN = crypto.randomBytes(24).toString('hex');
const PLATFORM = path.join(ROOT, 'packages/platform');
const DIST = path.join(PLATFORM, 'dist');
const PORT = Number(process.env.DT_PORT || 5201);
/** 传送带场景独立虚拟 PLC 端口；与 vite.config.ts 的网关代理无关，改动需同步端口自检 */
const CONVEYOR_PLC_PORT = 1503;
/** MD520 变频器独立设备场景的虚拟 PLC 端口 */
const VFD_PLC_PORT = 1507;
/** B 档：独立的 485 从站端口（纯从站，与 :1507 的寄存器区完全分离） */
const VFD_SLAVE_PORT = 1508;
/** 汇川龙门 XY 独立虚拟 PLC 端口与状态口（与四个既有场景 PLC 完全分离） */
const GANTRY_PLC_PORT = 1509;
const GANTRY_HTTP_PORT = 5089;

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

/** Host 头解析与回环判定统一由 runtime-role.js 提供（与 WS 代理、网关、中继同源） */

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
            isLoopbackHost(host) ? [...candidates, sameOrigin] : [sameOrigin, ...candidates],
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
  // 场景独立：传送带虚拟 PLC 不能与自动配药虚拟 PLC 共用一个端口 / 一份线圈表
  if (CONVEYOR_PLC_PORT === 1505) {
    throw new Error('传送带虚拟 PLC 端口不能与自动配药虚拟 PLC :1505 相同，两个场景必须独立');
  }
  // MD520 是独立设备场景，端口不能与另两个场景任一相同
  if (VFD_PLC_PORT === 1505 || VFD_PLC_PORT === CONVEYOR_PLC_PORT) {
    throw new Error('MD520 虚拟 PLC 端口不能与配药 / 分拣虚拟 PLC 相同，三个场景必须独立');
  }
  // B 档从站必须与三个场景 PLC 都不共用端口，也不共用寄存器区
  if ([1505, CONVEYOR_PLC_PORT, VFD_PLC_PORT].includes(VFD_SLAVE_PORT) || VFD_SLAVE_PORT === 8081 || VFD_SLAVE_PORT === 8082) {
    throw new Error('B 档 485 从站端口不能与配药 / 分拣 / MD520 虚拟 PLC 或网关 / 中继相同');
  }
  // 汇川龙门虚拟 PLC：主端口与状态口都不能与既有场景 / 网关 / 中继共口
  if ([1505, CONVEYOR_PLC_PORT, VFD_PLC_PORT, VFD_SLAVE_PORT, 8081, 8082].includes(GANTRY_PLC_PORT)) {
    throw new Error('汇川龙门虚拟 PLC 端口不能与配药 / 分拣 / MD520 / B档从站 / 网关 / 中继相同');
  }
  if ([5085, 5083, 5087, 5088, 8081, 8082].includes(GANTRY_HTTP_PORT)) {
    throw new Error('汇川龙门状态口不能与既有场景状态口 / 网关 / 中继相同');
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

  /**
   * strictPort 下 Vite 会直接抛 "Port 5201 is already in use"，用户只看到原始异常，
   * 不知道旧实例其实还活着、直接访问即可。先预检一次，给出可操作的提示。
   * 必须在 preview() 之前，避免半初始化；也避免继续拉起 4 个内部服务与旧实例混跑。
   */
  if (await portBusy(PORT)) {
    console.error(`[lab] :${PORT} 已被占用，实验室很可能已经在运行。`);
    console.error(`[lab] 直接访问 http://127.0.0.1:${PORT}/ 即可；若要重启，先停掉占用 :${PORT} 的进程，再执行 npm run start:lab。`);
    process.exitCode = 1;
    return;
  }

  const { preview } = require('vite');
  const previewServer = await preview({
    root: PLATFORM,
    plugins: [labInfoPlugin(PORT)],
    preview: { host: '0.0.0.0', port: PORT, strictPort: true },
  });
  console.log(`[lab] 平台壳 Web 服务已监听 :${PORT}`);
  previewServer.printUrls();

  const [busy8081, busy8082, busy1505, busy1503, busy1507, busy1508, busy1509, busy5089] = await Promise.all([
    portBusy(8081), portBusy(8082), portBusy(1505),
    portBusy(CONVEYOR_PLC_PORT), portBusy(VFD_PLC_PORT), portBusy(VFD_SLAVE_PORT),
    portBusy(GANTRY_PLC_PORT), portBusy(GANTRY_HTTP_PORT),
  ]);

  launch('PLC 网关 :8081', process.execPath, [path.join(WSS, 'server.js')], WSS, !busy8081);
  launch('状态中继 :8082', process.execPath, [path.join(WSS, 'broadcast.js')], WSS, !busy8082);
  if (process.env.DT_SKIP_MOCK !== '1') {
    launch('自动配药虚拟 PLC :1505', process.execPath, [path.join(WSS, 'mock-dispensing-server.js'), '1505'], WSS, !busy1505);
    launch('传送带虚拟 PLC :1503', process.execPath,
      [path.join(WSS, 'mock-conveyor-server.js'), String(CONVEYOR_PLC_PORT)], WSS, !busy1503);
    launch('MD520 虚拟 PLC :1507', process.execPath,
      [path.join(WSS, 'mock-vfd-server.js'), String(VFD_PLC_PORT)], WSS, !busy1507);
    // 汇川龙门 XY：独立虚拟 PLC + 教学参考程序（自带 100ms 扫描）
    launch('汇川龙门虚拟 PLC :1509', process.execPath,
      [path.join(WSS, 'mock-gantry-server.js'), String(GANTRY_PLC_PORT)], WSS, !busy1509 && !busy5089);
    // B 档：独立 485 从站（纯从站）+ 真实 Modbus 主站轮询进程
    launch('MD520 B 档 485 从站 :1508', process.execPath,
      [path.join(WSS, 'mock-vfd-slave.js'), String(VFD_SLAVE_PORT)], WSS, !busy1508);
    if (process.env.DT_VFD_485_MASTER !== '0') {
      launch('MD520 485 主站轮询', process.execPath,
        [path.join(WSS, 'vfd-485-master.cjs')], WSS, true);
    }
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
  console.log('  本机内部：8081 PLC 网关 / 8082 状态中继 / 1505+5085 配药 / 1503+5083 分拣 / 1507+5087 MD520 / 1508+5088 B档485从站 / 1509+5089 龙门，均绑定 127.0.0.1，外部访问不到');
  console.log('  WS 升级鉴权：LAN 只能订阅中继，PLC 写入通道只对主控回环开放；内部链路 token 每次启动重新签发');
  console.log(`  PLC 主机白名单：${process.env.DT_PLC_HOSTS ? process.env.DT_PLC_HOSTS : '默认仅回环；接实体 PLC 请设 DT_PLC_HOSTS'}`);
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
