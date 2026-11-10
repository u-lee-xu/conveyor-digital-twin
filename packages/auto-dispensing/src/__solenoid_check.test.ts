/**
 * 气缸电磁阀「单电控 / 双电控」兼容防回退自检。
 *
 * 口径（用户 2026-11-08 锁定）：控制气缸实质是控制电磁阀。
 *  单电控：一只线圈，得电动作、失电弹簧复位 → 电平跟随；
 *  双电控：两只线圈（动作 / 缩回），上升沿切换、断电保持 → 自保持。
 *
 * 守住五条：
 *  1. 既有 10 个动作输出地址一个不动，新增 5 只缩回线圈且三协议地址齐备、互不重复；
 *  2. `solenoid.ts` 是「线圈 → 姿态」唯一来源，纯函数逐帧验证单 / 双电控语义；
 *  3. 仿真面板走纯函数，不再把 `CYL_SEND_*` 电平直接当姿态；
 *  4. 模式是硬件选型：store 有真值、`resetAll` 不重置、观众端按快照跟随；
 *  5. 虚拟 PLC / 使用说明 / 地址表与新线圈同步。
 *
 * 纯模块直接 import 做运行时断言；源码级断言读文件（避免 ?raw 被 stub 成空串）。
 */
import { describe, it, expect } from 'vitest';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_WRITE_VARS, MITSUBISHI_DISPLAY_VARS,
} from './scenes/auto-dispensing/constants';
import {
  SOLENOID_DEFAULT, SOLENOID_TYPES, SOLENOID_TYPE_LABELS, SOLENOID_AXES,
  SOLENOID_VAR_NAMES, SOLENOID_RETRACT_VARS,
  resolveCylinderLevels, snapshotSolenoidCoils, solenoidConflicts, readCylinderLevels,
  type CoilLevels, type CylinderLevels,
} from './scenes/auto-dispensing/solenoid';
import {
  MANUAL_OUTPUT_POINTS, SOLENOID_OUTPUT_POINTS, ALL_OUTPUT_POINTS,
  MANUAL_IO_SUMMARY, outputPointLevel, type OutputSnapshot,
} from './scenes/auto-dispensing/manualIo';
import { SIM_OUTPUT_POINTS, SIM_READ_VAR_NAMES } from './scenes/auto-dispensing/simulationIo';
import { useDispensingStore } from './stores/useDispensingStore';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const solenoidSource = read('./scenes/auto-dispensing/solenoid.ts');
const simSource = read('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const storeSource = read('./stores/useDispensingStore.ts');
const indexSource = read('./index.ts');
const helpSource = read('./scenes/auto-dispensing/helpContent.ts');
const physicsSource = read('./scenes/auto-dispensing/diagnostics.ts');

const coils = (o: CoilLevels = {}): CoilLevels => ({ ...o });
const levels = (o: CylinderLevels = {}): CylinderLevels => ({
  A: false, B: false, C: false, D: false, TILT: false, ...o,
});

/** 模拟一轮 readVars：算出姿态，并把本轮电平存成下一轮的上升沿基准 */
function tick(type: 'single' | 'double', prev: CoilLevels, current: CoilLevels, prevLevels: CylinderLevels) {
  return {
    levels: resolveCylinderLevels(type, prev, current, prevLevels),
    prev: snapshotSolenoidCoils(current),
  };
}

// ============================================================
// 1. 双线圈地址表：既有编号不动 + 新增地址齐备
// ============================================================

describe('双电控缩回线圈地址表', () => {
  it('既有 10 个动作输出地址一个都不改', () => {
    expect(MODBUS_READ_VARS.MOTOR_FWD).toBe(30);
    expect(MODBUS_READ_VARS.MOTOR_REV).toBe(31);
    expect(MODBUS_READ_VARS.CYL_SEND_A).toBe(32);
    expect(MODBUS_READ_VARS.CYL_SEND_B).toBe(33);
    expect(MODBUS_READ_VARS.CYL_SEND_C).toBe(34);
    expect(MODBUS_READ_VARS.CYL_SEND_D).toBe(35);
    expect(MODBUS_READ_VARS.CYL_TILT).toBe(36);
    expect(MODBUS_READ_VARS.LAMP_GREEN).toBe(38);
    expect(MODBUS_READ_VARS.LAMP_YELLOW).toBe(39);
    expect(MODBUS_READ_VARS.LAMP_RED).toBe(40);
    expect(MODBUS_READ_VARS.SEL_MANUAL).toBe(5);
    expect(MODBUS_READ_VARS.SEL_AUTO).toBe(6);
  });

  it('5 只缩回线圈在 Modbus / S7 / 三菱三张表里都有且值正确', () => {
    const expected = [
      ['CYL_SEND_A_RETRACT', 41, 'M31.2', 'Y12'],
      ['CYL_SEND_B_RETRACT', 42, 'M31.3', 'Y13'],
      ['CYL_SEND_C_RETRACT', 43, 'M31.4', 'Y14'],
      ['CYL_SEND_D_RETRACT', 44, 'M31.5', 'Y15'],
      ['CYL_TILT_RETRACT', 45, 'M31.6', 'Y16'],
    ] as const;
    expected.forEach(([key, coil, s7, y]) => {
      expect(MODBUS_READ_VARS[key]).toBe(coil);
      expect(S7_VARS[key]).toBe(s7);
      expect(MITSUBISHI_WRITE_VARS[key]).toBe(y);
      expect(MITSUBISHI_DISPLAY_VARS[key]).toBe(y);
    });
  });

  it('三张协议表里所有地址都不重复，39 个布尔变量 = 24 输入 + 15 输出', () => {
    expect(Object.keys(MODBUS_READ_VARS)).toHaveLength(39);
    expect(Object.keys(S7_VARS)).toHaveLength(39);
    expect(Object.keys(MITSUBISHI_WRITE_VARS)).toHaveLength(15);
    // 三张表的值类型不同（number / string），不能塞进同一个 forEach
    // 让 TS 去解 new Set 的联合类型重载，逐张表各断言一次。
    const coilValues = Object.values(MODBUS_READ_VARS);
    const s7Values = Object.values(S7_VARS);
    const yValues = Object.values(MITSUBISHI_WRITE_VARS);
    expect(new Set(coilValues).size).toBe(coilValues.length);
    expect(new Set(s7Values).size).toBe(s7Values.length);
    expect(new Set(yValues).size).toBe(yValues.length);
  });

  it('五个气缸各有且只有一对线圈，缩回线圈只在双电控用', () => {
    expect(SOLENOID_AXES).toHaveLength(5);
    expect(SOLENOID_AXES.map((a) => a.key)).toEqual(['A', 'B', 'C', 'D', 'TILT']);
    expect(SOLENOID_VAR_NAMES).toHaveLength(10);
    expect(SOLENOID_RETRACT_VARS).toHaveLength(5);
    expect(new Set(SOLENOID_VAR_NAMES).size).toBe(10);
    SOLENOID_AXES.forEach((a) => {
      expect(MODBUS_READ_VARS).toHaveProperty(a.action);
      expect(MODBUS_READ_VARS).toHaveProperty(a.retract);
      expect(a.action).not.toBe(a.retract);
    });
    expect(SOLENOID_DEFAULT).toBe('single');
    expect(SOLENOID_TYPES).toEqual(['single', 'double']);
    expect(SOLENOID_TYPE_LABELS.double).toContain('保持');
  });
});

// ============================================================
// 2. 点位表分层：手动 10 点 / 仿真 15 点 / 回读 39 项
// ============================================================

describe('点位表分层', () => {
  it('手动单点操作台仍是 10 点，新增 5 点只在仿真面板出现', () => {
    expect(MANUAL_OUTPUT_POINTS).toHaveLength(10);
    expect(SOLENOID_OUTPUT_POINTS).toHaveLength(5);
    expect(ALL_OUTPUT_POINTS).toHaveLength(15);
    expect(SIM_OUTPUT_POINTS).toHaveLength(15);
    expect(SIM_OUTPUT_POINTS).toEqual(ALL_OUTPUT_POINTS);
    expect(MANUAL_IO_SUMMARY.outputs).toBe(10);
    expect(MANUAL_IO_SUMMARY.solenoidOutputs).toBe(5);
    expect(MANUAL_IO_SUMMARY.allOutputs).toBe(15);
    SOLENOID_OUTPUT_POINTS.forEach((p) => {
      expect(p.key.endsWith('_RETRACT')).toBe(true);
      expect(p.group).toBe('solenoid');
      expect(p.addr).toMatch(/^Y\d+$/);
      expect(p.coil).toMatch(/^C4[1-5]$/);
    });
  });

  it('仿真轮询回读 39 项（24 输入 + 15 输出），无重复', () => {
    expect(SIM_READ_VAR_NAMES).toHaveLength(39);
    expect(new Set(SIM_READ_VAR_NAMES).size).toBe(39);
    SIM_READ_VAR_NAMES.forEach((name) => expect(MODBUS_READ_VARS).toHaveProperty(name));
    SOLENOID_RETRACT_VARS.forEach((name) => expect(SIM_READ_VAR_NAMES).toContain(name));
  });

  it('缩回线圈不是模型姿态：outputPointLevel 明确返回 false', () => {
    const snap: OutputSnapshot = {
      motorFwd: false, motorRev: false,
      sendCyl: {
        A: { extended: true, position: 1 }, B: { extended: false, position: 0 },
        C: { extended: false, position: 0 }, D: { extended: false, position: 0 },
      },
      tiltCyl: { tilted: true, angle: 1 },
      lamp: { green: false, yellow: false, red: false },
    };
    SOLENOID_RETRACT_VARS.forEach((name) => expect(outputPointLevel(name, snap)).toBe(false));
    expect(outputPointLevel('CYL_SEND_A', snap)).toBe(true);
  });
});

// ============================================================
// 3. 纯函数逐帧语义：单电控电平跟随 / 双电控上升沿自保持
// ============================================================

describe('单电控：得电动作、失电弹簧复位', () => {
  it('动作线圈 ON → 伸出，OFF → 立刻回原位', () => {
    let prev = coils();
    let state = levels();

    let r = tick('single', prev, coils({ CYL_SEND_A: true }), state);
    expect(r.levels.A).toBe(true);
    prev = r.prev; state = r.levels;

    r = tick('single', prev, coils(), state);
    expect(r.levels.A).toBe(false);
    prev = r.prev; state = r.levels;

    r = tick('single', prev, coils({ CYL_TILT: true }), state);
    expect(r.levels.TILT).toBe(true);
    r = tick('single', r.prev, coils(), r.levels);
    expect(r.levels.TILT).toBe(false);
  });

  it('单电控下 5 只缩回线圈全部不参与驱动', () => {
    SOLENOID_AXES.forEach((a) => {
      const r = resolveCylinderLevels('single', coils(), coils({ [a.retract]: true }), levels());
      expect(r[a.key], a.key).toBe(false);
    });
  });

  it('五个气缸互不串点：只动 A 线圈时 B/C/D/TILT 保持', () => {
    const r = resolveCylinderLevels('single', coils(), coils({ CYL_SEND_A: true }), levels());
    expect(r.A).toBe(true);
    expect([r.B, r.C, r.D, r.TILT]).toEqual([false, false, false, false]);
  });
});

describe('双电控：上升沿切换、断电保持', () => {
  it('伸出脉冲 ON→OFF 后仍保持伸出，反向脉冲才缩回', () => {
    let prev = coils();
    let state = levels();

    // ① 动作线圈上升沿 → 伸出
    let r = tick('double', prev, coils({ CYL_SEND_A: true }), state);
    expect(r.levels.A).toBe(true);
    prev = r.prev; state = r.levels;

    // ② 两线圈都断电 → 保持伸出（用户口径核心）
    r = tick('double', prev, coils(), state);
    expect(r.levels.A).toBe(true);
    prev = r.prev; state = r.levels;

    // ③ 缩回线圈上升沿 → 回原位
    r = tick('double', prev, coils({ CYL_SEND_A_RETRACT: true }), state);
    expect(r.levels.A).toBe(false);
    prev = r.prev; state = r.levels;

    // ④ 再次断电 → 保持缩回
    r = tick('double', prev, coils(), state);
    expect(r.levels.A).toBe(false);
    prev = r.prev; state = r.levels;

    // ⑤ 再来一次伸出脉冲（必须先 OFF 才有新沿）
    r = tick('double', prev, coils({ CYL_SEND_A: true }), state);
    expect(r.levels.A).toBe(true);
  });

  it('线圈持续 ON 不产生新上升沿，姿态不被反复触发', () => {
    let prev = coils();
    let state = levels();
    let r = tick('double', prev, coils({ CYL_SEND_A: true }), state);
    prev = r.prev; state = r.levels;
    r = tick('double', prev, coils({ CYL_SEND_A: true }), state);
    expect(r.levels.A).toBe(true);
    // 即使缩回线圈此刻误为 ON，只要没有新的上升沿就不该缩回
    r = tick('double', r.prev, coils({ CYL_SEND_A: true, CYL_SEND_A_RETRACT: false }), r.levels);
    expect(r.levels.A).toBe(true);
  });

  it('同一气缸两只线圈同时出现上升沿属禁止状态，保持原姿态', () => {
    const r = resolveCylinderLevels(
      'double', coils(),
      coils({ CYL_SEND_B: true, CYL_SEND_B_RETRACT: true }),
      levels({ B: true }),
    );
    expect(r.B).toBe(true);
    expect(solenoidConflicts({ CYL_SEND_B: true, CYL_SEND_B_RETRACT: true })).toEqual(['B']);
    expect(solenoidConflicts({ CYL_SEND_B: true })).toEqual([]);
  });

  it('两线圈分两帧先后得电时，禁止状态优先，第二个上升沿不切换阀芯', () => {
    let prev = coils();
    let state = levels({ D: true });
    // ① 动作线圈先 ON（只有它一个上升沿，允许伸出）
    let r = tick('double', prev, coils({ CYL_SEND_D: true }), state);
    expect(r.levels.D).toBe(true);
    prev = r.prev; state = r.levels;
    // ② 缩回线圈随后 ON，此刻两只都通电 → 禁止状态，保持伸出
    r = tick('double', prev, coils({ CYL_SEND_D: true, CYL_SEND_D_RETRACT: true }), state);
    expect(r.levels.D).toBe(true);
    expect(solenoidConflicts({ CYL_SEND_D: true, CYL_SEND_D_RETRACT: true })).toEqual(['D']);
    prev = r.prev; state = r.levels;
    // ③ 动作线圈先撤，只剩缩回线圈（无新上升沿）→ 仍不得切换
    r = tick('double', prev, coils({ CYL_SEND_D_RETRACT: true }), state);
    expect(r.levels.D).toBe(true);
    prev = r.prev; state = r.levels;
    // ④ 缩回线圈 OFF 再重新给一个上升沿 → 这才允许回原位
    r = tick('double', prev, coils(), state);
    expect(r.levels.D).toBe(true);
    prev = r.prev; state = r.levels;
    r = tick('double', prev, coils({ CYL_SEND_D_RETRACT: true }), state);
    expect(r.levels.D).toBe(false);
  });

  it('翻转缸用同一套语义：翻转脉冲保持，回位脉冲才回盛药位', () => {
    let prev = coils();
    let state = levels();
    let r = tick('double', prev, coils({ CYL_TILT: true }), state);
    expect(r.levels.TILT).toBe(true);
    prev = r.prev; state = r.levels;
    r = tick('double', prev, coils(), state);
    expect(r.levels.TILT).toBe(true);
    prev = r.prev; state = r.levels;
    r = tick('double', prev, coils({ CYL_TILT_RETRACT: true }), state);
    expect(r.levels.TILT).toBe(false);
  });

  it('模式切换不产生假上升沿（prev 每轮都刷新真实电平）', () => {
    let prev = coils();
    let state = levels();
    // 单电控下动作线圈持续 ON、气缸伸出
    let r = tick('single', prev, coils({ CYL_SEND_C: true }), state);
    expect(r.levels.C).toBe(true);
    prev = r.prev; state = r.levels;
    // 切到双电控，线圈仍是同一个 ON 电平 → 没有新沿，姿态应继承
    r = tick('double', prev, coils({ CYL_SEND_C: true }), state);
    expect(r.levels.C).toBe(true);
    // 之后失电，双电控应保持伸出（而不是像单电控那样复位）
    r = tick('double', r.prev, coils(), r.levels);
    expect(r.levels.C).toBe(true);
    // 再切回单电控，动作线圈 OFF → 弹簧复位
    r = tick('single', r.prev, coils(), r.levels);
    expect(r.levels.C).toBe(false);
  });

  it('readCylinderLevels 从 store 姿态继承，snapshot 只保留 10 只线圈', () => {
    const s = readCylinderLevels(
      {
        A: { extended: true }, B: { extended: false },
        C: { extended: true }, D: { extended: false },
      },
      { tilted: true },
    );
    expect(s).toEqual({ A: true, B: false, C: true, D: false, TILT: true });
    const snap = snapshotSolenoidCoils({ CYL_SEND_A: true, LAMP_RED: true, UNKNOWN: true });
    expect(Object.keys(snap)).toHaveLength(10);
    expect(snap.CYL_SEND_A).toBe(true);
    expect(snap).not.toHaveProperty('LAMP_RED');
    expect(snap).not.toHaveProperty('UNKNOWN');
  });
});

// ============================================================
// 4. 模式真值与观众镜像（运行时 + 源码级）
// ============================================================

describe('电磁阀类型是硬件选型，主控/观众同口径', () => {
  it('store 默认单电控、可切换、resetAll 不重置', () => {
    const s = useDispensingStore.getState();
    expect(s.solenoidType).toBe('single');
    s.setSolenoidType('double');
    expect(useDispensingStore.getState().solenoidType).toBe('double');
    s.resetAll();
    expect(useDispensingStore.getState().solenoidType).toBe('double');
    s.setSolenoidType('single');
    expect(useDispensingStore.getState().solenoidType).toBe('single');
  });

  it('广播快照导出姿态 + 模式布尔，观众端按模式布尔回写 store', () => {
    expect(indexSource).toContain('SOLENOID_DOUBLE: s.solenoidType ===');
    expect(indexSource).toContain("v['SOLENOID_DOUBLE']");
    expect(indexSource).toContain('s.setSolenoidType(');
    // 姿态快照来自模型状态，不是缩回线圈电平
    expect(indexSource).toContain('CYL_SEND_A: s.sendCyl.A.extended');
    expect(indexSource).not.toContain('CYL_SEND_A_RETRACT:');
  });

  it('面板走纯函数，不再把 CYL_SEND_* 电平直接当姿态', () => {
    expect(simSource).toContain('resolveCylinderLevels(');
    expect(simSource).toContain('snapshotSolenoidCoils(v)');
    expect(simSource).toContain('readCylinderLevels(store.sendCyl, store.tiltCyl)');
    expect(simSource).not.toContain('v[`CYL_SEND_${mag}`]');
    expect(simSource).toContain('store.setSendCyl(mag, on,');
    expect(simSource).toContain('store.setTiltCyl(tiltOn,');
  });

  it('面板可实时切换类型、给出缩回线圈地址浮框与禁止状态提示', () => {
    expect(simSource).toContain('SOLENOID_TYPES.map');
    expect(simSource).toContain('setSolenoidType(t)');
    expect(simSource).toContain('SOLENOID_OUTPUT_POINTS.map');
    expect(simSource).toContain('simPointRows(p)');
    expect(simSource).toContain('solenoidConflicts(ioSignals)');
    expect(simSource).toContain('禁止状态');
    expect(simSource).toContain('输出点 15');
    expect(simSource).not.toContain('输出点直接置位');
  });

  it('单一来源不依赖 React / 状态容器 / PLC 服务，store 不把模式写进 resetAll', () => {
    // 只匹配真实 import 语句，不能用 toContain：文件头注释里提到这些名字会误报
    expect(solenoidSource).not.toMatch(/^\s*import\s[^\n]*from\s+['"](react|zustand|.*plc-websocket)/m);
    expect(solenoidSource).not.toMatch(/require\s*\(/);
    expect(storeSource).toContain('solenoidType: SOLENOID_DEFAULT');
    expect(storeSource).toContain('setSolenoidType: (type) => set(');
    // 接口声明里也有 `resetAll: () => void;`，indexOf 会切到整个实现区；
    // 用 lastIndexOf 定位到真实实现，才能只检查复位函数体。
    const resetBlock = storeSource.slice(storeSource.lastIndexOf('resetAll: () =>'));
    expect(resetBlock).not.toContain('solenoidType');
  });

  it('禁止状态优先于上升沿：两线圈先后得电也不切阀芯', () => {
    expect(solenoidSource).toContain('if (coils[axis.action] && coils[axis.retract]) return;');
  });

  it('CDP 只读诊断暴露翻转缸姿态与电磁阀选型，供运行时验收取模型真值', () => {
    expect(physicsSource).toContain('tiltCyl: { ...s.tiltCyl }');
    expect(physicsSource).toContain('solenoidType: s.solenoidType');
  });

  it('虚拟 PLC 急停清线圈、使用说明补齐双电控语义', () => {
    const mockPlc = process.getBuiltinModule('fs')!.readFileSync(
      new URL('../../../websocket-server/mock-dispensing-server.js', import.meta.url), 'utf8',
    );
    expect(mockPlc).toContain('coils[A.CYL_SEND_A_RETRACT] = false');
    expect(mockPlc).toContain('coils[A.CYL_TILT_RETRACT] = false');
    expect(helpSource).toContain('单电控（弹簧复位）');
    expect(helpSource).toContain('双电控（记忆型）');
    expect(helpSource).toContain('CYL_SEND_A_RETRACT');
    expect(helpSource).toContain('CYL_TILT_RETRACT');
    expect(helpSource).toContain('禁止状态');
  });
});
