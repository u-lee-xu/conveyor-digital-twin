/**
 * 原点/终点传感器 + 增量式编码器数据寄存器自检
 *
 * 语义约定：
 *   - 两个接近开关在行程两端（进入 ±5mm 触发、离开 ±15mm 才复位，滞回防抖）；
 *   - 位置数据寄存器是**32 位有符号 DINT**，也是**增量式**计数器：只按每次位移的
 *     脉冲增量累加，前进 +、后退 -，绝不直接写绝对坐标；
 *   - 增量式编码器没有绝对零点，只有回到原点传感器（Z 相）才校准归零；
 *   - 位置不占任何线圈 / 输入点；A/B 相接 X0/X1 与高速计数器 C0 由 PLC 程序负责。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDispensingStore } from './stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, PULSES_PER_M, ENCODER_PULSES_MAX,
  LIMIT_ENTER_TOL, LIMIT_EXIT_TOL, MODBUS_HOLDING_REGISTERS, ENCODER_DINT,
} from './scenes/auto-dispensing/constants';
import {
  splitDint32, joinDint32, DINT_TEST_VECTORS,
} from './scenes/auto-dispensing/encoderDint';

const s = () => useDispensingStore.getState();

beforeEach(() => { s().resetAll(); });

describe('位置反馈：传感器与寄存器地址', () => {
  it('寄存器地址、行程上限与 32 位 DINT 口径闭合', () => {
    expect(MODBUS_HOLDING_REGISTERS.ENCODER_PULSES).toBe(120);
    expect(ENCODER_DINT.MODBUS_ADDRESS).toBe(MODBUS_HOLDING_REGISTERS.ENCODER_PULSES);
    expect(ENCODER_DINT.TYPE).toBe('DINT32');
    expect(ENCODER_DINT.WORDS).toBe(2);
    expect(ENCODER_DINT.WORD_ORDER).toBe('low-first');
    expect(ENCODER_DINT.S7_ADDRESS).toBe('MDI120');
    expect(ENCODER_DINT.MITSUBISHI_ADDRESS).toBe('D120');
    expect(ENCODER_PULSES_MAX).toBe(Math.round((SLIDER_MAX_X - SLIDER_MIN_X) * PULSES_PER_M));
    // 32 位 DINT 可容纳真实高速计数器原始值，不再受 8 位镜像的 255 限制
    expect(ENCODER_PULSES_MAX).toBeLessThan(2 ** 31);
    expect(LIMIT_ENTER_TOL).toBeLessThan(LIMIT_EXIT_TOL);
  });

  it('初始停在原点：原点传感器 ON、终点 OFF、寄存器 = 0', () => {
    expect(s().sliderX).toBe(SLIDER_MIN_X);
    expect(s().sensors.limitStart).toBe(true);
    expect(s().sensors.limitEnd).toBe(false);
    expect(s().encoderPulses).toBe(0);
  });
});

describe('增量式计数：前进加、后退减', () => {
  it('前进递增、后退递减，方向与位移一致', () => {
    s().setSliderX(SLIDER_MIN_X + 0.5);
    expect(s().encoderPulses).toBe(50);
    expect(s().encoderDir).toBe(1);
    expect(s().sensors.limitStart).toBe(false);

    s().setSliderX(SLIDER_MIN_X + 0.2);
    expect(s().encoderPulses).toBe(20);
    expect(s().encoderDir).toBe(-1);
    expect(s().sliderX).toBeCloseTo(SLIDER_MIN_X + 0.2, 6);
  });

  it('每帧不足 1 脉冲的位移不会丢计数（浮点累计器）', () => {
    // 0.32 m/s @60fps ≈ 0.005m/帧 = 0.5 脉冲，逐帧 round 会全丢
    const step = 0.005;
    let x = SLIDER_MIN_X + 0.02; // 先离开原点滞回区
    s().setSliderX(x);
    for (let i = 0; i < 100; i += 1) {
      x += step;
      s().setSliderX(x);
    }
    expect(s().encoderPulses).toBe(Math.round((x - SLIDER_MIN_X) * PULSES_PER_M));
    expect(s().encoderPulses).toBe(52);
  });

  it('超行程被夹紧，寄存器不越界', () => {
    s().setSliderX(SLIDER_MAX_X + 10);
    expect(s().sliderX).toBe(SLIDER_MAX_X);
    expect(s().encoderPulses).toBe(ENCODER_PULSES_MAX);
    s().setSliderX(SLIDER_MIN_X - 10);
    expect(s().sliderX).toBe(SLIDER_MIN_X);
    expect(s().encoderPulses).toBe(0);
  });
});

describe('两个位置传感器', () => {
  it('到达终点触发终点传感器，寄存器到行程上限', () => {
    s().setSliderX(SLIDER_MAX_X);
    expect(s().sensors.limitEnd).toBe(true);
    expect(s().sensors.limitStart).toBe(false);
    expect(s().encoderPulses).toBe(ENCODER_PULSES_MAX);
  });

  it('回到原点触发原点传感器并把寄存器按 Z 相归零', () => {
    s().setSliderX(SLIDER_MAX_X);
    expect(s().encoderPulses).toBe(ENCODER_PULSES_MAX);
    s().setSliderX(SLIDER_MIN_X);
    expect(s().sensors.limitStart).toBe(true);
    expect(s().sensors.limitEnd).toBe(false);
    expect(s().encoderPulses).toBe(0);
    expect(s().encoderAccum).toBe(0);
  });

  it('边界滞回：滑块在阈值内微抖时信号不反复翻转', () => {
    s().setSliderX(SLIDER_MIN_X + 0.010); // 已出触发窗口，但未到退出阈值
    expect(s().sensors.limitStart).toBe(true);
    s().setSliderX(SLIDER_MIN_X + 0.020); // 越过退出阈值
    expect(s().sensors.limitStart).toBe(false);
    s().setSliderX(SLIDER_MIN_X + 0.010); // 回到中间带，应保持 OFF
    expect(s().sensors.limitStart).toBe(false);
    s().setSliderX(SLIDER_MIN_X); // 真正回原点才 ON 且归零
    expect(s().sensors.limitStart).toBe(true);
    expect(s().encoderPulses).toBe(0);
  });
});

describe('寄存器是唯一真值', () => {
  it('一个 32 位 DINT 值拆成两个字后能无损合并（含负数与边界）', () => {
    DINT_TEST_VECTORS.forEach(({ value, words }) => {
      expect(splitDint32(value)).toEqual(words);
      expect(joinDint32(words[0], words[1])).toBe(value);
    });
  });

  it('教学量程内寄存器值同源对齐滑块与两个传感器', () => {
    [0, 1, 55, 170, ENCODER_PULSES_MAX].forEach((p) => {
      s().setEncoderPulses(p);
      expect(s().encoderPulses).toBe(p);
      expect(s().sliderX).toBeCloseTo(SLIDER_MIN_X + p / PULSES_PER_M, 6);
    });
  });

  it('观众端 / PLC 回读按脉冲同源对齐滑块与两个传感器', () => {
    s().setEncoderPulses(ENCODER_PULSES_MAX);
    expect(s().sliderX).toBeCloseTo(SLIDER_MAX_X, 6);
    expect(s().sensors.limitEnd).toBe(true);
    expect(s().encoderPulses).toBe(ENCODER_PULSES_MAX);

    s().setEncoderPulses(0);
    expect(s().sliderX).toBeCloseTo(SLIDER_MIN_X, 6);
    expect(s().sensors.limitStart).toBe(true);
    expect(s().sensors.limitEnd).toBe(false);
    expect(s().encoderPulses).toBe(0);
  });
});
