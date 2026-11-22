#!/usr/bin/env node
/**
 * 实验室一键启动：装了软件的机器双击/运行本脚本，即成为主控并对外提供演示服务。
 *
 *   npm run start:lab
 *
 * 教学形态只起 3 个服务（Web preview + PLC 网关 + 状态中继），
 * 但浏览器（含智能电视）只需要访问一个地址：
 *   http://<教师机当前任一可达 IP>:5201/
 * 教学交付只启动 8081 PLC 网关 / 8082 状态中继，两者显式绑定 127.0.0.1，
 * 只有 Vite preview 的 /ws/plc 与 /ws/relay 同源代理能触达，CSP 的 'self' 直接放行。
 * 仿真模式一律对接外部 PLC 编程软件的 simulator 或实物 PLC（Modbus TCP :502 /
 * S7 :102 / 三菱，或 DI/AI 端子接线），内置虚拟 PLC 不是教学交付的一部分。
 *
 * 内置虚拟 PLC（1505 配药 / 1503 分拣 / 1507+1508 MD520）只是开发/验收靶机：
 * 默认不启动，需 DT_ENABLE_MOCK=1（或 npm run start:devlab）显式启用，供
 * security-check / plc-ports-check / plc-3d-link-check 等自检脚本复跑。
 * 汇川龙门 XY 本机练习靶机 :1509 + :5089 同样默认不启（DT_ENABLE_GANTRY_MOCK=1）。
 *
 * 【不固化 IP】教室/实验室网络会变：DHCP 续租、换 WiFi、有线无线并存、虚拟网卡。因此：
 *  - 实际通信一律同源相对路径（wsEndpoints.ts 用 location.host），与 IP 无关；
 *  - /lab-info.json 由下面的 preview 插件按「每次请求」实时生成，返回当前 Host
 *    与全部可用网卡候选地址，绝不把某个 IP 写死进 dist 静态文件；
 *  - 界面默认显示默认路由网卡的「本地 IP」，其余网卡候选可切换复制；
 *    本机自己始终用 127.0.0.1，网络变化后刷新即更新。
 *
 * 环境变量：DT_PORT 改前端端口（默认 5201）；
 * DT_ENABLE_MOCK=1 启动内置虚拟 PLC 靶机（默认关，仅开发 / 自检用）；
 * DT_ENABLE_GANTRY_MOCK=1 额外启用龙门本机练习靶机 :1509（默认关）。
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
/** 龙门本机练习靶机端口与状态口（默认不启用，仿真模式对接外部 PLC 仿真软件 :502） */
const GANTRY_PLC_PORT = 1509;
const GANTRY_HTTP_PORT = 5089;
const GANTRY_MOCK_ENABLED = process.env.DT_ENABLE_GANTRY_MOCK === '1';
/** 内置虚拟 PLC 只在开发/自检模式启动；课堂交付进程里不应出现 */
const MOCK_ENABLED = process.env.DT_ENABLE_MOCK === '1' && process.env.DT_SKIP_MOCK !== '1';

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
/** Host 只接受域名 / IPv4 / IPv6 字面量 + 可选端口，伪造头不能污染界面上的观众地址 */
const HOST_RE = /^[a-zA-Z0-9.:[\]-]+$/;

function labInfoPlugin(port) {
  // 默认路由网卡探测要建 UDP socket，缓存 2s，避免高频轮询放大 fd / 定时器
  let cachedRoute = { at: 0, ip: '' };
  const routeIpCached = async () => {
    const now = Date.now();
    if (now - cachedRoute.at < 2000) return cachedRoute.ip;
    cachedRoute = { at: now, ip: await defaultRouteIp() };
    return cachedRoute.ip;
  };
  // 单 IP 每秒最多 20 次，超出直接 429
  const hits = new Map();
  return {
    name: 'dt-lab-info-dynamic',
    configurePreviewServer(server) {
      server.middlewares.use('/lab-info.json', (req, res) => {
        const now = Date.now();
        const key = req.socket.remoteAddress || 'unknown';
        const entry = hits.get(key) || { at: now, count: 0 };
        if (now - entry.at > 1000) { entry.at = now; entry.count = 0; }
        entry.count += 1;
        hits.set(key, entry);
        if (entry.count > 20) {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end('{"error":"rate limited"}\n');
          return;
        }
        void (async () => {
          const raw = typeof req.headers.host === 'string' ? req.headers.host : '';
          const rawHost = HOST_RE.test(raw) && raw.length <= 255 ? raw : `127.0.0.1:${port}`;
          const host = hostOf(rawHost);
          // 客户端可伪造 x-forwarded-proto，只按实际连接判断 scheme
          const scheme = req.socket.encrypted ? 'https' : 'http';
          // 界面默认显示的是默认路由网卡那个「本地 IP」，不是枚举到的第一块虚拟网卡
          const preferred = await routeIpCached();
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

/**
 * 占用探测：内部服务一律只绑 127.0.0.1，探 LAN 地址只会被虚拟网卡上的无关
 * 监听误报，甚至让 :8081/:8082 的 token fail-fast 直接终止启动。只有对外 :5201
 * 才额外探测真实网卡，并排除 VirtualBox / WSL / Docker / VPN 等虚拟适配器。
 * 旧版「尝试绑 0.0.0.0」在 Windows 会与只绑回环的服务共存，不能用来判占用。
 */
const VIRTUAL_NIC = /virtual|vmware|vbox|wsl|docker|hyper-v|vpn|tap-|loopback|虚拟|伪/i;
function portBusy(port) {
  const hosts = ['127.0.0.1'];
  if (port === PORT) {
    try {
      for (const nic of lanAddresses()) {
        if (!VIRTUAL_NIC.test(nic.name)) hosts.push(nic.address);
      }
    } catch { /* 网卡枚举失败时仍探回环 */ }
  }
  return new Promise((resolve) => {
    let pending = hosts.length;
    let busy = false;
    for (const host of hosts) {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        if (v) busy = true;
        if (--pending === 0) resolve(busy);
      };
      const s = net.connect(port, host);
      s.setTimeout(600);
      s.on('connect', () => { s.destroy(); finish(true); });
      s.on('error', () => finish(false));
      s.on('timeout', () => { s.destroy(); finish(false); });
    }
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
let stopping = false;
const restartCounts = new Map();
const MAX_RESTART = 3;
/** 稳定运行这么久后清零重启计数，让「连续 3 次」真的是连续，而非进程生命周期累计 */
const RESTART_STABLE_MS = 30000;

/** 子进程异常退出要能被看见并自愈：限次指数退避重启，避免「页面能开但 PLC 连不上」 */
function launch(name, command, args, cwd, needed) {
  if (!needed) {
    console.warn(`[lab] 警告：${name} 端口已被占用，沿用已运行实例；该实例可能不是当前版本，必要时请先停掉旧进程再重启`);
    return;
  }
  const spawnOnce = () => {
    if (stopping) return;
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
    children.push({ name, child });
    console.log(`[lab] 启动 ${name}`);
    let restartScheduled = false;
    const stableTimer = setTimeout(() => restartCounts.set(name, 0), RESTART_STABLE_MS);
    stableTimer.unref?.();

    const scheduleRestart = () => {
      if (stopping || restartScheduled || process.env.DT_NO_RESTART === '1') return;
      restartScheduled = true;
      const n = restartCounts.get(name) ?? 0;
      if (n >= MAX_RESTART) {
        console.error(`[lab] ${name} 连续 ${MAX_RESTART} 次异常退出，停止重启；请查看上方日志后手工重启实验室`);
        return;
      }
      restartCounts.set(name, n + 1);
      const delay = 1000 * 2 ** n;
      console.warn(`[lab] ${name} 异常退出，${delay}ms 后重启（${n + 1}/${MAX_RESTART}）`);
      const timer = setTimeout(spawnOnce, delay);
      timer.unref?.();
    };

    // spawn 失败（可执行文件缺失 / 权限）只触发 error 而不一定触发 exit，
    // 两条路径都要能重启，用 restartScheduled 防止重复拉起
    child.on('error', (err) => {
      console.error(`[lab] ${name} 启动失败:`, err.message);
      clearTimeout(stableTimer);
      scheduleRestart();
    });
    child.on('exit', (code, signal) => {
      clearTimeout(stableTimer);
      console.log(`[lab] ${name} 退出 (${code}${signal ? `, ${signal}` : ''})`);
      if (stopping || code === 0) return;
      scheduleRestart();
    });
  };
  spawnOnce();
}

async function main() {
  assertInternalPorts();
  const [busy8081, busy8082, busy1505, busy1503, busy1507, busy1508, busy1509, busy5089] = await Promise.all([
    portBusy(8081), portBusy(8082), portBusy(1505),
    portBusy(CONVEYOR_PLC_PORT), portBusy(VFD_PLC_PORT), portBusy(VFD_SLAVE_PORT),
    // 靶机默认不启：不预检这两个端口，避免无谓占用（Promise.all 允许非 Promise 值）
    GANTRY_MOCK_ENABLED && portBusy(GANTRY_PLC_PORT),
    GANTRY_MOCK_ENABLED && portBusy(GANTRY_HTTP_PORT),
  ]);
  /**
   * 网关 / 中继持有启动时签发的一次性 DT_INTERNAL_TOKEN。沿用旧实例会让新代理写入
   * 新 token、旧网关按旧 token 复核，握手全部被拒且只有一行告警。其余 mock PLC 与
   * token 无关，仍允许沿用旧实例。
   */
  if (busy8081 || busy8082) {
    throw new Error('检测到 :8081 / :8082 已被占用：残留的网关或中继持有旧的一次性内部链路 token，新代理握手会被拒绝。请先停掉旧实例再启动本脚本。');
  }
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
   * 必须在 preview() 之前，避免半初始化；也避免继续拉起内部服务与旧实例混跑。
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

  launch('PLC 网关 :8081', process.execPath, [path.join(WSS, 'server.js')], WSS, !busy8081);
  launch('状态中继 :8082', process.execPath, [path.join(WSS, 'broadcast.js')], WSS, !busy8082);
  if (MOCK_ENABLED) {
    launch('自动配药虚拟 PLC :1505', process.execPath, [path.join(WSS, 'mock-dispensing-server.js'), '1505'], WSS, !busy1505);
    launch('传送带虚拟 PLC :1503', process.execPath,
      [path.join(WSS, 'mock-conveyor-server.js'), String(CONVEYOR_PLC_PORT)], WSS, !busy1503);
    launch('MD520 虚拟 PLC :1507', process.execPath,
      [path.join(WSS, 'mock-vfd-server.js'), String(VFD_PLC_PORT)], WSS, !busy1507);
    // 汇川龙门 XY：仿真模式默认连外部 PLC 仿真软件 :502，本机练习靶机按需启用
    if (GANTRY_MOCK_ENABLED) {
      launch('龙门本机练习靶机 :1509', process.execPath,
        [path.join(WSS, 'mock-gantry-server.js'), String(GANTRY_PLC_PORT)], WSS, !busy1509 && !busy5089);
    }
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
  console.log('  本机内部：8081 PLC 网关 / 8082 状态中继，均绑定 127.0.0.1，外部访问不到');
  console.log(`  内置虚拟 PLC：${MOCK_ENABLED ? '已启用（开发 / 自检模式，不用于课堂）' : '未启用（教学交付模式）'}`);
  console.log('  验收脚本需靶机时：npm run start:devlab（等价于 DT_ENABLE_MOCK=1 npm run start:lab）');
  console.log('  仿真模式：连接外部 PLC 仿真软件（Modbus TCP :502 / S7 :102 / 三菱）或实物 PLC 的 DI/AI 端子');
  console.log('  WS 升级鉴权：LAN 只能订阅中继，PLC 写入通道只对主控回环开放；内部链路 token 每次启动重新签发');
  console.log(`  PLC 主机白名单：${process.env.DT_PLC_HOSTS ? process.env.DT_PLC_HOSTS : '默认仅回环；接实体 PLC 请设 DT_PLC_HOSTS'}`);
  console.log('  提示：若修改过源码，请先 npm run build:platform 再启动');
  console.log('');

  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const { child } of children) { try { child.kill(); } catch { /* noop */ } }
    // 先关 Web 监听再退出，避免半初始化的 preview 继续占着 :5201
    try { previewServer.httpServer?.close?.(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => { console.error('[lab] 启动失败:', e); process.exitCode = 1; });

// 主进程同时托管 Web 与全部子进程：异常时必须先收掉子进程，否则 Windows 下
// 会留下占住 8081/8082 的孤儿，下次启动又被 token fail-fast 永久拒绝。
process.on('unhandledRejection', (reason) => {
  console.error('[lab] 未处理的 Promise 拒绝:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[lab] 未捕获异常，实验室退出:', err);
  stopping = true;
  for (const { child } of children) { try { child.kill(); } catch { /* noop */ } }
  process.exit(1);
});
