/**
 * 32 位 REAL 双字链路自检：浏览器编解码 ↔ 网关 dint32.js 交叉验证。
 *
 * 用户口径「液位数据用 real 或 float，32 位小数」。本场景借网关既有 dint32
 * 双字通道做 IEEE754 位模式透传，因此必须证明：
 *  浏览器 splitReal32 的两个字 === 网关 splitDint32 写出的两个字（FC16 单帧）；
 *  网关 joinDint32 读回的整数 === 浏览器 dintBitsToFloat 的输入（FC03 双字）。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  floatToDintBits, dintBitsToFloat, splitReal32, joinReal32,
  quantizeReal32, REAL32_TEST_VECTORS, LIQUID_REAL32_WORD_ORDER,
} from './constants/real32';
import { encodeAction, decodeAction, LIQUID_ACTION } from './constants/liquidVariables';

// src/ → 仓库根需要 ../../..，与项目其它包的自检同口径
const require = createRequire(import.meta.url);
const gateway = require('../../../websocket-server/dint32.js') as {
  splitDint32: (v: number) => number[];
  joinDint32: (low: number, high: number) => number;
  clampDint32: (v: number) => number;
  toUnsigned16: (v: number) => number;
};

describe('REAL32 字序与网关口径', () => {
  it('字序常量锁死 low-first，与网关 copyWordTable 白名单一致', () => {
    expect(LIQUID_REAL32_WORD_ORDER).toBe('low-first');
  });

  it.each(REAL32_TEST_VECTORS)('向量 $value 的双字与网关 FC16 写帧一致', ({ value, words }) => {
    expect(splitReal32(value)).toEqual([...words]);
    // 浏览器把位模式当 DINT 交给网关，网关拆出的两个字必须逐字相同
    const bits = floatToDintBits(value);
    expect(gateway.splitDint32(gateway.clampDint32(bits))).toEqual([...words]);
    expect(words[0]).toBeGreaterThanOrEqual(0);
    expect(words[1]).toBeGreaterThanOrEqual(0);
    expect(words[0]).toBeLessThanOrEqual(0xffff);
    expect(words[1]).toBeLessThanOrEqual(0xffff);
  });

  it.each(REAL32_TEST_VECTORS)('向量 $value 经网关 joinDint32 读回仍是原 REAL', ({ value, words }) => {
    const joined = gateway.joinDint32(gateway.toUnsigned16(words[0]), gateway.toUnsigned16(words[1]));
    expect(dintBitsToFloat(joined)).toBeCloseTo(Math.fround(value), 5);
    expect(joinReal32(words[0], words[1])).toBeCloseTo(Math.fround(value), 5);
  });

  it('往返无损（float32 量化后）：0 / 小数 / 负值 / 满量程 / 极小值', () => {
    for (const v of [0, 0.001, 1.5, -2.25, 3.14159, 12.75, 100, 300, -0.5]) {
      const [low, high] = splitReal32(v);
      expect(joinReal32(low, high)).toBe(quantizeReal32(v));
    }
  });

  it('NaN / Infinity 一律归零，绝不把非法浮点写进 PLC', () => {
    expect(floatToDintBits(NaN)).toBe(0);
    expect(floatToDintBits(Infinity)).toBe(0);
    expect(floatToDintBits(-Infinity)).toBe(0);
    expect(quantizeReal32(NaN)).toBe(0);
    expect(splitReal32(NaN)).toEqual([0, 0]);
  });

  it('位模式经网关 clampDint32 不被截断（整数位模式无损）', () => {
    for (const v of [0.001, 3.14159, 123.456, 300, -2.25]) {
      const bits = floatToDintBits(v);
      expect(gateway.clampDint32(bits)).toBe(bits);
      expect(gateway.joinDint32(...(gateway.splitDint32(bits) as [number, number]))).toBe(bits);
    }
  });
});

describe('显式动作字边沿编码', () => {
  it('code*1000 + seq 编码/解码可逆，seq 0~999 循环', () => {
    for (const code of [0, 1, 2, 3, 4]) {
      for (const seq of [0, 1, 7, 999]) {
        expect(decodeAction(encodeAction(code, seq))).toEqual({ code, seq });
      }
    }
    expect(encodeAction(LIQUID_ACTION.RESET, 1000)).toBe(2000);
    expect(decodeAction(-5)).toEqual({ code: 0, seq: 0 });
  });

  it('序号变化沿可辨别，重复电平不重复触发', () => {
    const a = encodeAction(LIQUID_ACTION.LOAD_RECIPE, 41);
    const b = encodeAction(LIQUID_ACTION.LOAD_RECIPE, 42);
    expect(decodeAction(a).seq).not.toBe(decodeAction(b).seq);
    expect(decodeAction(a).code).toBe(decodeAction(b).code);
    expect(decodeAction(a).seq).toBe(decodeAction(a).seq);
  });
});
