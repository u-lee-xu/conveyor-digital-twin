'use strict';
/**
 * Node 侧「运行角色 + 内部链路信任标记」单一来源（P0-2）。
 *
 * 语义与浏览器 packages/shared/src/runtime/runtimeRole.ts 一致：本机/回环 = teacher，
 * 其它 = viewer。但服务端绝不能只信 Host 头（客户端可以伪造 Host: 127.0.0.1），
 * 所以以 TCP 连接实际落在哪个本机地址（req.socket.localAddress）为主判据，
 * Host 只作为第二道必须同时满足的条件，两者任一指向 LAN 即判 viewer。
 *
 * 信任链：
 *   start-lab.cjs 每次启动签发一次性 DT_INTERNAL_TOKEN（环境变量，仅本进程与子进程可见）
 *     → vite.config.ts 的 WS 代理在 upgrade 前覆写 x-dt-role / x-dt-proxy / x-dt-internal-token
 *     → server.js(:8081) / broadcast.js(:8082) 的 verifyClient 复核。
 *   LAN 客户端无法绕过代理直连 8081/8082（两者只绑 127.0.0.1），也无法自封 teacher
 *   （同名请求头会被代理无条件覆写）。
 *   Electron file:// 直连回环时没有代理头，视为可信的本机 teacher。
 */
const ROLE_HEADER = 'x-dt-role';
const PROXY_HEADER = 'x-dt-proxy';
const TOKEN_HEADER = 'x-dt-internal-token';
const LOOPBACK_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

/** 从 Host 头取主机名：只去掉末尾端口，IPv6 字面量的方括号要保留 */
function hostOf(rawHost) {
  return String(rawHost || '').replace(/:\d+$/, '').toLowerCase();
}

function isLoopbackHost(rawHost) {
  return LOOPBACK_HOSTS.has(hostOf(rawHost));
}

/** 返回 null 表示地址未知（例如被上层代理抹掉），此时只能退回 Host 判据 */
function isLoopbackAddress(addr) {
  const a = String(addr || '').toLowerCase();
  if (!a) return null;
  return a === '::1'
    || a === '::ffff:127.0.0.1'
    || a === '127.0.0.1'
    || a.startsWith('127.');
}

function roleFromUpgrade(req) {
  const headers = (req && req.headers) || {};
  const local = isLoopbackAddress(req && req.socket && req.socket.localAddress);
  if (local === false) return 'viewer';
  return isLoopbackHost(headers.host) ? 'teacher' : 'viewer';
}

/** 浏览器 WebSocket 握手必须同源；无 Origin 的本机调试脚本由 localAddress 把关 */
function originMatches(req) {
  const headers = (req && req.headers) || {};
  const origin = headers.origin;
  if (!origin || origin === 'null') return true;
  try {
    return new URL(String(origin)).host.toLowerCase() === String(headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

/** 代理转发前写入信任头；客户端自带的同名头一律被覆写 */
function applyProxyHeaders(req) {
  const role = roleFromUpgrade(req);
  req.headers[ROLE_HEADER] = role;
  req.headers[PROXY_HEADER] = '1';
  if (process.env.DT_INTERNAL_TOKEN) {
    req.headers[TOKEN_HEADER] = process.env.DT_INTERNAL_TOKEN;
  } else {
    delete req.headers[TOKEN_HEADER];
  }
  return role;
}

/**
 * 内部服务侧的升级校验。allowViewer=false 用于 PLC 网关（主控唯一）；
 * true 用于状态中继（观众可订阅，但其上行在 broadcast.js 里按 role 丢弃）。
 */
function verifyInternalRequest(req, options) {
  const opts = options || {};
  const headers = (req && req.headers) || {};
  if (headers[PROXY_HEADER] !== '1') {
    // 未走代理 = 本机直连回环端口（Electron file:// 回退 / 本机脚本）
    return { ok: true, role: 'teacher', reason: '' };
  }
  const token = process.env.DT_INTERNAL_TOKEN;
  // 头缺失 = dev server（Vite CLI 直启，没有 start-lab 签发 token）或旧版代理，
  // 仍按 role 把关；头存在但不匹配 = 外部伪造 / 另一个实验室实例的代理，直接拒绝。
  if (token && headers[TOKEN_HEADER] && headers[TOKEN_HEADER] !== token) {
    return { ok: false, role: 'viewer', reason: 'token' };
  }
  const role = headers[ROLE_HEADER] === 'viewer' ? 'viewer' : 'teacher';
  if (!opts.allowViewer && role === 'viewer') {
    return { ok: false, role, reason: 'role' };
  }
  return { ok: true, role, reason: '' };
}

module.exports = {
  ROLE_HEADER, PROXY_HEADER, TOKEN_HEADER, LOOPBACK_HOSTS,
  hostOf, isLoopbackHost, isLoopbackAddress,
  roleFromUpgrade, originMatches, applyProxyHeaders, verifyInternalRequest,
};
