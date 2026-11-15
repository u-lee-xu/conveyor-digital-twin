/**
 * 浏览器端 WebSocket 端点唯一来源。
 *
 * 正常部署：一律连同源路径，由 Vite dev / preview（或安装包内置静态服务）的
 * 反向代理转发到本机内部服务，浏览器只碰一个端口：
 *   /ws/plc   -> 127.0.0.1:8081  三协议 PLC 网关（主控唯一双向链路）
 *   /ws/relay -> 127.0.0.1:8082  状态广播中继（观众订阅 / 主控上报）
 * 这样 CSP 的 `connect-src 'self'` 直接放行，HTTPS 下自动升 wss:，
 * 防火墙只需放行前端一个端口，也不会出现跨端口与混合内容问题。
 *
 * Electron 打包版以 file:// 加载本地页面，没有反向代理，回退直连本机端口。
 */
import { isViewerRuntime } from '../runtime/runtimeRole';

export const PLC_WS_PATH = '/ws/plc';
export const RELAY_WS_PATH = '/ws/relay';
export const PLC_WS_PORT = 8081;
export const RELAY_WS_PORT = 8082;

/** 按当前页面推导 WebSocket URL；禁止在组件里再拼 :8081 / :8082 字面量。 */
export function resolveWsUrl(path: string, fallbackPort: number): string {
  if (typeof location === 'undefined') return `ws://127.0.0.1:${fallbackPort}`;
  const { protocol, host } = location;
  if (protocol === 'file:' || !host) {
    // Electron 打包版：主进程签发的一次性凭据随直连 URL 传给网关，用来把
    // file:// 与 sandbox iframe / data: 的 opaque origin 区分开（两者 Origin 都是 null）
    const token = typeof window !== 'undefined'
      ? (window as unknown as { electronAPI?: { internalToken?: string } }).electronAPI?.internalToken
      : '';
    return `ws://127.0.0.1:${fallbackPort}${token ? `?dt_token=${encodeURIComponent(token)}` : ''}`;
  }
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${host}${path}`;
}

/** PLC 网关：主控读写线圈 / 32 位 DINT 数值寄存器 */
export function plcWsUrl(): string {
  return resolveWsUrl(PLC_WS_PATH, PLC_WS_PORT);
}

/** 状态中继：主控单向 report、观众单向订阅 */
export function relayWsUrl(): string {
  return resolveWsUrl(RELAY_WS_PATH, RELAY_WS_PORT);
}

/**
 * 观众端是只读镜像，**禁止**建立 PLC 控制通道。
 *
 * 主控是唯一与 PLC 双向通信的一端，观众只订阅 /ws/relay 的快照。
 * 各设备包的 plcService 是模块级单例，构造时即 new WebSocket()，若不加守卫，
 * 观众页仅因静态 import 设备定义就会悄悄连上 8081，形成第二个 PLC 客户端，
 * 也破坏「观众只能看」的设计口径。
 */
export function canOpenPlcChannel(): boolean {
  return !isViewerRuntime();
}
