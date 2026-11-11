/**
 * 运行态端口边界防回退自检（2026-11-09 端口设计聚焦分析后的 P0 收口）。
 *
 * 硬约束：
 *  1. 对外只有 :5201；8081 / 8082 / 1505 / 5085 必须显式绑定 127.0.0.1，
 *     不能靠「防火墙默认拦住」或只在前端用 canOpenPlcChannel() 守卫；
 *  2. WebSocket.Server 的 host 是安全边界，不允许从配置或环境变量放开；
 *  3. CSP connect-src 只留 'self' 与 Electron file:// 回退所需的两条本机直连，
 *     不得再出现通配端口 / 已废弃端口；
 *  4. 内部端口与 vite.config.ts 的 WS_PROXY 目标硬绑定，启动前必须校验，
 *     否则改端口会表现为「页面能开但 PLC 连不上」的静默断链。
 *
 * 说明：其余 10 份各包 vite 配置只用于独立 dev，
 * start:lab 运行态只加载 platform/vite.config.ts，不在本自检范围内。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const startLab = read('../../../scripts/start-lab.cjs');
const server = read('../../../websocket-server/server.js');
const relay = read('../../../websocket-server/broadcast.js');
const mockPlc = read('../../../websocket-server/mock-dispensing-server.js');
const conveyorPlc = read('../../../websocket-server/mock-conveyor-server.js');
const edge = read('../../../websocket-server/edge-broadcast.json');
const shellHtml = read('../../platform/index.html');
const platformVite = read('../../platform/vite.config.ts');
const wsEndpoints = read('../../shared/src/services/wsEndpoints.ts');

/** 取整段构造参数：加鉴权后选项跨多行，不能只看 new WebSocket.Server({ 那一行 */
const wsServerOptions = (src: string): string => {
  const start = src.indexOf('new WebSocket.Server({');
  if (start < 0) return '';
  const end = src.indexOf('});', start);
  return end < 0 ? '' : src.slice(start, end + 3);
};

describe('内部服务绑定：只监听 127.0.0.1', () => {
  it('PLC 网关 8081 显式绑定回环，且 host 不受环境变量控制', () => {
    expect(server).toContain("const WS_HOST = '127.0.0.1'");
    expect(wsServerOptions(server)).toContain('host: WS_HOST');
    expect(server).not.toMatch(/WS_HOST\s*=\s*process\.env/);
    expect(server).not.toContain("host: '0.0.0.0'");
  });

  it('状态中继 8082 显式绑定回环，且不允许从配置放开', () => {
    expect(relay).toContain("const BROADCAST_HOST = '127.0.0.1'");
    expect(wsServerOptions(relay)).toContain('host: BROADCAST_HOST');
    expect(relay).not.toMatch(/config\.(broadcastHost|host)/);
    expect(relay).not.toContain("host: '0.0.0.0'");
  });

  it('虚拟 PLC 的 Modbus 口与状态口仍绑回环', () => {
    expect(mockPlc).toContain("host: '127.0.0.1'");
    expect(mockPlc).toContain("httpServer.listen(HTTP_PORT, '127.0.0.1'");
  });

  it('传送带场景独立虚拟 PLC 也只绑回环，且两个场景不共用寄存器区', () => {
    expect(conveyorPlc).toContain("host: '127.0.0.1'");
    expect(conveyorPlc).toContain("httpServer.listen(HTTP_PORT, '127.0.0.1'");
    expect(conveyorPlc).toContain('vfdPlcScan');
    expect(conveyorPlc).not.toContain('DISPENSING_ADDRESSES');
    expect(mockPlc).not.toContain('isVfdAddress');
    expect(mockPlc).not.toContain('vfdWords');
  });

  it('只有 Web 服务对外监听', () => {
    expect(startLab).toContain("preview: { host: '0.0.0.0'");
    expect(startLab).toContain('均绑定 127.0.0.1，外部访问不到');
  });
});

describe('CSP 与代理：同源优先，file:// 回退不丢', () => {
  it('connect-src 只剩 self 与两条本机直连', () => {
    const csp = shellHtml.match(/connect-src[^;]*/)?.[0] ?? '';
    expect(csp).toContain("'self'");
    expect(csp).toContain('ws://127.0.0.1:8081');
    expect(csp).toContain('ws://127.0.0.1:8082');
    expect(csp).not.toMatch(/ws:\/\/\*:8081|ws:\/\/\*:8082|ws:\/\/\*:8083|wss:\/\/\*:8084/);
    expect(csp).not.toMatch(/ws:\/\/localhost:\*|ws:\/\/127\.0\.0\.1:\*|wss:\/\/\*:\*/);
  });

  it('运行态代理目标仍是本机 8081 / 8082', () => {
    expect(platformVite).toContain("target: 'ws://127.0.0.1:8081'");
    expect(platformVite).toContain("target: 'ws://127.0.0.1:8082'");
    expect(platformVite).toContain('ws: true');
  });

  it('Electron file:// 回退直连的两个端口常量仍在', () => {
    expect(wsEndpoints).toContain('PLC_WS_PORT = 8081');
    expect(wsEndpoints).toContain('RELAY_WS_PORT = 8082');
    expect(wsEndpoints).toContain("protocol === 'file:'");
    expect(wsEndpoints).toContain('canOpenPlcChannel');
  });
});

describe('启动脚本：端口漂移 fail-fast，占用不再静默复用', () => {
  it('内部端口与代理目标不一致时拒绝启动', () => {
    expect(startLab).toContain('function assertInternalPorts()');
    expect(startLab).toContain('assertInternalPorts();');
    expect(startLab).toContain('WS_PORT');
    expect(startLab).toContain('broadcastPort');
    expect(startLab).toContain('与同源代理目标');
  });

  it('两个场景各自启动独立虚拟 PLC，端口不混用', () => {
    expect(startLab).toContain('CONVEYOR_PLC_PORT = 1503');
    expect(startLab).toContain("path.join(WSS, 'mock-conveyor-server.js')");
    expect(startLab).toContain("path.join(WSS, 'mock-dispensing-server.js')");
    expect(startLab).toContain('两个场景必须独立');
  });

  it('端口被占用改为明确告警，不再写成静默沿用', () => {
    expect(startLab).toContain('[lab] 警告：');
    expect(startLab).toContain('该实例可能不是当前版本');
    expect(startLab).not.toContain('跳过 ${name}（端口已被占用');
  });

  it('广播配置不再带误导性的网关桥接地址', () => {
    expect(edge).not.toContain('bridgeUrl');
    expect(JSON.parse(edge).broadcastPort).toBe(8082);
  });

  it(':5201 占用先预检并给出可直接访问的提示，不再抛 Vite 原始异常', () => {
    expect(startLab).toContain('if (await portBusy(PORT))');
    expect(startLab).toContain('实验室很可能已经在运行');
    expect(startLab).toContain('npm run start:lab');
    expect(startLab).toContain('process.exitCode = 1');
    const pre = startLab.indexOf('if (await portBusy(PORT))');
    const post = startLab.indexOf("const { preview } = require('vite')");
    expect(pre).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(pre);
  });
});
