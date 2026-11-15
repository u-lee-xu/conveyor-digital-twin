/**
 * 位置寄存器 32 位 DINT 改造自检。
 *
 * 守住的口径：
 *   - 位置只有一个 32 位有符号 DINT 数据寄存器，不占线圈 / 输入点；
 *   - 低字在前：HR120 / D120 放低 16 位，HR121 / D121 放高 16 位；
 *     S7 用 MDI120 原生 32 位 DINT；
 *   - 拆字 / 合并无损（含负数、>65535 与 INT32 边界）；
 *   - 源码级防回退：不允许再出现 ENCODER_BIT0..7 位镜像、8 位线圈写入、
 *     观众端按位重建脉冲；仿真面板必须走 writeWord 数值通道。
 */
import { describe, it, expect } from 'vitest';
import {
  MODBUS_HOLDING_REGISTERS, ENCODER_DINT, ENCODER_REG_LABEL,
} from './scenes/auto-dispensing/constants';
import {
  DINT32, DINT_TEST_VECTORS, clampDint32, splitDint32, joinDint32,
  toSigned16, toUnsigned16,
} from './scenes/auto-dispensing/encoderDint';

/** Vite 的 import.meta.glob 只接受静态字面量，逐个文件分别声明 */
const globs: Record<string, Record<string, string>> = {
  './scenes/auto-dispensing/constants.ts': import.meta.glob<string>('./scenes/auto-dispensing/constants.ts', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/manualIo.ts': import.meta.glob<string>('./scenes/auto-dispensing/manualIo.ts', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseSimPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/helpContent.ts': import.meta.glob<string>('./scenes/auto-dispensing/helpContent.ts', { query: '?raw', import: 'default', eager: true }),
  './services/plc-websocket.ts': import.meta.glob<string>('./services/plc-websocket.ts', { query: '?raw', import: 'default', eager: true }),
  './index.ts': import.meta.glob<string>('./index.ts', { query: '?raw', import: 'default', eager: true }),
};

function rawSource(path: string): string {
  const source = globs[path]?.[path];
  if (!source) throw new Error(`源码读取失败：${path}`);
  return source;
}

const constantsSource = rawSource('./scenes/auto-dispensing/constants.ts');
const manualIoSource = rawSource('./scenes/auto-dispensing/manualIo.ts');
const simSource = rawSource('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const helpSource = rawSource('./scenes/auto-dispensing/helpContent.ts');
const plcSource = rawSource('./services/plc-websocket.ts');
const indexSource = rawSource('./index.ts');

describe('32 位 DINT 拆字 / 合并', () => {
  it('固定测试向量全部无损（含负数、跨 16 位、INT32 边界）', () => {
    DINT_TEST_VECTORS.forEach(({ value, words }) => {
      expect(splitDint32(value)).toEqual(words);
      expect(joinDint32(words[0], words[1])).toBe(value);
    });
  });

  it('每个字都在 0..65535，低字在前', () => {
    [0, 1, 170, 65535, 65536, 100000, 2147483647, -1, -2147483648].forEach((v) => {
      const [low, high] = splitDint32(v);
      expect(Number.isInteger(low) && low >= 0 && low <= 0xffff).toBe(true);
      expect(Number.isInteger(high) && high >= 0 && high <= 0xffff).toBe(true);
      expect(joinDint32(low, high)).toBe(clampDint32(v));
    });
    expect(splitDint32(65536)).toEqual([0, 1]);
    expect(splitDint32(-1)).toEqual([65535, 65535]);
  });

  it('clampDint32 夹到有符号 32 位，非法数值归零', () => {
    expect(clampDint32(2147483648)).toBe(DINT32.MAX);
    expect(clampDint32(-2147483649)).toBe(DINT32.MIN);
    expect(clampDint32(12.9)).toBe(12);
    expect(clampDint32(NaN)).toBe(0);
    expect(clampDint32(Infinity)).toBe(DINT32.MAX);
    expect(clampDint32(-Infinity)).toBe(DINT32.MIN);
  });

  it('MX Component 有符号 short 往返不改变位模式', () => {
    [0, 1, 170, 32767, 32768, 65535].forEach((word) => {
      expect(toUnsigned16(toSigned16(word))).toBe(word);
    });
    expect(toSigned16(0xffff)).toBe(-1);
    expect(toSigned16(0x8000)).toBe(-32768);
  });
});

describe('三协议地址表口径', () => {
  it('ENCODER_DINT 是唯一地址来源，且低字在前', () => {
    expect(ENCODER_DINT.TYPE).toBe('DINT32');
    expect(ENCODER_DINT.WORD_ORDER).toBe('low-first');
    expect(ENCODER_DINT.WORDS).toBe(2);
    expect(ENCODER_DINT.MODBUS_ADDRESS).toBe(MODBUS_HOLDING_REGISTERS.ENCODER_PULSES);
    expect(ENCODER_DINT.MODBUS_LABEL).toContain('HR121');
    expect(ENCODER_DINT.S7_ADDRESS).toBe('MDI120');
    expect(ENCODER_DINT.S7_LABEL).toBe('MD120');
    expect(ENCODER_DINT.MITSUBISHI_ADDRESS).toBe('D120');
    expect(ENCODER_DINT.MITSUBISHI_LABEL).toContain('D121');
    expect(ENCODER_REG_LABEL).toContain('D120');
  });

  it('constants.ts 不再有任何 ENCODER_BIT 线圈镜像', () => {
    expect(constantsSource).not.toMatch(/ENCODER_BIT\d/);
    expect(constantsSource).not.toContain('encoderMirrorBits');
    expect(constantsSource).toContain('ENCODER_DINT');
  });
});

describe('链路源码：位置只走数值通道', () => {
  it('仿真面板每轮只写一个 DINT，不再逐位写 8 个线圈', () => {
    expect(simSource).toContain("plcService.writeWord('ENCODER_PULSES'");
    expect(simSource).not.toContain('encoderMirrorBits');
    expect(simSource).not.toMatch(/ENCODER_BIT\d/);
  });

  it('通信服务下发 wordVariables 并提供独立的数值读写通道', () => {
    expect(plcSource).toContain('wordVariables: CONNECT_WORDS');
    expect(plcSource).toContain("type: 'read-words'");
    expect(plcSource).toContain("type: 'write-words'");
    expect(plcSource).toContain("address: ENCODER_DINT.S7_ADDRESS");
    expect(plcSource).toContain("address: ENCODER_DINT.MITSUBISHI_ADDRESS");
    // 三协议字数同源：S7 侧也曾误写成单字，元数据必须与 DINT 双字一致
    expect(plcSource).toContain('s7: { address: ENCODER_DINT.S7_ADDRESS, words: ENCODER_DINT.WORDS }');
    expect(plcSource).not.toContain('ENCODER_DINT.S7_ADDRESS, words: 1');
  });

  it('观众端直接读广播数值，不再按位重建脉冲', () => {
    expect(indexSource).toContain("v['ENCODER_PULSES']");
    expect(indexSource).toContain('Number.isFinite(encoderValue)');
    expect(indexSource).not.toMatch(/ENCODER_BIT\d/);
    expect(indexSource).not.toContain('pulses |= 1 << i');
  });

  it('广播快照缺少位置字段时保留上次位置，不把 undefined 误写成 0', () => {
    expect(indexSource).toContain("if (typeof encoderValue === 'number' && Number.isFinite(encoderValue))");
    expect(indexSource).not.toContain("Number(v['ENCODER_PULSES']) || 0");
  });

  it('手动 I/O 点位表不含编码器位，位置寄存器单独显示', () => {
    expect(manualIoSource).not.toMatch(/ENCODER_BIT\d/);
    expect(manualIoSource).not.toContain('encoderBits(');
    expect(manualIoSource).toContain('ENCODER_REGISTER_INFO');
  });

  it('帮助文档明确 X0/X1 与 C0 交给 PLC、三菱只取 D 寄存器', () => {
    expect(helpSource).toContain('X0/X1');
    expect(helpSource).toContain('C0');
    expect(helpSource).toContain('D120');
    expect(helpSource).not.toContain('8 位线圈 ENCODER_BIT0-7');
  });
});
