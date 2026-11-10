// @vitest-environment node
/**
 * P1-6 观众快照自检：exportSnapshot / applyBroadcast 扁平键成对、
 * 气缸位置数值容错、观众端只读守卫。
 *
 * 纯源码级断言：index.ts 拉起 R3F / Rapier / plcService 整个图，直接 import
 * 会在测试进程里建 WebSocket 与 WASM，因此按仓库既有做法读源码文本校验，
 * 不引入渲染依赖。
 */
import { describe, it, expect } from 'vitest';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const indexSource = read('./index.ts');
const cabinetSource = read('./scenes/auto-dispensing/components/ControlCabinet.tsx');
const sceneSource = read('./scenes/auto-dispensing/SceneContent.tsx');
const diagnosticsSource = read('./scenes/auto-dispensing/diagnostics.ts');

/** 两个函数各自的源码片段，用相邻函数 / 导出点切分，避免复杂的花括号配对 */
const applyStart = indexSource.indexOf('function applyBroadcast(');
const exportStart = indexSource.indexOf('function exportSnapshot(');
const deviceStart = indexSource.indexOf('export const dispensingDevice');
const applySrc = indexSource.slice(applyStart, exportStart);
const exportSrc = indexSource.slice(exportStart, deviceStart);

/** 本轮新增、且 export 与 apply 必须一一对应的静态扁平键 */
const PAIRED_STATIC = [
  'CYL_SEND_A_POS', 'CYL_SEND_B_POS', 'CYL_SEND_C_POS', 'CYL_SEND_D_POS', 'CYL_TILT_ANGLE',
  'PILL_DUMP_COUNT', 'PILL_PENDING_COUNT',
  'HOPPER_STOCK_A', 'HOPPER_STOCK_B', 'HOPPER_STOCK_C', 'HOPPER_STOCK_D',
  'BIN_PILLS_A', 'BIN_PILLS_B', 'BIN_PILLS_C', 'BIN_PILLS_D',
  'BUTTON_START', 'BUTTON_STOP', 'BUTTON_RESET', 'BUTTON_ESTOP', 'BUTTON_CONFIRM',
];

/** 倒药药片按索引展开的动态键：两侧都用同一个模板字面量 */
const PAIRED_DYNAMIC = ['PILL_DUMP_${i}_MAG', 'PILL_DUMP_${i}_PROGRESS'];

/** 原有 14 个键：一个都不能丢，键名后仍是对象字面量冒号 */
const LEGACY_KEYS = [
  'ENCODER_PULSES', 'MOTOR_FWD', 'MOTOR_REV',
  'CYL_SEND_A', 'CYL_SEND_B', 'CYL_SEND_C', 'CYL_SEND_D', 'CYL_TILT',
  'LAMP_GREEN', 'LAMP_YELLOW', 'LAMP_RED',
  'SEL_MANUAL', 'SEL_AUTO', 'SOLENOID_DOUBLE',
];

describe('exportSnapshot / applyBroadcast 新键成对', () => {
  it('20 个新增静态键在两个函数里都出现', () => {
    PAIRED_STATIC.forEach((key) => {
      expect(exportSrc, `exportSnapshot 缺 ${key}`).toContain(key);
      expect(applySrc, `applyBroadcast 缺 ${key}`).toContain(key);
    });
  });

  it('倒药药片的两个动态键在两侧成对出现', () => {
    PAIRED_DYNAMIC.forEach((key) => {
      expect(exportSrc).toContain(key);
      expect(applySrc).toContain(key);
    });
  });

  it('原有 14 个键一个不动', () => {
    LEGACY_KEYS.forEach((key) => expect(exportSrc).toContain(`${key}:`));
  });

  it('新增键的值来自 store 的 number/boolean 字段（扁平数值/布尔）', () => {
    expect(exportSrc).toContain("snap['CYL_SEND_A_POS'] = s.sendCyl.A.position");
    expect(exportSrc).toContain("snap['CYL_TILT_ANGLE'] = s.tiltCyl.angle");
    expect(exportSrc).toContain("snap['PILL_DUMP_COUNT'] = s.dumpingPills.length");
    expect(exportSrc).toContain("snap['PILL_PENDING_COUNT'] = s.pendingPills.length");
    expect(exportSrc).toContain("snap['HOPPER_STOCK_A'] = s.hopperStock.A");
    expect(exportSrc).toContain("snap['BIN_PILLS_A'] = s.binPills.A");
    expect(exportSrc).toContain("snap['BUTTON_START'] = s.buttons.start");
  });

  it('mock-addresses.js --check 依赖的 DINT 字面量保留', () => {
    expect(indexSource).toContain('ENCODER_PULSES: s.encoderPulses');
    expect(indexSource).toContain('Number.isFinite(encoderValue)');
    expect(indexSource).toContain("v['ENCODER_PULSES']");
    expect(indexSource).not.toMatch(/ENCODER_BIT\d/);
  });
});

describe('位置数值容错（气缸姿态不瞬跳）', () => {
  it('气缸位置优先用数值键，缺字段/NaN 退回 on ? 1 : 0 终值', () => {
    expect(applySrc).toContain("posOf(v['CYL_SEND_A_POS'], onA)");
    expect(applySrc).toContain('Number.isFinite(raw)');
    expect(applySrc).toContain('(on ? 1 : 0)');
  });

  it('翻转缸同理：CYL_TILT_ANGLE 数值优先，终值兜底', () => {
    expect(applySrc).toContain("const tiltRaw = v['CYL_TILT_ANGLE']");
    expect(applySrc).toContain("typeof tiltRaw === 'number' && Number.isFinite(tiltRaw)");
    expect(applySrc).toContain('(tilt ? 1 : 0)');
    expect(applySrc).toContain('s.setTiltCyl(');
  });

  it('ENCODER_PULSES 缺字段保留上次位置，不把 undefined 写成 0', () => {
    expect(applySrc).toContain("if (typeof encoderValue === 'number' && Number.isFinite(encoderValue))");
    expect(indexSource).not.toContain("Number(v['ENCODER_PULSES']) || 0");
  });

  it('不再只在电平翻转时写气缸终值（改为每次跟随插值位置）', () => {
    expect(applySrc).not.toContain('if (s.sendCyl[mag].extended !== on)');
    expect(applySrc).not.toContain('if (s.tiltCyl.tilted !== tilt)');
    expect(applySrc).toContain('s.setSendCyl(');
  });

  it('观众镜像状态一次 setState 写入，且用 viewer-${i} 重建倒药药片', () => {
    expect(applySrc).toContain('useDispensingStore.setState(');
    expect(applySrc).toContain('id: `viewer-${i}`');
    expect(applySrc).toContain('sensors: { ...sensors, binHasDrug }');
    expect(applySrc).toContain('pendingPills:');
  });
});

describe('观众端只读诊断入口（CDP 可复核位置跟随）', () => {
  it('诊断安装函数独立成模块，主控与观众共用同一份字段', () => {
    expect(diagnosticsSource).toContain('export function installDispensingDiagnostics()');
    expect(diagnosticsSource).toContain('tiltCyl: { ...s.tiltCyl }');
    expect(diagnosticsSource).toContain('solenoidType: s.solenoidType');
    expect(sceneSource).toContain('installDispensingDiagnostics();');
  });

  it('观众分支不挂 Rapier 但显式安装诊断，且仍不渲染 PhysicsWorld', () => {
    const viewerAt = sceneSource.indexOf('if (isViewerRuntime())');
    expect(viewerAt).toBeGreaterThan(-1);
    const block = sceneSource.slice(viewerAt, viewerAt + 320);
    expect(block).toContain('<ViewerDiagnostics />');
    expect(block).not.toContain('<PhysicsWorld');
    expect(sceneSource).toContain('function ViewerDiagnostics()');
    expect(sceneSource).toContain('installDispensingDiagnostics();');
  });
});

describe('观众端只读守卫', () => {
  it('3D 按钮箱 press 带 isViewerRuntime 短路，且短路在写 store 之前', () => {
    const at = cabinetSource.indexOf('const press = ');
    expect(at).toBeGreaterThan(-1);
    const block = cabinetSource.slice(at, at + 420);
    expect(block).toContain('isViewerRuntime()');
    expect(block).toMatch(/isViewerRuntime\(\)[\s\S]{0,200}setButton\(key, down\)/);
    expect(block).toContain('writeSimPlcVar(CABINET_BUTTON_IO[key], down)');
  });

  it('toggleSelector 同样带 isViewerRuntime 短路，全部写 store 交互已收口', () => {
    const at = cabinetSource.indexOf('const toggleSelector');
    expect(cabinetSource.slice(at, at + 160)).toContain('isViewerRuntime()');
    expect(cabinetSource).toContain("import { isViewerRuntime } from '@digital-twin/shared'");
  });
});
