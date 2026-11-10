/**
 * P1-7：煤料智能分拣 PLC WebSocket 服务防回退自检。
 *
 * coal-sorting 包没有 vitest 配置，因此这里做源码级断言（与同目录
 * __mitsubishi_profile_check.test.ts 的 read() 写法一致），直接读取 coal 源码，
 * 把 traffic 版已修的 5 个修复点钉死，防止旧审核报告 4 问题整套回退：
 *   import 即连构造 / 无超时 connect 永久挂起 / 心跳无并发守卫 /
 *   disconnect 后重连链复活 / 观众端建通道。
 *
 * 注：websocket-server/ 在仓库根（参考测试用 ../../../），
 * 而 coal-sorting/ 在 packages/ 下，故这里用 ../../（与 ../../shared/src/ 同级深度）。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const coalPlcSource = read('../../coal-sorting/src/services/plc-websocket.ts');

describe('P1-7 coal-sorting PLC WebSocket 防回退', () => {
  it('构造不再 import 即连：constructor 体内不调用 _connectWS()', () => {
    // 旧版回退形态：constructor() { this._connectWS(); } —— 整段禁止出现
    expect(coalPlcSource).not.toContain('constructor() { this._connectWS(); }');
    const ctor = coalPlcSource.match(/constructor\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
    expect(ctor).not.toBeNull();
    expect(ctor![1]).not.toMatch(/_connectWS\s*\(/);
  });

  it('有 _disposed：字段 + connect 复位 + disconnect 置位 + 两处重连守卫', () => {
    expect(coalPlcSource).toContain('private _disposed = false;');
    expect(coalPlcSource).toContain('this._disposed = false;');
    expect(coalPlcSource).toContain('this._disposed = true;');
    const guards = coalPlcSource.match(/if \(this\._disposed\) return;/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it('有 30s 连接超时：connect() 内 setTimeout(30000) + reject + clearTimeout', () => {
    expect(coalPlcSource).toContain('30000');
    expect(coalPlcSource).toContain('WebSocket连接超时(30s)');
    expect(coalPlcSource).toContain('reject(new Error');
    expect(coalPlcSource).toContain('clearTimeout(timeoutId)');
  });

  it('有 _heartbeatRunning 守卫：字段 + 入口 return + try/finally 复位', () => {
    expect(coalPlcSource).toContain('private _heartbeatRunning = false;');
    expect(coalPlcSource).toContain('if (this._heartbeatRunning) return;');
    expect(coalPlcSource).toContain('this._heartbeatRunning = true;');
    expect(coalPlcSource).toContain('finally { this._heartbeatRunning = false; }');
  });

  it('有 canOpenPlcChannel() 观众端守卫：导入 + _connectWS 入口拦截', () => {
    expect(coalPlcSource).toContain('canOpenPlcChannel');
    expect(coalPlcSource).toContain('if (!canOpenPlcChannel()) return;');
  });

  it('硬约束：plcService 单例仍在，且保留 coal 专属地址表、未误抄 traffic 变量名', () => {
    expect(coalPlcSource).toContain('export const plcService = new PlcWebSocketService();');
    expect(coalPlcSource).toContain("from '../scenes/coal-sorting/constants'");
    expect(coalPlcSource).toContain('const CONNECT_VARIABLES');
    expect(coalPlcSource).not.toContain('../scenes/traffic-light/constants');
    expect(coalPlcSource).not.toContain('交通灯 IO');
  });
});
