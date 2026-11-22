/**
 * 「不固化 IP」防回退自检（用户 2026-11-09 反馈：实际软件的适用环境不是固定 IP）。
 *
 * 硬约束：
 *  1. 实际通信一律同源相对路径，wsEndpoints.ts 用 location.host，与 IP 无关；
 *  2. /lab-info.json 由 start-lab.cjs 的 preview 插件按每次请求实时生成，
 *     返回当前 Host + 全部可用网卡候选，绝不把单一 IP 写进 dist 静态文件；
 *  3. 前端同源地址恒为兜底，多网卡时给出候选列表可切换；
 *  4. dev server 的 allowedHosts 不得写死任何 IP / 域名白名单。
 */
import { describe, it, expect } from 'vitest';
import {
  rankViewerUrls, isLoopbackViewerUrl, sameOriginViewerUrl,
} from '../../shared/src/runtime/labInfo';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const startLab = read('../../../scripts/start-lab.cjs');
const shell = read('../../platform/src/WorkspaceShell.tsx');
const labInfo = read('../../shared/src/runtime/labInfo.ts');
const wsEndpoints = read('../../shared/src/services/wsEndpoints.ts');
const sharedIndex = read('../../shared/src/index.ts');
const platformVite = read('../../platform/vite.config.ts');
const rootVite = read('../../../vite.config.ts');

describe('运行时地址端点：不固化 IP', () => {
  it('start-lab.cjs 用 preview 插件按请求生成 /lab-info.json', () => {
    expect(startLab).toContain('configurePreviewServer');
    expect(startLab).toContain("server.middlewares.use('/lab-info.json'");
    expect(startLab).toContain('req.headers.host');
    expect(startLab).toContain('viewerUrls');
    expect(startLab).toContain('generatedAt');
  });

  it('网卡地址每次实时枚举，且响应禁止缓存旧 IP', () => {
    expect(startLab).toContain('os.networkInterfaces()');
    expect(startLab).toContain('lanAddresses()');
    expect(startLab).toContain("res.setHeader('Cache-Control'");
    expect(startLab).toContain('no-store');
  });

  it('界面默认显示默认路由网卡的本地 IP，不是枚举到的第一块虚拟网卡', () => {
    expect(startLab).toContain('defaultRouteIp()');
    expect(startLab).toContain('primaryAddress');
    expect(startLab).toContain('a.address === preferred');
    expect(startLab).toContain('界面默认显示');
    expect(startLab).toContain('本机自己始终用 127.0.0.1');
  });

  it('不再把启动时猜到的单一 IP 写进 dist/lab-info.json', () => {
    expect(startLab).not.toMatch(/writeFileSync[\s\S]{0,240}lab-info\.json/);
    expect(startLab).not.toContain('JSON.stringify({ viewerUrl, host: ip');
  });

  it('启动脚本与 dev 配置里不出现任何写死的现场 IP / 域名', () => {
    const stale = ['203.0.113.34', '198.51.100.41', '192.0.2.59', 'siit.example.org'];
    stale.forEach((value) => {
      expect(startLab).not.toContain(value);
      expect(platformVite).not.toContain(value);
      expect(rootVite).not.toContain(value);
    });
  });

  it('dev server 不写死 hostname 白名单', () => {
    expect(platformVite).toContain('allowedHosts: true');
    expect(rootVite).toContain('allowedHosts: true');
  });
});

describe('浏览器端：同源兜底 + 候选单一来源', () => {
  it('通信端点仍按当前页面推导，与 IP 无关', () => {
    expect(wsEndpoints).toContain('const { protocol, host } = location');
    expect(wsEndpoints).toContain('${scheme}//${host}${path}');
  });

  it('labInfo.ts 是地址唯一来源且从 shared 总入口导出', () => {
    expect(labInfo).toContain('location.host');
    expect(labInfo).toContain("cache: 'no-store'");
    expect(labInfo).toContain('export function rankViewerUrls');
    expect(sharedIndex).toContain("from './runtime/labInfo'");
    expect(sharedIndex).toContain('loadViewerUrls');
  });

  it('WorkspaceShell 不再把静态 viewerUrl 当唯一真值', () => {
    expect(shell).toContain('loadViewerUrls()');
    expect(shell).toContain('viewerUrls.length > 1');
    expect(shell).toContain('cycleViewerUrl');
    expect(shell).toContain('viewerUrl && !isMobile');
    expect(shell).not.toContain('info?.viewerUrl || fallback');
    expect(shell).not.toContain("fetch('/lab-info.json')");
  });

  it('可见文案不带中文括号', () => {
    expect(shell).not.toContain('（点击复制）');
    expect(shell).toContain('点击复制');
  });
});

describe('rankViewerUrls 纯函数', () => {
  it('本机 127.0.0.1 打开时把可达网卡地址排前，回环降为兜底', () => {
    const urls = rankViewerUrls(
      ['http://198.51.100.41:5201/', 'http://192.0.2.8:5201/'],
      'http://127.0.0.1:5201/',
    );
    expect(urls[0]).toBe('http://198.51.100.41:5201/');
    expect(urls).toContain('http://127.0.0.1:5201/');
    expect(urls[urls.length - 1]).toBe('http://127.0.0.1:5201/');
  });

  it('用 LAN IP / 域名访问本机时同源地址优先', () => {
    const urls = rankViewerUrls(
      ['http://198.51.100.41:5201/', 'http://192.0.2.8:5201/'],
      'http://siit.example.org:5201/',
    );
    expect(urls[0]).toBe('http://siit.example.org:5201/');
    expect(urls).toContain('http://198.51.100.41:5201/');
  });

  it('服务端不可用或只给旧静态 viewerUrl 时仍能给出可用地址', () => {
    expect(rankViewerUrls([], 'http://127.0.0.1:5201/')).toEqual(['http://127.0.0.1:5201/']);
    expect(rankViewerUrls(['http://203.0.113.34:5201/'], '')).toEqual(['http://203.0.113.34:5201/']);
  });

  it('服务端把本地 IP 排第一时，浏览器端不会把它重排掉', () => {
    const urls = rankViewerUrls(
      ['http://198.51.100.41:5201/', 'http://198.51.100.16:5201/', 'http://127.0.0.1:5201/'],
      'http://127.0.0.1:5201/',
    );
    expect(urls[0]).toBe('http://198.51.100.41:5201/');
    expect(urls[urls.length - 1]).toBe('http://127.0.0.1:5201/');
  });

  it('多网卡重复候选去重，顺序稳定', () => {
    const urls = rankViewerUrls(
      ['http://198.51.100.41:5201/', 'http://198.51.100.41:5201/', 'http://198.51.100.41:5201/'],
      'http://198.51.100.41:5201/',
    );
    expect(urls).toEqual(['http://198.51.100.41:5201/']);
  });

  it('回环识别覆盖 localhost / 127.0.0.1 / IPv6 字面量', () => {
    expect(isLoopbackViewerUrl('http://localhost:5201/')).toBe(true);
    expect(isLoopbackViewerUrl('http://127.0.0.1:5201/')).toBe(true);
    expect(isLoopbackViewerUrl('http://[::1]:5201/')).toBe(true);
    expect(isLoopbackViewerUrl('http://198.51.100.41:5201/')).toBe(false);
    expect(isLoopbackViewerUrl('not-a-url')).toBe(false);
  });

  it('同源兜底读 location.host，且无 location 的环境安全返回空', () => {
    expect(labInfo).toContain('typeof location');
    expect(labInfo).toContain('location.host');
    expect(sameOriginViewerUrl()).toBe(''); // Node 测试环境没有 window.location
    expect(labInfo).not.toContain('203.0.113.34');
    expect(labInfo).not.toContain('198.51.100.41');
    expect(labInfo).not.toContain('192.0.2.59');
  });
});
