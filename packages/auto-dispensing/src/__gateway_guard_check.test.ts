/**
 * P0 安全边界防回退自检（2026-11-10 全面代码审核后的修复）。
 *
 * 硬约束：
 *  1. PS 桥脚本正文不得拼接任何客户端字段；逻辑站号只走 env + [int] + 整数范围校验；
 *  2. connect 帧必须过协议白名单 / 主机白名单 / 字段类型与范围 / 地址表结构校验；
 *  3. 变量名查不到映射一律报错，禁止 `variables[name] || name` 之类的静默回退；
 *  4. PLC 会话按 WS 连接隔离，同一时刻唯一主控，其余只读；所有分支显式 switch；
 *  5. WS 升级在代理层按 localAddress + Host 判定角色，/ws/plc 只对 teacher 开放，
 *     token 由启动脚本每次签发；观众在中继侧零上行；
 *  6. 三菱写失败不能包装成成功，读失败哨兵 -1 不能转成 true。
 *
 * 运行时验收由 websocket-server/security-check.cjs 覆盖（34 项），本文件只锁源码形态。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const server = read('../../../websocket-server/server.js');
const relay = read('../../../websocket-server/broadcast.js');
const role = read('../../../websocket-server/runtime-role.js');
const vite = read('../../platform/vite.config.ts');
const startLab = read('../../../scripts/start-lab.cjs');
const securityCheck = read('../../../websocket-server/security-check.cjs');
const platformPkg = JSON.parse(read('../../platform/package.json')) as {
  build: { extraResources: { from: string; to: string }[] };
};

describe('P0-1 PowerShell 注入：客户端数据不进脚本正文', () => {
  it('_buildPSScript 无参数，站号从 env 读取并强制 [int]', () => {
    expect(server).toContain('_buildPSScript()');
    expect(server).toContain('$station = [int]$env:DT_MX_STATION');
    expect(server).toContain('$p.ActLogicalStationNumber = $station');
    expect(server).not.toContain('$p.ActLogicalStationNumber = ${station}');
    expect(server).not.toContain('_buildPSScript(this._station)');
  });

  it('spawn 只带一个数值站号 env，且 connect 前做整数 + 范围校验', () => {
    expect(server).toContain('DT_MX_STATION: String(this._station)');
    expect(server).toContain('Number.isInteger(station)');
    expect(server).toContain('station > 1023');
    expect(server).toContain('三菱逻辑站号必须是 0~1023 的整数');
  });
});

describe('P0-4 / P1-2 connect 校验与显式 switch', () => {
  it('协议白名单、主机白名单与逐字段范围校验都在', () => {
    expect(server).toContain("new Set(['modbus', 's7', 'mitsubishi'])");
    expect(server).toContain('function validateConnect(frame)');
    expect(server).toContain('function loadPlcHostAllowlist()');
    expect(server).toContain('DT_PLC_HOSTS');
    expect(server).toContain('intBetween(frame.rack, 0, 7');
    expect(server).toContain('intBetween(frame.slot, 0, 31');
    expect(server).toContain('function copyVarTable(');
    expect(server).toContain('function copyWordTable(');
  });

  it('不再把抽象变量名当软元件名 / S7 地址回退', () => {
    expect(server).not.toContain('this.variables[name] || name');
    expect(server).toContain('_device(name)');
    expect(server).toContain('未知变量名: ${name}（不在 connect 下发的地址表内）');
    expect(server).toContain("throw new Error(`未知 S7 变量: ${tag}`)");
    expect(server).toContain('function validateNames(');
  });

  it('全局单例已移除，读写帧走显式 switch', () => {
    expect(server).not.toContain('let currentProtocol = null');
    expect(server).toContain('const sessions = new Map()');
    expect(server).toContain('let controller = null');
    expect(server).toContain('function activeSession()');
    expect(server).toContain('已有主控连接 PLC');
    expect(server).toContain('PLC 未连接，请先发送 connect');
    expect(server).toContain('当前连接不是 PLC 主控（只读）');
    expect(server).toContain("case 'read-words'");
    expect(server).toContain("case 'write-words'");
    expect(server).toContain("if (type === 'get-status')");
  });

  it('Electron 打包带上网关新增的两个本地依赖', () => {
    const files = platformPkg.build.extraResources.map((e) => e.to);
    expect(files).toContain('websocket-server/dint32.js');
    expect(files).toContain('websocket-server/runtime-role.js');
  });
});

describe('P0-2 代理层与内部服务的角色鉴权', () => {
  it('角色判据以 localAddress 为主，Host 为辅，且覆写信任头', () => {
    expect(role).toContain('isLoopbackAddress(req && req.socket && req.socket.localAddress)');
    expect(role).toContain("if (local === false) return 'viewer'");
    expect(role).toContain('function originMatches(req)');
    expect(role).toContain("req.headers[ROLE_HEADER] = role");
    expect(role).toContain("req.headers[PROXY_HEADER] = '1'");
    expect(role).toContain('DT_INTERNAL_TOKEN');
    expect(role).toContain('function verifyInternalRequest(');
  });

  it('vite 代理在 upstream 建连前拦截 /ws/plc 的 viewer，relay 允许订阅', () => {
    expect(vite).toContain('function guardUpgrade(allowViewer: boolean)');
    expect(vite).toContain("configure: guardUpgrade(false)");
    expect(vite).toContain("configure: guardUpgrade(true)");
    expect(vite).toContain('runtimeRole.applyProxyHeaders(req)');
    expect(vite).toContain('HTTP/1.1 403 Forbidden');
    expect(vite).toContain("target: 'ws://127.0.0.1:8081'");
    expect(vite).toContain("target: 'ws://127.0.0.1:8082'");
  });

  it('启动脚本每次签发一次性 token，Host 解析与网关同源', () => {
    expect(startLab).toContain("require(path.join(WSS, 'runtime-role.js'))");
    expect(startLab).toContain('crypto.randomBytes(24)');
    expect(startLab).toContain('process.env.DT_INTERNAL_TOKEN');
    expect(startLab).toContain('isLoopbackHost(host)');
    expect(startLab).not.toContain("const LOOPBACK_HOSTS = new Set");
  });

  it('网关 / 中继都有 verifyClient，观众上行被丢弃', () => {
    expect(server).toContain('verifyClient: (info) =>');
    expect(server).toContain('verifyInternalRequest(info.req, { allowViewer: false })');
    expect(relay).toContain('verifyClient: (info) =>');
    expect(relay).toContain('verifyInternalRequest(info.req, { allowViewer: true })');
    expect(relay).toContain("if (ws.role !== 'teacher') return;");
    expect(relay).toContain("msg.type === 'report'");
    expect(relay).toContain('RELEASE_GRACE_MS');
    expect(relay).toContain('scheduleRelease(ws)');
  });

  it('可复用的运行时验收脚本存在且覆盖关键断言', () => {
    expect(securityCheck).toContain('PS 注入帧被拦在校验层');
    expect(securityCheck).toContain('LAN IP 访问 /ws/plc 被 403 拒绝');
    expect(securityCheck).toContain('LAN 观众伪造 report 被丢弃');
    expect(securityCheck).toContain('==== RESULT');
  });
});

describe('P1-1 三菱失败语义', () => {
  it('PS 写失败输出 error 字段，JS 侧不吞成成功', () => {
    expect(server).toContain('ok = $false; error = "SetDevice failed (code=$r)"');
    expect(server).toContain('ok = $false; error = ($e -join');
    expect(server).toContain('result.ok === false');
  });

  it('读失败哨兵 -1 不再被 !! 转成 true', () => {
    expect(server).toContain("val === -1");
    expect(server).toContain('读软元件失败: ${devices[i]}');
    expect(server).not.toContain('values[varNames[i]] = !!val;');
  });
});
