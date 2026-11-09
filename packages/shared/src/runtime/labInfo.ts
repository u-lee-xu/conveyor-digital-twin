/**
 * 观众访问地址的浏览器端唯一来源（运行时候选，绝不固化 IP）。
 *
 * 实际通信链路一律同源相对路径（wsEndpoints.ts 用 location.host），与 IP 无关；
 * 这里只负责「给老师看、给老师复制」的入口地址。教室网络会变：DHCP 续租、
 * 换 WiFi、有线无线并存、虚拟网卡，所以：
 *  - /lab-info.json 由 start-lab.cjs 的 preview 插件按每次请求实时生成；
 *  - 服务端不可用时仍退回当前页面同源地址，界面不会空白或显示过期 IP；
 *  - 多网卡时给出全部候选，由现场按实际网络挑选。
 */

export interface LabNetworkAddress {
  name: string;
  address: string;
}

export interface LabInfo {
  port: number;
  requestHost: string;
  host: string;
  addresses: LabNetworkAddress[];
  viewerUrls: string[];
  generatedAt: number;
  /** 旧版静态 lab-info.json 的兼容字段，只作为候选之一，不视为唯一真值 */
  viewerUrl?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 当前页面同源地址：任何部署方式下都一定可用，是最后的兜底 */
export function sameOriginViewerUrl(): string {
  if (typeof location === 'undefined' || !location.host) return '';
  const scheme = location.protocol === 'https:' ? 'https' : 'http';
  return `${scheme}://${location.host}/`;
}

export function isLoopbackViewerUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * 纯函数：合并服务端候选 + 同源地址、去重、排序。
 * 本机 127.0.0.1 打开时把可达网卡地址排前面；用 LAN IP / 域名打开时同源优先。
 */
export function rankViewerUrls(fromServer: readonly string[], sameOrigin: string): string[] {
  const unique = [...new Set([sameOrigin, ...fromServer].filter(Boolean))];
  const external = unique.filter((u) => !isLoopbackViewerUrl(u));
  const loopback = unique.filter(isLoopbackViewerUrl);
  if (!external.length) return unique;
  if (isLoopbackViewerUrl(sameOrigin) || !sameOrigin) {
    return [...external, ...loopback];
  }
  return [sameOrigin, ...external.filter((u) => u !== sameOrigin), ...loopback];
}

/** 拉取运行时候选地址；fetch 失败 / 404 / 旧格式都不会抛错，恒退回同源地址 */
export async function loadViewerUrls(): Promise<string[]> {
  let fromServer: string[] = [];
  try {
    const response = await fetch('/lab-info.json', { cache: 'no-store' });
    if (response.ok) {
      const info = await response.json() as Partial<LabInfo>;
      if (Array.isArray(info.viewerUrls)) {
        fromServer = info.viewerUrls.filter((u): u is string => typeof u === 'string');
      } else if (typeof info.viewerUrl === 'string') {
        fromServer = [info.viewerUrl];
      }
    }
  } catch {
    // 纯 dev / 打包版没有动态端点：同源地址仍然正确
  }
  return rankViewerUrls(fromServer, sameOriginViewerUrl());
}
