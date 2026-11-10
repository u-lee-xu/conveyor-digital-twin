/**
 * 三菱「仿真 X/Y / 实体 M 区」双档防回退自检（用户 2026-11-10 定稿）。
 *
 * 硬约束：
 *  1. GX Simulator2 仿真档沿用 X0~X31 / Y0~Y16（八进制），现有表一个字都不改；
 *     实体 FX3U / FX5U 档才用 M100~M123 / M130~M144，因为实体 PLC 的 X 会被
 *     END 后的 I/O 刷新覆盖、Y 会被程序刷新覆盖。
 *  2. 两档只切换「抽象变量名 → 软元件名」这层映射：39 个键完全一致，
 *     位置 DINT 恒为 D120·D121，Modbus / S7 两列恒定不变。
 *  3. 档位进 PlcConfig 并随 _lastConfig 重放，WS 重连不退回默认档。
 *  4. 共享连接面板用 enableMitsubishiProfile 门控，其它设备包零行为变化。
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { PlcConnConfig } from '@digital-twin/shared';
import {
  MITSUBISHI_READ_VARS, MITSUBISHI_WRITE_VARS, MITSUBISHI_DISPLAY_VARS,
  MITSUBISHI_REAL_READ_VARS, MITSUBISHI_REAL_WRITE_VARS, MITSUBISHI_REAL_DISPLAY_VARS,
  mitsubishiBoolVarsFor, ENCODER_DINT,
  type MitsubishiVarName,
} from './scenes/auto-dispensing/constants';
import {
  ioAddressRows, pointAddressRow, ALL_OUTPUT_POINTS, MANUAL_INPUT_POINTS,
} from './scenes/auto-dispensing/manualIo';
import { buildDispensingHelpContent } from './scenes/auto-dispensing/helpContent';
import { useAppStore } from './stores/useAppStore';
import { PlcWebSocketService, type PlcConfig } from './services/plc-websocket';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const points = [...MANUAL_INPUT_POINTS, ...ALL_OUTPUT_POINTS];

afterEach(() => {
  useAppStore.setState({ mitsubishiProfile: 'simulator' });
});

describe('仿真档 X/Y 是单一真值，实体档另起独立 M 表', () => {
  it('基线：现有 X/Y 表与 D120 位置口径一个字都没改', () => {
    expect(MITSUBISHI_READ_VARS.BUTTON_START).toBe('X0');
    expect(MITSUBISHI_READ_VARS.MSC_TILT_DUMP).toBe('X31');
    expect(MITSUBISHI_WRITE_VARS.CYL_TILT_RETRACT).toBe('Y16');
    expect(MITSUBISHI_DISPLAY_VARS.CYL_SEND_A_RETRACT).toBe('Y12');
    expect(ENCODER_DINT.MITSUBISHI_ADDRESS).toBe('D120');
    expect(ENCODER_DINT.WORD_ORDER).toBe('low-first');
  });

  it('实体档输入表 24 键 M100~M123，键集合与仿真读表完全一致', () => {
    expect(Object.keys(MITSUBISHI_REAL_READ_VARS)).toEqual(Object.keys(MITSUBISHI_READ_VARS));
    expect(Object.keys(MITSUBISHI_REAL_READ_VARS)).toHaveLength(24);
    expect(Object.values(MITSUBISHI_REAL_READ_VARS)).toEqual(
      Array.from({ length: 24 }, (_, i) => `M${100 + i}`),
    );
    expect(Object.values(MITSUBISHI_REAL_READ_VARS).every((v) => /^M\d+$/.test(v))).toBe(true);
  });

  it('实体档输出表 15 键 M130~M144，键集合与仿真写表完全一致', () => {
    expect(Object.keys(MITSUBISHI_REAL_WRITE_VARS)).toEqual(Object.keys(MITSUBISHI_WRITE_VARS));
    expect(Object.keys(MITSUBISHI_REAL_WRITE_VARS)).toHaveLength(15);
    expect(Object.values(MITSUBISHI_REAL_WRITE_VARS)).toEqual(
      Array.from({ length: 15 }, (_, i) => `M${130 + i}`),
    );
    expect(Object.values(MITSUBISHI_REAL_WRITE_VARS).every((v) => /^M\d+$/.test(v))).toBe(true);
  });

  it('实体档展示表 39 键无重复、无 X/Y、无抽象变量名漏出', () => {
    const values = Object.values(MITSUBISHI_REAL_DISPLAY_VARS);
    expect(Object.keys(MITSUBISHI_REAL_DISPLAY_VARS)).toHaveLength(39);
    expect(new Set(values).size).toBe(39);
    expect(values.every((v) => /^M\d+$/.test(v))).toBe(true);
    expect(Object.keys(MITSUBISHI_REAL_DISPLAY_VARS).sort())
      .toEqual(Object.keys(MITSUBISHI_DISPLAY_VARS).sort());
  });

  it('解析器是单一入口：仿真档指向 X/Y 表、实体档指向 M 表', () => {
    expect(mitsubishiBoolVarsFor('simulator')).toBe(MITSUBISHI_DISPLAY_VARS);
    expect(mitsubishiBoolVarsFor('real')).toBe(MITSUBISHI_REAL_DISPLAY_VARS);
  });

  it('两档键集合相同、值前缀互斥，防后端 variables[name] || name 静默回退', () => {
    const sim = mitsubishiBoolVarsFor('simulator');
    const real = mitsubishiBoolVarsFor('real');
    expect(Object.keys(sim).sort()).toEqual(Object.keys(real).sort());
    expect(Object.values(sim).every((v) => /^[XY]\d+$/.test(v))).toBe(true);
    expect(Object.values(real).every((v) => /^M\d+$/.test(v))).toBe(true);
  });
});

describe('地址浮框随档变化，另两列恒定', () => {
  it('ioAddressRows 仿真档等于 X/Y 真值、实体档全 M，Modbus/S7 两列逐项相等', () => {
    const simRows = ioAddressRows(points, 'simulator');
    const realRows = ioAddressRows(points, 'real');
    expect(simRows.every((r, i) => r.mitsubishi === MITSUBISHI_DISPLAY_VARS[points[i].key as MitsubishiVarName])).toBe(true);
    expect(realRows.every((r) => /^M\d+$/.test(r.mitsubishi))).toBe(true);
    expect(simRows.map((r) => r.modbus)).toEqual(realRows.map((r) => r.modbus));
    expect(simRows.map((r) => r.s7)).toEqual(realRows.map((r) => r.s7));
  });

  it('pointAddressRow 单个变量名两档给出正确软元件', () => {
    expect(pointAddressRow('MOTOR_FWD', 'x', 'simulator').mitsubishi).toBe('Y0');
    expect(pointAddressRow('MOTOR_FWD', 'x', 'real').mitsubishi).toBe('M130');
    expect(pointAddressRow('BUTTON_START', 'x', 'real').mitsubishi).toBe('M100');
    expect(pointAddressRow('CYL_TILT_RETRACT', 'x', 'real').mitsubishi).toBe('M144');
  });

  it('无参调用读 store 当前档位，调用点零改动也能切档', () => {
    expect(useAppStore.getState().mitsubishiProfile).toBe('simulator');
    expect(ioAddressRows(points).every((r) => /^[XY]\d+$/.test(r.mitsubishi))).toBe(true);
    useAppStore.setState({ mitsubishiProfile: 'real' });
    expect(ioAddressRows(points).every((r) => /^M\d+$/.test(r.mitsubishi))).toBe(true);
    expect(pointAddressRow('BUTTON_START', 'x').mitsubishi).toBe('M100');
    expect(buildDispensingHelpContent().addresses?.sections[0].rows[0].addressCells[2]).toBe('M100');
  });

  it('帮助页两档列名恒定，布尔行三菱列随档切换', () => {
    const sim = buildDispensingHelpContent('simulator');
    const real = buildDispensingHelpContent('real');
    const columns = ['ModbusTCP', 'Siemens S7', '三菱 FX'];
    expect(sim.addresses?.columns).toEqual(columns);
    expect(real.addresses?.columns).toEqual(columns);
    const boolCells = (content: typeof sim) => [
      ...content.addresses!.sections[0].rows,
      ...content.addresses!.sections[1].rows,
    ].map((r) => r.addressCells[2]);
    expect(boolCells(sim).every((v) => /^[XY]\d+$/.test(v))).toBe(true);
    expect(boolCells(real).every((v) => /^M\d+$/.test(v))).toBe(true);
  });

  it('帮助页仿真档保留 X/Y 八进制说明，实体档改 M 区且不残留仿真口径', () => {
    const simText = JSON.stringify(buildDispensingHelpContent('simulator'));
    expect(simText).toContain('X0/X1');
    expect(simText).toContain('C0');
    expect(simText).toContain('八进制');
    expect(simText).toContain('D120');

    const realText = JSON.stringify(buildDispensingHelpContent('real'));
    ['X0~X31', 'Y0~Y16', '八进制', 'X0/X1', 'Y12~Y16'].forEach((s) => {
      expect(realText).not.toContain(s);
    });
    expect(realText).toContain('M100~M123');
    expect(realText).toContain('M130~M144');
    expect(realText).toContain('D120');
    expect(realText).toContain('D121');
  });
});

describe('connect 帧按档选表，重连不丢档', () => {
  const plcSource = read('./services/plc-websocket.ts');

  it('源码闸：三菱表在调用时现算，数值通道与 _lastConfig 保持原样', () => {
    expect(plcSource).toContain('profile?: MitsubishiProfile');
    expect(plcSource).toContain('mitsubishiBoolVarsFor(config.profile');
    expect(plcSource).toContain('wordVariables: CONNECT_WORDS');
    expect(plcSource).toContain('this._lastConfig = config');
    expect(plcSource).not.toContain('mitsubishi: { ...MITSUBISHI_READ_VARS');
  });

  it('实体档 connect 帧 39 项全 M、D120 两字；重放 _lastConfig 仍是 M', async () => {
    const frames: Record<string, unknown>[] = [];
    const svc = Object.create(PlcWebSocketService.prototype) as Record<string, unknown>;
    svc._connected = true;
    svc._protocol = 'modbus';
    svc._lastConfig = null;
    svc.recordSuccess = () => undefined;
    svc.startHeartbeat = () => undefined;
    svc._sendRaw = async (msg: Record<string, unknown>) => {
      frames.push(msg);
      return { success: true };
    };
    const connect = svc.connect as (c: PlcConfig) => Promise<unknown>;
    const sendConnect = svc._sendConnect as (c: PlcConfig) => Promise<unknown>;
    const cfg: PlcConfig = { host: '127.0.0.1', port: 0, protocol: 'mitsubishi', profile: 'real' };

    await connect.call(svc, cfg);
    expect(svc._lastConfig).toBe(cfg);
    await sendConnect.call(svc, svc._lastConfig as PlcConfig);

    expect(frames).toHaveLength(2);
    frames.forEach((f) => {
      const vars = f.variables as Record<string, string>;
      expect(Object.keys(vars)).toHaveLength(39);
      expect(Object.values(vars).every((v) => /^M\d+$/.test(v))).toBe(true);
      expect(new Set(Object.values(vars)).size).toBe(39);
      expect(vars.BUTTON_START).toBe('M100');
      expect(vars.CYL_TILT_RETRACT).toBe('M144');
      const words = f.wordVariables as Record<string, { mitsubishi: { address: string; words: number } }>;
      expect(words.ENCODER_PULSES.mitsubishi.address).toBe('D120');
      expect(words.ENCODER_PULSES.mitsubishi.words).toBe(2);
    });
  });

  it('仿真档 connect 帧仍全 X/Y，Modbus/S7 两档不受影响', async () => {
    const frames: Record<string, unknown>[] = [];
    const svc = Object.create(PlcWebSocketService.prototype) as Record<string, unknown>;
    svc._connected = true;
    svc.recordSuccess = () => undefined;
    svc.startHeartbeat = () => undefined;
    svc._sendRaw = async (msg: Record<string, unknown>) => {
      frames.push(msg);
      return { success: true };
    };
    const sendConnect = svc._sendConnect as (c: PlcConfig) => Promise<unknown>;

    await sendConnect.call(svc, { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' });
    await sendConnect.call(svc, { host: '127.0.0.1', port: 502, protocol: 'modbus' });
    const simVars = frames[0].variables as Record<string, string>;
    expect(Object.values(simVars).every((v) => /^[XY]\d+$/.test(v))).toBe(true);
    expect(simVars.BUTTON_START).toBe('X0');
    expect(frames[1].variables).toBeDefined();
    expect(Object.values(frames[1].variables as Record<string, unknown>).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('共享连接面板门控与兼容性', () => {
  it('PlcConnConfig 的 profile 是可选字段，其它设备包不带 profile 仍成立', () => {
    const legacy: PlcConnConfig = { host: '127.0.0.1', port: 502, protocol: 'modbus' };
    expect(legacy.profile).toBeUndefined();
  });

  it('面板用 enableMitsubishiProfile 门控，三菱才显示逻辑站号与档位下拉', () => {
    const panel = read('../../shared/src/components/ui/PlcConnectionPanel.tsx');
    expect(panel).toContain('profile?: MitsubishiTarget');
    expect(panel).toContain('enableMitsubishiProfile?: boolean');
    expect(panel).toContain("enableMitsubishiProfile && protocol === 'mitsubishi'");
    expect(panel).toContain('逻辑站号');
    expect(panel).toContain('GX Simulator2 仿真');
    expect(panel).toContain('实体 FX3U / FX5U');
    expect(panel).toContain('disabled={busy || connected}');
  });

  it('逻辑站号默认 0 只是项目历史值，UI 不堆说明、口径由现场手册承载', () => {
    const panel = read('../../shared/src/components/ui/PlcConnectionPanel.tsx');
    expect(panel).toContain("mitsubishi: { host: '127.0.0.1', port: 0 }");
    // 用户 2026-11-10 口径「不要再UI里填说明」：连接面板只留控件，不放解释段落
    expect(panel).not.toContain('<p className="mt-2 text-xs text-gray-500">');
    expect(panel).not.toContain('通信设置实用程序');
    expect(panel).not.toContain('并非通用值');
    expect(panel).not.toContain('出现 Open failed 时先核对编号');
    // 不把本机已配置编号写死进产品：换机器后仍然成立
    expect(panel).not.toContain('LogicalStNo_0001');
    expect(panel).not.toContain('本机已配置逻辑站');
    // 说明删了，但门控行为（下拉 / 逻辑站号 / 主机置灰）必须原样保留
    expect(panel).toContain("enableMitsubishiProfile && protocol === 'mitsubishi'");
    expect(panel).toContain('逻辑站号');
    expect(panel).toContain(`disabled={busy || connected || (enableMitsubishiProfile && protocol === 'mitsubishi')}`);
  });

  it('后端网关零改动，M 区地址不在网关里写死', () => {
    const gateway = read('../../../websocket-server/server.js');
    expect(gateway).not.toContain("'M100'");
    expect(gateway).toContain('this.variables[name] || name');
  });

  it('帮助页调用点仍是无参，档位不持久化', () => {
    expect(read('./App.tsx')).toContain('buildDispensingHelpContent()');
    expect(read('./platform/PlatformModePanels.tsx')).toContain('buildDispensingHelpContent()');
    expect(read('./stores/useAppStore.ts')).not.toContain('localStorage');
    expect(read('./stores/useAppStore.ts')).toContain("mitsubishiProfile: 'simulator'");
  });
});
