/**
 * P3-8：四份设备侧 plc-websocket.ts 已分叉，暂不做大重构（各包地址表不同），
 * 但用行为化护栏锁住「观众短路 / 处置标记 / 30s 连接超时 / 守卫先于建链」，
 * 防止以后只改一份导致其它设备退回旧版缺陷。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const SERVICES = [
  ['auto-dispensing', './services/plc-websocket.ts'],
  ['coal-sorting', '../../coal-sorting/src/services/plc-websocket.ts'],
  ['pneumatic-robot', '../../pneumatic-robot/src/services/plc-websocket.ts'],
  ['traffic-light', '../../traffic-light/src/services/plc-websocket.ts'],
] as const;

describe('设备侧 PLC 服务防护一致性', () => {
  it.each(SERVICES)('%s 具备观众守卫 / 处置标记 / 30s 超时，且守卫在建链之前', (_name, rel) => {
    const src = read(rel);
    const guard = src.indexOf('canOpenPlcChannel()');
    const connect = src.indexOf('new WebSocket(');
    expect(guard, `${rel} 缺少观众守卫`).toBeGreaterThan(-1);
    expect(connect, `${rel} 找不到建链点`).toBeGreaterThan(-1);
    expect(guard, `${rel} 观众守卫必须在建链之前`).toBeLessThan(connect);
    expect(src).toMatch(/_disposed/);
    expect(src).toMatch(/30000/); // 连接就绪轮询的 30s 上限
  });

  it('shared 版 PLC 服务同样带观众守卫与 30s 上限', () => {
    const src = read('../../shared/src/services/modbus-websocket.ts');
    expect(src).toContain('canOpenPlcChannel()');
    expect(src).toMatch(/30\s*000|30000/);
  });
});
