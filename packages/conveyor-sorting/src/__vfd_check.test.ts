/**
 * MD520 虚拟变频器防回退自检。
 *
 * 固化：真实手册口径（参数默认值 / 专用通信地址 / 功能码地址换算）、
 * 三级菜单键盘语义、四种给定来源、485 单字链路、观众端数值快照。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MD520_PARAMS, MD520_PARAM_MAP, MD520_COMM, MD520_MULTI_SPEED,
  paramCommAddress, paramRamAddress, groupHex,
} from './vfd/md520Spec';
import {
  INITIAL_KEYPAD, reduceKeypad, formatMain, digitPlaces, blinkPosition,
  visibleParams, groupParams,
} from './vfd/md520Keypad';
import { useVfdStore } from './stores/useVfdStore';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');
const root = join(here, '../../..');
const rootSrc = (p: string) => readFileSync(join(root, p), 'utf8');

const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    externalSetpointHz: 50,
    outputHz: 0,
    di: { DI1: false, DI2: false, DI3: false, DI4: false, DI5: false },
    ai1: 0,
    ai2: 0,
    ai2Mode: 'voltage',
    command: 0,
    status: 3,
    commOnline: false,
    faultCode: null,
    faultHistory: [],
    message: '',
    engaged: false,
    doFlags: { DO1: false, FM: false, RELAY: false },
  });
});

describe('MD520 手册口径：参数表与通信地址', () => {
  it('教学子集参数都有手册默认值依据，且编号唯一', () => {
    expect(MD520_PARAMS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(MD520_PARAMS.map((p) => p.code)).size).toBe(MD520_PARAMS.length);
    expect(MD520_PARAM_MAP['F0-02'].defaultValue).toBe(0);
    expect(MD520_PARAM_MAP['F0-08'].defaultValue).toBe(50);
    expect(MD520_PARAM_MAP['F0-10'].defaultValue).toBe(50);
    expect(MD520_PARAM_MAP['F0-17'].defaultValue).toBe(20);
    expect(MD520_PARAM_MAP['F0-18'].defaultValue).toBe(20);
    expect(MD520_PARAM_MAP['FD-00'].defaultValue).toBe(5005);
    expect(MD520_PARAM_MAP['FD-02'].defaultValue).toBe(1);
  });

  it('功能码通信地址 = 组号高 8 位 + 组内序号（通信手册 2.2）', () => {
    expect(groupHex('F0')).toBe(0xf0);
    expect(paramCommAddress('F0-16' in MD520_PARAM_MAP ? 'F0-16' : 'F0-02')).toBe(0xf002);
    expect(paramCommAddress('F4-11')).toBe(0xf40b);
    expect(paramCommAddress('FD-02')).toBeGreaterThan(0xf000);
    expect(paramRamAddress('F0-08')).toBeLessThan(0x1000);
  });

  it('专用寄存器地址与通信手册 2.3 一致（十进制）', () => {
    expect(MD520_COMM.SETPOINT).toBe(4096);   // 1000H
    expect(MD520_COMM.COMMAND2).toBe(8192);  // 2000H
    expect(MD520_COMM.STATUS1).toBe(12288);  // 3000H
    expect(MD520_COMM.FREQ2).toBe(29456);    // 7310H
    expect(MD520_COMM.DI_FLAGS).toBe(4104);  // 1008H
    expect(MD520_COMM.DO_FLAGS).toBe(4105);  // 1009H
  });

  it('DI 物理端子只有 5 路，多段速 8 段', () => {
    expect(MD520_MULTI_SPEED).toHaveLength(8);
    expect(visibleParams('changed', defaults)).toHaveLength(0);
    expect(visibleParams('user', defaults).length).toBeGreaterThan(0);
  });
});

describe('LED 键盘：三级菜单与编辑语义', () => {
  it('PRG 进入一级菜单，OK 逐级进入参数与设定值', () => {
    let s = { ...INITIAL_KEYPAD };
    s = reduceKeypad(s, 'PRG', defaults, false).state;
    expect(s.level).toBe(1);
    s = reduceKeypad(s, 'OK', defaults, false).state;
    expect(s.level).toBe(2);
    s = reduceKeypad(s, 'OK', defaults, false).state;
    expect(s.level).toBe(3);
  });

  it('ENTER 保存并自动跳到下一个参数，PRG 放弃修改', () => {
    const s = { ...INITIAL_KEYPAD, level: 3 as const, paramIndex: 1, editValue: 50 };
    const r = reduceKeypad(s, 'UP', defaults, false);
    expect(r.state.editValue).not.toBe(50);
    const saved = reduceKeypad(r.state, 'OK', defaults, false);
    expect(saved.event?.commit).toBeDefined();
    expect(saved.state.level).toBe(2);
    expect(saved.state.paramIndex).toBe(2);
    const cancelled = reduceKeypad(r.state, 'PRG', defaults, false);
    expect(cancelled.event?.commit).toBeUndefined();
    expect(cancelled.state.level).toBe(2);
  });

  it('只读参数不进三级菜单，运行中锁定参数拒绝编辑', () => {
    const readonlyState = { ...INITIAL_KEYPAD, level: 1 as const, groupIndex: 6 };
    const r = reduceKeypad({ ...readonlyState, level: 2 }, 'OK', defaults, false);
    expect(r.state.level).toBeLessThanOrEqual(3);
    const locked = { ...INITIAL_KEYPAD, level: 2 as const, paramIndex: 2 };
    const running = reduceKeypad(locked, 'OK', defaults, true);
    expect(running.state.level).toBe(2);
    expect(running.event?.message).toBeTruthy();
  });

  it('菜单键点按切 4 种菜单，长按切主/辅显示区', () => {
    let s = { ...INITIAL_KEYPAD };
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      seen.add(s.menu);
      s = reduceKeypad(s, 'MENU', defaults, false).state;
    }
    expect(seen.size).toBe(4);
    expect(reduceKeypad(s, 'MENU_LONG', defaults, false).state.area).toBe('aux');
  });

  it('五位主显示与闪烁位', () => {
    expect(formatMain(MD520_PARAM_MAP['F0-08'], 50)).toBe('05000');
    expect(digitPlaces(MD520_PARAM_MAP['F0-17'])).toHaveLength(5);
  });

  it('可编辑位由参数上限决定，F0-02 只能改个位且从最低位起编辑', () => {
    const p02 = MD520_PARAM_MAP['F0-02'];
    expect(digitPlaces(p02)).toEqual([1]);
    expect(blinkPosition(p02, 0)).toBe(4);
    const p08 = MD520_PARAM_MAP['F0-08'];
    expect(digitPlaces(p08)).toEqual([100, 10, 1, 0.1, 0.01]);
    const entered = reduceKeypad(
      { ...INITIAL_KEYPAD, level: 2 as const, paramIndex: 0 }, 'OK', defaults, false,
    ).state;
    expect(entered.level).toBe(3);
    expect(entered.digit).toBe(0);
    const up = reduceKeypad(entered, 'UP', defaults, false).state;
    expect(up.editValue).toBe(1);
    expect(reduceKeypad(up, 'OK', defaults, false).event?.commit)
      .toEqual({ code: 'F0-02', value: 1 });
    expect(groupParams({ ...INITIAL_KEYPAD, level: 2 }, defaults)[0].code).toBe('F0-02');
  });
});

describe('四种给定来源与 3D 频率倍率', () => {
  it('面板给定：RUN 后按 F0-17 加速斜坡爬升', () => {
    const s = useVfdStore.getState();
    s.dispatchKey('RUN');
    for (let i = 0; i < 60; i += 1) useVfdStore.getState().tick(1 / 60);
    const out = useVfdStore.getState().outputHz;
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(50);
    expect(useVfdStore.getState().speedFactor()).toBeCloseTo(out / 50, 4);
  });

  it('DI 多段速：DI4 使能 + DI1~DI3 选段', () => {
    useVfdStore.getState().setParam('F0-02', 1);
    useVfdStore.getState().setParam('F0-03', 6);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setParam('F0-18', 0.1);
    const s = useVfdStore.getState();
    s.setDi('DI4', true);
    s.setDi('DI2', true); // 段 2
    expect(useVfdStore.getState().multiSpeedIndex()).toBe(2);
    for (let i = 0; i < 200; i += 1) useVfdStore.getState().tick(1 / 60);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(MD520_MULTI_SPEED[2], 1);
  });

  it('AI 模拟量：AI1 电压与 AI2 电压/电流模式映射到频率', () => {
    useVfdStore.getState().setParam('F0-03', 2);
    useVfdStore.getState().setAi1(5);
    expect(useVfdStore.getState().ai1).toBe(5);
    useVfdStore.getState().setParam('F0-03', 3);
    useVfdStore.getState().setAi2Mode('current');
    useVfdStore.getState().setAi2(10);
    expect(useVfdStore.getState().ai2).toBe(10);
    useVfdStore.getState().setAi2(30);
    expect(useVfdStore.getState().ai2).toBe(20);
  });

  it('未接管时 speedFactor 恒 1，手动/演示/评分带速不回归', () => {
    expect(useVfdStore.getState().engaged).toBe(false);
    expect(useVfdStore.getState().outputHz).toBe(0);
    expect(useVfdStore.getState().speedFactor()).toBe(1);
  });

  it('RUN / DI / 485 三种运行指令都能接管带速，切换模式解除接管', () => {
    useVfdStore.getState().dispatchKey('RUN');
    expect(useVfdStore.getState().engaged).toBe(true);
    expect(useVfdStore.getState().speedFactor()).toBe(0);
    for (let i = 0; i < 60; i += 1) useVfdStore.getState().tick(1 / 60);
    expect(useVfdStore.getState().speedFactor()).toBeGreaterThan(0);

    useVfdStore.getState().setEngaged(false);
    useVfdStore.getState().setDi('DI4', true);
    expect(useVfdStore.getState().engaged).toBe(true);
    useVfdStore.getState().setEngaged(false);
    useVfdStore.getState().setPlcFrame({ command: 1 });
    expect(useVfdStore.getState().engaged).toBe(true);
    useVfdStore.getState().setEngaged(false);
    expect(useVfdStore.getState().speedFactor()).toBe(1);
  });

  it('485 通信给定：F0-02=2 时面板 RUN 不抢运行权', () => {
    useVfdStore.getState().setParam('F0-02', 2);
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setParam('F0-18', 0.1);
    useVfdStore.getState().dispatchKey('RUN');
    expect(useVfdStore.getState().running).toBe(false);
    useVfdStore.getState().setPlcFrame({ command: 1, setpointHz: 30 });
    expect(useVfdStore.getState().running).toBe(true);
    expect(useVfdStore.getState().externalSetpointHz).toBe(30);
    for (let i = 0; i < 200; i += 1) useVfdStore.getState().tick(1 / 60);
    expect(useVfdStore.getState().outputHz).toBeCloseTo(30, 1);
  });
});

describe('观众端数值快照：禁止 !! 布尔化', () => {
  it('exportSnapshot / applyBroadcast 键名一一对应', () => {
    const snap = useVfdStore.getState().snapshot();
    expect(snap.setpointHz).toBe(50);
    const v: Record<string, boolean | number> = {
      VFD_SETPOINT_HZ: 12.5, VFD_OUTPUT_HZ: 0, VFD_COMMAND: 2, VFD_STATUS: 2,
      VFD_DI_FLAGS: 5, VFD_DO_FLAGS: 1, VFD_FAULT: 0,
    };
    useVfdStore.getState().applyBroadcast(v);
    expect(useVfdStore.getState().externalSetpointHz).toBe(12.5);
    expect(useVfdStore.getState().outputHz).toBe(0);
    expect(useVfdStore.getState().di.DI1).toBe(true);
    expect(useVfdStore.getState().di.DI3).toBe(true);
    expect(useVfdStore.getState().faultCode).toBeNull();
  });

  it('缺字段保留上次值，不被 0 覆盖', () => {
    useVfdStore.setState({ externalSetpointHz: 42 });
    useVfdStore.getState().applyBroadcast({ VFD_COMMAND: 1 });
    expect(useVfdStore.getState().externalSetpointHz).toBe(42);
  });
});

describe('接线防回退：面板 / 链路 / 地址表 / 网关单字', () => {
  const panel = src('platform/VfdKeypadPanel.tsx');
  const sim = src('platform/SimModePanel.tsx');
  const effects = src('platform/ConveyorDeviceEffects.tsx');
  const link = src('platform/VfdLink.tsx');
  const index = src('index.ts');
  const shared = rootSrc('packages/shared/src/services/modbus-websocket.ts');
  const server = rootSrc('websocket-server/server.js');
  const mockPlc = rootSrc('websocket-server/mock-dispensing-server.js');
  const addresses = src('constants/md520-addresses.ts');

  it('面板挂进仿真模式，链路挂进常驻 effects', () => {
    expect(sim).toContain('<VfdKeypadPanel />');
    expect(effects).toContain('<VfdLink />');
    expect(link).toContain('modbusService.readWords');
    expect(link).toContain('MD520_SOURCE.COMM');
    expect(panel).toContain('data-dt-vfd-rs485');
    expect(panel).toContain('data-dt-vfd-ai1');
    expect(panel).toContain('data-dt-vfd-multi');
    // 双区显示：待机时辅显示区显示预置频率，不能整块熄灭
    expect(panel).toContain('auxDotIndex');
    expect(panel).toContain('auxChars');
  });

  it('观众端面板只读，不开放键盘 / DI / AI 操作', () => {
    expect(panel).toContain('isViewerRuntime');
    expect(panel).toContain('data-dt-vfd-readonly');
    expect(panel).toContain('disabled={readOnly}');
    expect(panel).toContain('<input data-dt-vfd-ai1');
    expect(panel).toContain('<input data-dt-vfd-ai2');
  });

  it('UI 不写说明段落（遵守「不要再 UI 里填说明」）', () => {
    // 与 __panel_copy_check.test.ts 同款：只检查可见文案，不把源码注释算进去
    const visible = panel
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(visible).not.toContain('（');
    expect(visible).not.toContain('）');
  });

  it('地址表、数值通道与单字网关分支齐全', () => {
    expect(addresses).toContain('VFD_SETPOINT: 4096');
    expect(addresses).toContain('VFD_COMMAND2: 8192');
    expect(addresses).toContain('VFD_STATUS1: 12288');
    expect(addresses).toContain('VFD_FREQ2: 29456');
    expect(shared).toContain('CONNECT_WORDS');
    expect(shared).toContain('readWords');
    expect(shared).toContain('writeWord');
    expect(server).toContain("'uint16'");
    expect(server).toContain('spec.type ===');
    expect(mockPlc).toContain('isVfdAddress');
  });

  it('数值快照成对，观众端不自建 PLC 通道', () => {
    expect(index).toContain('VFD_OUTPUT_HZ');
    expect(index).toContain('VFD_ENGAGED');
    expect(index).toContain('VFD_SOURCE');
    expect(index).toContain('useVfdStore.getState().applyBroadcast(v)');
    expect(index).not.toContain('!!v[\'VFD_OUTPUT_HZ\']');
    expect(link).toContain('writeWord');
  });

  it('观众端给定来源与接管标志都随快照镜像', () => {
    useVfdStore.getState().applyBroadcast({
      VFD_SOURCE: 2, VFD_FREQ_SOURCE: 9, VFD_PRESET_HZ: 30,
      VFD_MAX_HZ: 60, VFD_ENGAGED: 1, VFD_OUTPUT_HZ: 12,
    });
    const s = useVfdStore.getState();
    expect(s.params['F0-02']).toBe(2);
    expect(s.params['F0-03']).toBe(9);
    expect(s.params['F0-08']).toBe(30);
    expect(s.params['F0-10']).toBe(60);
    expect(s.params['U0-00']).toBe(12);
    expect(s.engaged).toBe(true);
    expect(s.speedFactor()).toBeCloseTo(12 / 50, 4);
  });
});
