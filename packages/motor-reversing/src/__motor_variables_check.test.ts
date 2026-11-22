/** S5 静态自检：地址同源、三协议通道、位宽字序、无自锁、面板无地址字面量 */
import { describe, expect, it } from 'vitest';
import {
  MOTOR_WORD_VARIABLES, MOTOR_ADDRESS_ROWS, MOTOR_SENSOR_FEEDBACK, MOTOR_COILS,
  MOTOR_BOOL_S7, MOTOR_BOOL_MITSUBISHI, MOTOR_OUTPUT_COIL_NAMES,
  MOTOR_REPORT_WORD_NAMES, MOTOR_COMMAND_WORD_NAMES,
  MOTOR_SENSOR_FEEDBACK_BASE, MOTOR_SENSOR_VAR_NAMES,
  motorBoolVarsFor, motorAddressRowsFor, motorSensorHintRow,
  motorSensorBits, motorSensorMask, encodeMotorAction, decodeMotorAction,
} from './constants/motorVariables';
import {
  splitMotorDint32, joinMotorDint32, MOTOR_DINT32_TEST_VECTORS,
} from './constants/dint32';
import { MOTOR_EMPTY_BUTTONS } from './constants/motorConstants';

const fs = process.getBuiltinModule('fs')!;
const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8') as string;

describe('变量 / 地址表单一来源', () => {
  it('地址表行数 = 字变量 + 输出行 + 14 路反馈，表头四列固定', () => {
    expect(MOTOR_ADDRESS_ROWS.length).toBe(
      Object.keys(MOTOR_WORD_VARIABLES).length + 2 + MOTOR_SENSOR_FEEDBACK.length,
    );
    const table = read('src/platform/MotorPanelParts.tsx');
    for (const head of ['信号', '三菱 FX', 'Modbus TCP', 'Siemens S7']) {
      expect(table).toContain(head);
    }
    expect(table).toContain('MOTOR_ADDRESS_ROWS');
  });

  it('位移是 32 位 DINT 双字、低字在前，报告字与命令字不混用', () => {
    const d = MOTOR_WORD_VARIABLES.MOTOR_DISPLACEMENT;
    expect(d.type).toBe('dint32');
    expect(d.wordOrder).toBe('low-first');
    expect(d.modbus.words).toBe(2);
    expect(MOTOR_REPORT_WORD_NAMES).not.toContain('MOTOR_ACTION_W');
    expect(MOTOR_COMMAND_WORD_NAMES).toContain('MOTOR_ACTION_W');
    expect(MOTOR_REPORT_WORD_NAMES).not.toContain('MOTOR_DISPLACEMENT');
  });

  it('地址行由变量表派生：双字 HR0·1 / D0·D1，单字 HR2 / D2', () => {
    const row = (signal: string) => MOTOR_ADDRESS_ROWS.find((r) => r.signal === signal)!;
    expect(row('皮带位移 DINT32')).toMatchObject({ modbus: 'HR0·1', mitsubishi: 'D0·D1', s7: 'MD0' });
    expect(row('电机转速')).toMatchObject({ modbus: 'HR2', mitsubishi: 'D2', s7: 'MW4' });
    expect(row('显式动作字')).toMatchObject({ modbus: 'HR7', direction: 'PLC → 设备' });
  });

  it('输出线圈与 14 路反馈三协议同源，Modbus 不下发布尔表', () => {
    expect(MOTOR_OUTPUT_COIL_NAMES.length).toBe(3);
    expect(MOTOR_SENSOR_FEEDBACK.length).toBe(14);
    expect(MOTOR_SENSOR_FEEDBACK_BASE).toBe(MOTOR_SENSOR_FEEDBACK[0].modbus);
    expect(MOTOR_SENSOR_VAR_NAMES.length).toBe(14);
    expect(motorBoolVarsFor('modbus')).toBeUndefined();
    expect(Object.keys(motorBoolVarsFor('s7')!).length).toBe(3 + 14);
    expect(Object.keys(motorBoolVarsFor('mitsubishi')!).length).toBe(3 + 14);
    for (const r of MOTOR_SENSOR_FEEDBACK) {
      expect(MOTOR_BOOL_S7[r.key]).toBe(r.s7);
      expect(MOTOR_BOOL_MITSUBISHI[r.key]).toBe(r.mitsubishi);
    }
  });

  it('面板浮框按语义键查表，缺信号立即抛错', () => {
    expect(motorAddressRowsFor('km1')[0].label).toBe('KM1 / KM2 线圈');
    expect(motorSensorHintRow('MOTOR_BTN_STOP')[0].label).toBe('停止按钮');
    expect(() => motorSensorHintRow('NOT_A_SIGNAL')).toThrow(/缺少信号/);
  });

  it('14 路位掩码与纯函数同源同序', () => {
    const feedback = {
      buttons: { ...MOTOR_EMPTY_BUTTONS, fwdJog: true, stop: true },
      km1On: true, km2On: false, frClosed: true,
      running: true, forward: true, reverse: false,
      overload: false, qfClosed: true, interlocked: false,
    };
    const bits = motorSensorBits(feedback);
    expect(bits.length).toBe(14);
    expect(bits[0]).toBe(true);
    expect(bits[4]).toBe(true);
    expect(bits[5]).toBe(true);
    expect(bits[7]).toBe(true);
    const mask = motorSensorMask(feedback);
    expect(mask & (1 << 0)).toBeTruthy();
    expect(mask & (1 << 4)).toBeTruthy();
    expect(mask & (1 << 6)).toBeFalsy();
  });

  it('显式动作字 code*1000+seq 往返一致', () => {
    expect(decodeMotorAction(encodeMotorAction(3, 127))).toEqual({ code: 3, seq: 127 });
    expect(decodeMotorAction(encodeMotorAction(1, 999))).toEqual({ code: 1, seq: 999 });
    expect(decodeMotorAction(Number.NaN)).toEqual({ code: 0, seq: 0 });
  });
});

describe('地址分配规范：场景内独立命名空间（P1/P2/P5）', () => {
  it('输出线圈三协议同源且从 C0 起，地址表由线圈表派生', () => {
    // 只锁本场景自洽，不与其他场景比较，也不写跨场景避让判断（规范 P4）。
    expect(MOTOR_COILS.MOTOR_KM1).toBe(0);
    MOTOR_OUTPUT_COIL_NAMES.forEach((name, i) => {
      expect(MOTOR_COILS[name], name).toBe(i);
      expect(MOTOR_BOOL_MITSUBISHI[name], name).toBe(`Y${i}`);
      expect(MOTOR_BOOL_S7[name], name).toBe(`M20.${i}`);
    });
    const coilRow = MOTOR_ADDRESS_ROWS.find((r) => r.signal === 'KM1 / KM2 线圈')!;
    expect(coilRow).toMatchObject({ modbus: 'C0·C1', mitsubishi: 'Y0·Y1', s7: 'M20.0·M20.1' });
    expect(MOTOR_ADDRESS_ROWS.find((r) => r.signal === 'FR 复位')?.modbus).toBe('C2');
    expect(MOTOR_SENSOR_FEEDBACK.map((r) => r.modbus))
      .toEqual(Array.from({ length: 14 }, (_, i) => 10 + i));
  });
});

describe('32 位 DINT 拆合字', () => {
  it('向量覆盖 0 / 正值 / 负值 / 边界，低字在前', () => {
    for (const { value, words } of MOTOR_DINT32_TEST_VECTORS) {
      expect(splitMotorDint32(value)).toEqual(words);
      expect(joinMotorDint32(words[0], words[1])).toBe(value);
    }
    expect(splitMotorDint32(Number.NaN)).toEqual([0, 0]);
  });
});

describe('无自锁 / 硬件互锁契约', () => {
  it('地址表不存在 KM 辅助常开自锁信号', () => {
    for (const r of MOTOR_ADDRESS_ROWS) expect(r.signal).not.toContain('自锁');
    for (const r of MOTOR_SENSOR_FEEDBACK) expect(r.key).not.toContain('LATCH');
  });

  it('硬件互锁是唯一解析入口，签名里没有保持 / 自锁参数', () => {
    const src = read('src/constants/motorConstants.ts');
    expect(src).toContain('export function resolveContactors(');
    expect(src).toContain('硬件互锁');
    const signature = src.split('export function resolveContactors(')[1].split(')')[0];
    expect(signature).not.toMatch(/latch|selfHold|hold/i);
  });

  it('面板与 3D 组件不出现地址字面量', () => {
    const files = [
      'src/platform/MotorManualPanel.tsx',
      'src/platform/MotorDemoPanel.tsx',
      'src/platform/MotorSimPanel.tsx',
      'src/platform/MotorPanelParts.tsx',
      'src/platform/MotorAddressHint.tsx',
      'src/scenes/components/MotorParts.tsx',
    ];
    const literal = /(?:C(?:8\d|9\d|10[0-3])|HR3\d\d|MW11\d\d|MD4\d\d|M1[78]\d\.\d|D42\d|Y6\d|X6\d|X7\d)/;
    for (const file of files) {
      expect(read(file), file).not.toMatch(literal);
    }
  });

  it('包自描述与统一入口一致', () => {
    const desc = JSON.parse(read('device.json'));
    expect(desc.id).toBe('motor-reversing');
    expect(desc.modeCount).toBe(3);
    expect(desc.hasPhysics).toBe(false);
    expect(desc.needsPlcService).toBe(true);
    expect(read('src/device.ts')).toContain(desc.exportName);
    expect(read('src/index.ts')).toContain(`export const ${desc.exportName}`);
  });
});
