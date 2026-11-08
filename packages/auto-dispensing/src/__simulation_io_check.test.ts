/**
 * 仿真模式「控件 ↔ PLC 地址」绑定防回退自检。
 *
 * 守住四条硬约束：
 *  1. 主令按钮 / 3D 按钮箱共用一张点位映射，写的是 PLC 输入线圈，不是本地 store 自嗨；
 *  2. 24 个输入点（5 主令 + 2 选择开关档位 + 17 传感器）全部按 PLC 回读显示；
 *  3. 10 个输出点可从界面直接置位/复位，电机正反转互锁，3D 模型按回读联动；
 *  4. 所有地址来自点位表，面板/组件禁止回填 X/Y/C/M 地址字面量，观众端写入自动短路。
 *
 * 纯模块直接 import 做运行时断言；源码级断言读文件，避免 ?raw 被 stub 成空串。
 */
import { describe, it, expect } from 'vitest';
import {
  CABINET_BUTTON_IO, SIM_COMMAND_KEYS, SIM_COMMAND_POINTS, SIM_SENSOR_POINTS,
  SIM_SELECTOR_POINTS, SELECTOR_IO, selectorIo, simSelectorRows,
  SIM_OUTPUT_POINTS, SIM_READ_VAR_NAMES, SIM_SENSOR_VAR_NAMES,
  SIM_COMMAND_LABELS, SIM_COMMAND_COLORS,
  simCommandPoint, motorInterlockPartner,
} from './scenes/auto-dispensing/simulationIo';
import { MANUAL_INPUT_POINTS, MANUAL_OUTPUT_POINTS, pointAddressRow } from './scenes/auto-dispensing/manualIo';
import {
  MODBUS_READ_VARS, MITSUBISHI_READ_VARS, CABINET_BUTTONS, CABINET_SELECTOR,
} from './scenes/auto-dispensing/constants';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const ioSource = read('./scenes/auto-dispensing/simulationIo.ts');
const bridgeSource = read('./services/simulationPlc.ts');
const simSource = read('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const cabinetSource = read('./scenes/auto-dispensing/components/ControlCabinet.tsx');

// ============================================================
// 1. 点位映射完整性（运行时）
// ============================================================

describe('仿真 IO 绑定的点位单一来源', () => {
  it('5 个主令按键都映射到真实 PLC 输入变量名，且点位表里存在', () => {
    expect(SIM_COMMAND_KEYS).toHaveLength(5);
    expect(Object.keys(CABINET_BUTTON_IO)).toHaveLength(5);
    Object.values(CABINET_BUTTON_IO).forEach((name) => {
      expect(name).toMatch(/^BUTTON_/);
      expect(MODBUS_READ_VARS).toHaveProperty(name);
      expect(MANUAL_INPUT_POINTS.some((p) => p.key === name)).toBe(true);
    });
    expect(new Set(Object.values(CABINET_BUTTON_IO)).size).toBe(5);
  });

  it('主令点位三协议地址由点位表派生，不写死', () => {
    const start = simCommandPoint('start');
    expect(start.key).toBe('BUTTON_START');
    expect(start.addr).toBe('X0');
    expect(start.coil).toBe('C0');
    expect(start.s7).toBe('M0.0');
    expect(simCommandPoint('estop').key).toBe('BUTTON_ESTOP');
    expect(simCommandPoint('confirm').key).toBe('BUTTON_CONFIRM');
  });

  it('24 输入点 = 5 主令 + 2 选择开关 + 17 传感器，10 输出点互不重叠', () => {
    expect(MANUAL_INPUT_POINTS).toHaveLength(24);
    expect(MANUAL_OUTPUT_POINTS).toHaveLength(10);
    expect(SIM_COMMAND_POINTS).toHaveLength(5);
    expect(SIM_SELECTOR_POINTS).toHaveLength(2);
    expect(SIM_SENSOR_POINTS).toHaveLength(17);
    expect(SIM_OUTPUT_POINTS).toHaveLength(10);
    // 主令与选择开关是人工操作件，绝不能被「传感器轮询写回」反向覆盖
    expect(SIM_SENSOR_POINTS.some((p) => p.key.startsWith('BUTTON_'))).toBe(false);
    expect(SIM_SENSOR_POINTS.some((p) => p.key.startsWith('SEL_'))).toBe(false);
    expect(SIM_SENSOR_VAR_NAMES).toHaveLength(17);
    SIM_SENSOR_VAR_NAMES.forEach((name) => {
      expect(MITSUBISHI_READ_VARS).toHaveProperty(name);
    });
  });

  it('每轮 readVars 回读 34 个变量名（24 输入 + 10 输出），无重复', () => {
    expect(SIM_READ_VAR_NAMES).toHaveLength(34);
    expect(new Set(SIM_READ_VAR_NAMES).size).toBe(34);
    SIM_READ_VAR_NAMES.forEach((name) => expect(MODBUS_READ_VARS).toHaveProperty(name));
  });

  it('两位选择开关：两个输入点互锁、三协议地址由点位表派生', () => {
    expect(SIM_SELECTOR_POINTS.map((p) => p.key)).toEqual(['SEL_MANUAL', 'SEL_AUTO']);
    expect(simSelectorRows()).toHaveLength(2);
    const manual = selectorIo(false);
    const auto = selectorIo(true);
    expect(manual.names).toEqual([SELECTOR_IO.manual, SELECTOR_IO.auto]);
    expect(manual.values).toEqual([true, false]);
    expect(auto.values).toEqual([false, true]);
    // 任一档位必有一真一假，不能同时接通
    [manual, auto].forEach((io) => {
      expect(io.values.filter(Boolean)).toHaveLength(1);
      io.names.forEach((n) => expect(MITSUBISHI_READ_VARS).toHaveProperty(n));
    });
  });

  it('主令按钮的顺序 / 铭牌 / 颜色全部与 3D 按钮箱同源', () => {
    expect(SIM_COMMAND_KEYS).toEqual(CABINET_BUTTONS.map((b) => b.key));
    CABINET_BUTTONS.forEach((b) => {
      expect(SIM_COMMAND_LABELS[b.key as keyof typeof SIM_COMMAND_LABELS]).toContain(b.label);
      expect(SIM_COMMAND_COLORS[b.key as keyof typeof SIM_COMMAND_COLORS]).toBe(b.color);
    });
  });

  it('输出点地址可从点位表读出，前进/后退分别是 Y0/Y1、C30/C31', () => {
    const fwd = pointAddressRow('MOTOR_FWD', '电机正转');
    const rev = pointAddressRow('MOTOR_REV', '电机反转');
    expect(fwd.modbus).toBe('C30');
    expect(rev.modbus).toBe('C31');
    expect(SIM_OUTPUT_POINTS[0].addr).toBe('Y0');
    expect(SIM_OUTPUT_POINTS[1].addr).toBe('Y1');
  });

  it('电机正反转互锁：置位一方必须复位另一方', () => {
    expect(motorInterlockPartner('MOTOR_FWD')).toBe('MOTOR_REV');
    expect(motorInterlockPartner('MOTOR_REV')).toBe('MOTOR_FWD');
    expect(motorInterlockPartner('CYL_SEND_A')).toBeNull();
  });
});

// ============================================================
// 2. 面板确实写 PLC（源码级）
// ============================================================

describe('仿真面板所有控件都落到 PLC 地址', () => {
  it('主令按钮走单一来源映射 + PLC 写入桥接，不再内联 varMap', () => {
    expect(simSource).toContain('CABINET_BUTTON_IO[key]');
    expect(simSource).toContain('writeSimPlcVar');
    expect(simSource).toContain('simCommandPoint(key)');
    expect(simSource).toContain('simPointRows(point)');
    expect(simSource).not.toContain('varMap');
    expect(simSource).not.toContain("start: 'BUTTON_START'");
  });

  it('输出点可直接置位/复位 PLC 输出线圈，电机带互锁', () => {
    expect(simSource).toContain('toggleOutput(p.key)');
    expect(simSource).toContain('writeSimPlcVars');
    expect(simSource).toContain('motorInterlockPartner(key)');
    expect(simSource).toContain('SIM_OUTPUT_POINTS.map');
    expect(simSource).toContain('输出点直接置位');
  });

  it('PLC 输出回读驱动 3D 执行件，主令回读驱动 3D 按钮箱外观', () => {
    expect(simSource).toContain('store.setMotor(');
    expect(simSource).toContain('store.setSendCyl(');
    expect(simSource).toContain('store.setTiltCyl(');
    expect(simSource).toContain('store.setLamps(');
    expect(simSource).toContain('store.setButton(key, !!v[CABINET_BUTTON_IO[key]])');
  });

  it('24 输入点 LED 一律取 PLC 回读，不再读本地 sensors', () => {
    expect(simSource).toContain('MANUAL_INPUT_POINTS.map');
    expect(simSource).toContain('addrKey={p.key}');
    expect(simSource).toContain('active={!!ioSignals[p.key]}');
    expect(simSource).not.toContain('active={sensors.');
    expect(simSource).toContain('pointAddressRow(addrKey, label)');
  });

  it('传感器仍由孪生写回 PLC，位置仍走一个 32 位 DINT', () => {
    expect(simSource).toContain('SIM_SENSOR_VAR_NAMES.map');
    expect(simSource).toContain('inputPointLevel(name, snap)');
    expect(simSource).toContain('plcService.writeVars([...SIM_SENSOR_VAR_NAMES]');
    expect(simSource).toContain("plcService.writeWord('ENCODER_PULSES'");
    expect(simSource).not.toMatch(/ENCODER_BIT\d/);
  });

  it('面板不回填任何协议地址字面量', () => {
    ['X0', 'Y0', 'C30', 'M30.0', 'HR120'].forEach((addr) => {
      expect(simSource).not.toContain(`'${addr}'`);
      expect(simSource).not.toContain(`"${addr}"`);
    });
    expect(simSource).not.toContain('getAddr(');
  });
});

// ============================================================
// 3. 3D 按钮箱与写入桥接
// ============================================================

describe('3D 按钮箱与 PLC 写入桥接', () => {
  it('仿真模式下按钮箱按下/松开写对应 PLC 输入线圈', () => {
    expect(cabinetSource).toContain('CABINET_BUTTON_IO[key]');
    expect(cabinetSource).toContain('writeSimPlcVar');
    expect(cabinetSource).toContain("mode === 'sim'");
    expect(cabinetSource).toContain('setButton(key, down)');
    expect(cabinetSource).not.toContain('onDown: () => setButton(b.key, true)');
  });

  it('两位选择开关在仿真面板与 3D 旋钮上都可拨动并写 PLC 输入', () => {
    expect(simSource).toContain('SIM_SELECTOR_POINTS.map');
    expect(simSource).toContain('simSelectorRows()');
    expect(simSource).toContain('selectSelector(auto)');
    expect(simSource).toContain('selectorIo(auto)');
    expect(simSource).toContain('手动 / 自动 选择开关');
    expect(cabinetSource).toContain('SelectorSwitch auto={selectorAuto}');
    expect(cabinetSource).toContain('toggleSelector');
    expect(cabinetSource).toContain('selectorIo(next)');
    // 档位地址不回填到 JSX，全部走点位表
    expect(simSource).not.toContain("'X5'");
    expect(simSource).not.toContain("'C5'");
    expect(simSource).not.toContain("'M0.5'");
    // 旋钮只有两个物理档位，不再按 AppMode 停在软件中位
    expect(Object.keys(CABINET_SELECTOR.angles).sort()).toEqual(['auto', 'manual']);
    // 连接建立后上电同步一次档位，避免虚拟 PLC 两档同时断开与 3D 旋钮不一致
    expect(simSource).toContain('selectorSyncedRef');
    expect(simSource).toContain('selectorIo(useDispensingStore.getState().selectorAuto)');
    expect(simSource).toContain('selectorSyncedRef.current = false');
  });

  it('观众端只读：3D 旋钮拨动被 isViewerRuntime 守卫短路', () => {
    expect(cabinetSource).toContain('isViewerRuntime()');
    expect(cabinetSource).toMatch(/toggleSelector[\s\S]{0,160}isViewerRuntime\(\)/);
  });

  it('仿真面板主令/输出控件都带三协议地址悬停浮框（与手动模式同款下划线）', () => {
    // underline={false} 只在位置寄存器 badge 上保留，按钮触发区一律默认下划线
    expect((simSource.match(/<AddressHint/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(simSource).toContain('rows={simPointRows(point)}');
    expect(simSource).toContain('rows={simPointRows(p)}');
    expect(simSource).not.toMatch(/simPointRows\(p\)\}\s*underline=\{false\}/);
  });

  it('单一来源文件不 import React / plcService，桥接文件带未连接短路', () => {
    expect(ioSource).not.toContain("from 'react'");
    expect(ioSource).not.toContain('plc-websocket');
    expect(bridgeSource).toContain('plcService.connected');
    expect(bridgeSource).toContain('NOT_CONNECTED');
    expect(bridgeSource).toContain('plcService.writeVar');
    expect(bridgeSource).toContain('plcService.writeVars');
  });
});
