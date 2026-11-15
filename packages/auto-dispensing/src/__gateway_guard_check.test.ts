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
import { describe, it, expect, afterEach } from 'vitest';
import { diffSnapshot, sanitizeSnapshot } from '../../shared/src/sync/snapshotDiff';
import { patchChanged } from '../../shared/src/sync/patchChanged';

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

/** 结构断言之外，再直接调用 Node 侧判定函数验证行为，防「形态对、逻辑被改回」 */
const nodeModule = process.getBuiltinModule('module') as typeof import('node:module');
const nodeRequire = nodeModule.createRequire(import.meta.url);
type Verdict = { ok: boolean; role: 'teacher' | 'viewer'; reason: string };
const roleModule = nodeRequire('../../../websocket-server/runtime-role.js') as {
  verifyInternalRequest: (req: unknown, opts?: { allowViewer?: boolean }) => Verdict;
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

  it('Electron 打包覆盖网关/中继的全部本地 require，新增依赖不会漏打包', () => {
    const files = platformPkg.build.extraResources.map((e) => e.to);
    // 从两份服务源码的真实 require('./xxx') 反推，而不是维护一份容易过期的白名单
    const required = new Set<string>([
      'websocket-server/server.js',
      'websocket-server/broadcast.js',
    ]);
    for (const src of [server, relay]) {
      for (const m of src.matchAll(/require\('\.\/([^']+)'\)/g)) {
        required.add(`websocket-server/${m[1]}.js`);
      }
    }
    expect(required.size).toBeGreaterThanOrEqual(4);
    for (const dep of required) expect(files, `缺少打包项 ${dep}`).toContain(dep);
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

describe('P0 信任链行为：本机直连与 token 判定（纯函数）', () => {
  const savedToken = process.env.DT_INTERNAL_TOKEN;
  afterEach(() => {
    if (savedToken === undefined) delete process.env.DT_INTERNAL_TOKEN;
    else process.env.DT_INTERNAL_TOKEN = savedToken;
  });

  const upgrade = (headers: Record<string, string>, localAddress = '127.0.0.1') => ({
    headers: { host: '127.0.0.1:8081', ...headers },
    socket: { localAddress },
  });
  const verdict = (req: unknown, allowViewer = false) =>
    roleModule.verifyInternalRequest(req, { allowViewer });

  it('本机脚本（无 Origin 头）放行；Origin:null 不再无条件可信（P1-3）', () => {
    expect(verdict(upgrade({}))).toEqual({ ok: true, role: 'teacher', reason: '' });
    expect(verdict(upgrade({ origin: 'null' }))).toEqual({ ok: false, role: 'viewer', reason: 'origin' });
  });

  it('本机跨站网页直连 8081 不得获得 teacher；中继只降级为只读 viewer', () => {
    const evil = upgrade({ origin: 'http://evil.example' });
    expect(verdict(evil)).toEqual({ ok: false, role: 'viewer', reason: 'origin' });
    expect(verdict(evil, true)).toEqual({ ok: true, role: 'viewer', reason: '' });
  });

  it('连接落点与 Host 必须同时是回环，伪造 LAN Host 不能绕过', () => {
    expect(verdict(upgrade({}, '192.168.1.20'))).toEqual({ ok: false, role: 'viewer', reason: 'loopback' });
    expect(verdict(upgrade({ host: '192.168.1.20:8081' })))
      .toEqual({ ok: false, role: 'viewer', reason: 'loopback' });
  });

  it('token 已签发时缺头 / 错头一律拒绝，正确头才放行', () => {
    process.env.DT_INTERNAL_TOKEN = 'audit-token';
    const base = { 'x-dt-proxy': '1', 'x-dt-role': 'teacher' };
    expect(verdict(upgrade(base))).toEqual({ ok: false, role: 'viewer', reason: 'token' });
    expect(verdict(upgrade({ ...base, 'x-dt-internal-token': 'stale' })))
      .toEqual({ ok: false, role: 'viewer', reason: 'token' });
    expect(verdict(upgrade({ ...base, 'x-dt-internal-token': 'audit-token' })))
      .toEqual({ ok: true, role: 'teacher', reason: '' });
  });

  it('dev 直启未签发 token 时，客户端自带 token 头也不能串入；viewer 仍进不了网关', () => {
    delete process.env.DT_INTERNAL_TOKEN;
    expect(verdict(upgrade({ 'x-dt-proxy': '1', 'x-dt-internal-token': 'forged' })))
      .toEqual({ ok: false, role: 'viewer', reason: 'token' });
    expect(verdict(upgrade({ 'x-dt-proxy': '1', 'x-dt-role': 'viewer' })))
      .toEqual({ ok: false, role: 'viewer', reason: 'role' });
    expect(verdict(upgrade({ 'x-dt-proxy': '1', 'x-dt-role': 'viewer' }), true))
      .toEqual({ ok: true, role: 'viewer', reason: '' });
  });
});

describe('阶段 0 韧性加固防回退', () => {
  it('网关与中继都有帧上限、单连接 error 监听、ping/pong 与进程兜底', () => {
    for (const src of [server, relay]) {
      expect(src).toContain('maxPayload: MAX_WS_FRAME');
      expect(src).toContain('perMessageDeflate: false');
      expect(src).toContain("ws.on('error'");
      expect(src).toContain("ws.on('pong'");
      expect(src).toContain('ws.ping()');
      expect(src).toContain('unhandledRejection');
      expect(src).toContain('uncaughtException');
    }
    expect(relay).toContain('bufferedAmount');
  });

  it('启动脚本能发现子进程崩溃、限次重启并关闭 Web 监听', () => {
    expect(startLab).toContain('restartCounts');
    expect(startLab).toContain('MAX_RESTART');
    expect(startLab).toContain("child.on('error'");
    expect(startLab).toContain('previewServer.httpServer?.close?.()');
    // P2-5：稳定窗口清零重启计数、error 事件也触发重启、内部口只探回环避免虚拟网卡误报
    expect(startLab).toContain('RESTART_STABLE_MS');
    expect(startLab).toContain('scheduleRestart()');
    expect(startLab).toContain('VIRTUAL_NIC');
    expect(startLab).toContain('if (port === PORT)');
    // P2-6：connect 占坑必须早于第一个 await
    const connectBlock = server.slice(server.indexOf("if (type === 'connect')"), server.indexOf("if (type === 'disconnect')"));
    expect(connectBlock.indexOf('pendingConnect = ws')).toBeLessThan(connectBlock.indexOf('await releaseController'));
  });

  it('平台入口有错误边界，观众端容器关阴影并锁 dpr', () => {
    expect(read('../../platform/src/main.tsx')).toContain('AppErrorBoundary');
    expect(read('../../platform/src/main.tsx')).toContain('autoReload={isViewerRuntime()}');
    const wrapperDirs = [
      'pneumatic-robot/src/platform/PneumaticSceneWrapper.tsx',
      'traffic-light/src/platform/TrafficSceneWrapper.tsx',
      'md520-vfd/src/platform/VfdSceneWrapper.tsx',
      'inovance-gantry/src/platform/GantrySceneWrapper.tsx',
      'liquid-mixing/src/platform/LiquidSceneWrapper.tsx',
    ];
    for (const file of wrapperDirs) {
      const src = read(`../../${file}`);
      expect(src, file).toContain('shadows={!isViewer}');
      expect(src, file).toContain('dpr={renderPixelRatio(isViewer)}');
      expect(src, file).toContain('<Suspense fallback={null}>');
    }
    expect(read('../../shared/src/components/PhysicsScene.tsx')).toContain('dpr={1}');
  });

  it('延迟统计收敛到公共模块、有界且异步写盘，manualChunks 不留空 facade', () => {
    // 三协议统计实现已抽到 latency-report.js：网关只保留三处调用，杜绝口径漂移
    const latencyReport = read('../../../websocket-server/latency-report.js');
    expect(latencyReport).toContain('const MAX_SAMPLES = 2000');
    expect(latencyReport).toContain('fs.appendFile(');
    expect(latencyReport).not.toContain('appendFileSync');
    expect(latencyReport).not.toContain('writeFileSync');
    expect((server.match(/printLatencyStats\(this\.latencyStats, LATENCY_META\./g) || []).length).toBe(3);
    expect(server).not.toContain('const calcStats = (arr)');
    expect(server).not.toContain('total % 50');
    // 函数式分组把 React 与 preload helper 绑在一起，避免 3D 依赖回到首屏
    expect(vite).toContain('manualChunks(id)');
    expect(vite).toContain("if (p.includes('vite/preload-helper')) return 'vendor-react'");
    // Rapier 不手动分组，由 Rollup 从真正引用它的设备 chunk 抽共享 wasm chunk
    expect(vite).toContain("if (p.includes('/node_modules/@react-three/rapier/') || p.includes('/node_modules/@dimforge/')) return undefined");
    expect(vite).toContain('return undefined');
  });
});

describe('快照有限数守卫（P2-3）', () => {
  it('NaN / Infinity / undefined 不进 delta，也不被当作删除标记', () => {
    expect(diffSnapshot({ A: 1, B: 2 }, { A: Number.NaN, B: 3 })).toEqual({ B: 3 });
    expect(diffSnapshot({ A: 1 }, { A: Number.POSITIVE_INFINITY })).toEqual({});
    expect(diffSnapshot({ A: 1 }, { A: undefined as unknown as number })).toEqual({});
    expect(diffSnapshot({ A: 1 }, {})).toEqual({ A: null }); // 真正的键消失仍要发删除标记
  });

  it('全量帧清洗非法值，避免 JSON null 与删除标记混淆', () => {
    expect(sanitizeSnapshot({ A: Number.NaN, B: 2, C: true, D: undefined as unknown as number }))
      .toEqual({ B: 2, C: true });
  });
});

describe('快照差分：浏览器 diff 与 Node merge 口径配套', () => {
  const nodeDiff = nodeRequire('../../../websocket-server/snapshot-diff.js') as {
    mergeSnapshot: (base: Record<string, unknown>, delta: Record<string, unknown>) => Record<string, unknown>;
    sameSnapshot: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean;
  };

  it('merge(diff(base,next)) 恒等于 next，含删除键、布尔与 NaN', () => {
    const cases: Array<[Record<string, boolean | number>, Record<string, boolean | number>]> = [
      [{}, { A: 1, B: false }],
      [{ A: 1, B: 2 }, { A: 1, B: 3, C: true }],
      [{ A: 1, B: 2, PILL_1_X: 5 }, { A: 1 }],
    ];
    for (const [base, next] of cases) {
      const merged = nodeDiff.mergeSnapshot(base, diffSnapshot(base, next));
      expect(nodeDiff.sameSnapshot(merged, next), JSON.stringify({ base, next, merged })).toBe(true);
    }
    // P2-3：NaN 不再进入 delta，合并后必须保留上一帧有效值而非被误删
    const base = { A: 0 };
    const merged = nodeDiff.mergeSnapshot(base, diffSnapshot(base, { A: Number.NaN }));
    expect(nodeDiff.sameSnapshot(merged, base)).toBe(true);
  });

  it('主控只发变化键、中继维持完整镜像并按 1s 保活扇出', () => {
    const relay = read('../../../websocket-server/broadcast.js');
    const shell = read('../../platform/src/WorkspaceShell.tsx');
    expect(relay).toContain("require('./snapshot-diff')");
    expect(relay).toContain('SNAPSHOT_KEEPALIVE_MS');
    expect(relay).toContain('mergeSnapshot(this.vars, incoming)');
    // 不带 delta 的旧帧必须无条件广播，安全自检与旧主控不受影响
    expect(relay).toContain('if (msg.delta !== true)');
    expect(shell).toContain('diffSnapshot(lastVars, next)');
    expect(shell).toContain('delta: !full');
    expect(shell).toContain('sentFull = true');
  });
});

describe('首屏拆分：启动器壳与工作区分层', () => {
  it('入口与角色判定走 shared 子路径，不碰 barrel 的 PhysicsScene', () => {
    for (const file of ['../../platform/src/App.tsx', '../../platform/src/main.tsx']) {
      const src = read(file);
      expect(src, file).toContain("from '@digital-twin/shared/runtime/runtimeRole'");
      expect(src, file).not.toContain("from '@digital-twin/shared'");
    }
  });

  it('工作区按需加载，启动器只依赖轻量设备元数据', () => {
    const app = read('../../platform/src/App.tsx');
    expect(app).toContain("lazy(() => import('./TeacherWorkspace')");
    expect(app).toContain("lazy(() => import('./ViewerWorkspace')");
    expect(app).toContain('DEVICE_META');
    expect(app).not.toContain("from './registry'");
    const launcher = read('../../platform/src/LauncherPage.tsx');
    expect(launcher).toContain('readonly DeviceMeta[]');
    expect(launcher).toContain('device.modeCount');
    expect(read('../../platform/src/deviceCatalog.ts')).toContain('import.meta.glob');
    expect(read('../../platform/src/deviceMeta.ts')).toContain('DEVICE_META');
    const teacher = read('../../platform/src/TeacherWorkspace.tsx');
    expect(teacher).toContain('loadDevice(deviceId)');
    expect(teacher).toContain('getDevice(deviceId) ?? null');
    expect(read('../../platform/src/ViewerWorkspace.tsx')).toContain('loadDevice(id)');
    expect(read('../../platform/src/registry.ts')).toContain('export const DEVICE_LOADERS');
  });

  it('物理组件走子路径，纯视觉地面不再拉 Rapier', () => {
    expect(read('../../shared/src/index.ts')).not.toContain('export { PhysicsScene }');
    expect(read('../../shared/src/components/Ground.tsx')).not.toContain('@react-three/rapier');
    expect(read('../../shared/src/components/PhysicsGround.tsx')).toContain('@react-three/rapier');
    // 断言「不再静态 import 物理场景」，注释里提到名字不算回退
    for (const file of ['../../platform/src/WorkspaceShell.tsx', '../../platform/src/ViewerWorkspace.tsx']) {
      expect(read(file), file).not.toMatch(/import\s*\{[^}]*PhysicsScene/);
    }
  });

  it('元数据与注册表逐项核对，防止两份数据漂移', () => {
    const registry = read('../../platform/src/registry.ts');
    expect(registry).toContain('DEVICE_META');
    expect(registry).toContain('设备元数据与注册表不一致');
    expect(registry).toContain('meta.modeCount === device.modes.length');
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

describe('tick 写入守卫 patchChanged', () => {
  it('值全同返回 false，连续量变化返回 true', () => {
    const prev = { angle: 1.25, running: false, volumes: { a: 80, b: 60 }, flags: { DO1: false, FM: true } };
    expect(patchChanged(prev, { angle: 1.25, volumes: { a: 80, b: 60 }, flags: { DO1: false, FM: true } })).toBe(false);
    expect(patchChanged(prev, { angle: 1.26 })).toBe(true);
    expect(patchChanged(prev, { volumes: { a: 79, b: 60 } })).toBe(true);
    expect(patchChanged(prev, { flags: { DO1: false, FM: false } })).toBe(true);
    expect(patchChanged(prev, { volumes: { a: 80 } })).toBe(true);
  });

  it('数组 / 嵌套对象保守视为变化，NaN 不误判', () => {
    const prev = { pieces: [{ id: 1, x: 0 }], nan: Number.NaN, nested: { a: { b: 1 } } };
    expect(patchChanged(prev, { pieces: [{ id: 1, x: 0 }] })).toBe(true);
    expect(patchChanged(prev, { nan: Number.NaN })).toBe(false);
    expect(patchChanged(prev, { nested: { a: { b: 1 } } })).toBe(true);
  });

  it('三个设备 tick 都接了写入守卫', () => {
    for (const file of [
      '../../liquid-mixing/src/stores/useLiquidStore.ts',
      '../../inovance-gantry/src/stores/useGantryStore.ts',
      '../../md520-vfd/src/stores/useVfdStore.ts',
    ]) {
      const src = read(file);
      expect(src, file).toContain("from '@digital-twin/shared/sync/patchChanged'");
      expect(src, file).toContain('if (patchChanged(s, patch)) set(patch)');
    }
  });
});

describe('观众端失败恢复与清场（第二轮审核 P1 修复）', () => {
  const viewer = read('../../platform/src/ViewerWorkspace.tsx');

  it('设备加载失败回退 id 并退避重试，不永久卡在加载中', () => {
    expect(viewer).toContain('RETRY_DELAY_MS');
    expect(viewer).toContain('retryAtRef.current = Date.now() + RETRY_DELAY_MS');
    expect(viewer).toContain('deviceIdRef.current = null');
    expect(viewer).toContain('setLoadError(');
    expect(viewer).toContain('data-dt-viewer-retry');
    expect(viewer).toContain('data-viewer-load-error');
  });

  it('主控离开清场，渲染双校验避免残留旧 3D 画面', () => {
    expect(viewer).toContain('const clearDevice = () =>');
    expect(viewer).toContain('if (!id) {');
    expect(viewer).toContain('clearDevice();');
    expect(viewer).toContain('activeDeviceId && device?.id === activeDeviceId');
    expect(viewer).toContain('!Scene || !device');
  });

  it('观众错误边界重载有退避与上限（P2-4）', () => {
    const boundary = read('../../platform/src/AppErrorBoundary.tsx');
    expect(boundary).toContain('RELOAD_DELAYS');
    expect(boundary).toContain('RELOAD_MAX');
    expect(boundary).toContain('RELOAD_RESET_MS');
    expect(boundary).toContain('sessionStorage');
    expect(boundary).toContain('exhausted');
  });
});

describe('P1-3 opaque origin 与 Electron 一次性凭据', () => {
  const saved = process.env.DT_INTERNAL_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.DT_INTERNAL_TOKEN;
    else process.env.DT_INTERNAL_TOKEN = saved;
  });

  const opaqueReq = (url = '/') => ({
    headers: { host: '127.0.0.1:8081', origin: 'null' },
    socket: { localAddress: '127.0.0.1' },
    url,
  });

  it('Origin:null 无凭据被拒，持主进程凭据才放行 teacher', () => {
    process.env.DT_INTERNAL_TOKEN = 'unit-electron-token';
    expect(roleModule.verifyInternalRequest(opaqueReq(), { allowViewer: false }).ok).toBe(false);
    const withToken = roleModule.verifyInternalRequest(opaqueReq('/?dt_token=unit-electron-token'), { allowViewer: false });
    expect(withToken.ok).toBe(true);
    expect(withToken.role).toBe('teacher');
  });

  it('代理层判定为跨站 origin 时，网关复核信任头并拒绝', () => {
    process.env.DT_INTERNAL_TOKEN = 'unit-electron-token';
    const proxied = {
      headers: {
        host: '127.0.0.1:8081',
        'x-dt-role': 'teacher',
        'x-dt-proxy': '1',
        'x-dt-internal-token': 'unit-electron-token',
        'x-dt-origin-ok': '0',
      },
      socket: { localAddress: '127.0.0.1' },
      url: '/',
    };
    expect(roleModule.verifyInternalRequest(proxied, { allowViewer: false }).ok).toBe(false);
  });

  it('Web 版 CSP 只放行 self，Electron 专用 HTML 由构建期生成', () => {
    const html = read('../../platform/index.html');
    expect(html).toMatch(/connect-src 'self';/);
    // wasm 编译需要 wasm-unsafe-eval，但不允许完整的 JS eval
    expect(html).toContain("'wasm-unsafe-eval'");
    expect(html).not.toMatch(/'unsafe-eval'/);
    expect(read('../../platform/vite.config.ts')).toContain('index-electron.html');
    expect(read('../../platform/electron/main.ts')).toContain('DT_INTERNAL_TOKEN');
  });
});
