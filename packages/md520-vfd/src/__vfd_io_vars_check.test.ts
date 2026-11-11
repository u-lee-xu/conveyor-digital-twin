/**
 * 外部 PLC 布尔点位链路防回退自检。
 * 目标：AutoShop / 博途 / GX Works2 / 实物 PLC 都能通过网关读写变频器 DI/DO，
 * 且共用连接服务的默认行为对其它已定稿设备逐字不变。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MD520_DI_VAR_KEYS, MD520_DO_VAR_KEYS, MD520_S7_VARS,
  MD520_MITSUBISHI_SIM_VARS, MD520_MITSUBISHI_REAL_VARS,
  MD520_MODBUS_DI_BASE, MD520_MODBUS_DO_BASE, MD520_DO_BITS,
  md520BoolVarsFor, packDiFlags, unpackDoFlags,
} from './constants/md520-io-vars';
import { MD520_DO } from './vfd/md520Spec';

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ALL_KEYS = [...MD520_DI_VAR_KEYS, ...MD520_DO_VAR_KEYS];

describe('三协议布尔点位表', () => {
  it('DI 5 路 / DO 3 路，三张表键集合完全一致', () => {
    expect(MD520_DI_VAR_KEYS).toHaveLength(5);
    expect(MD520_DO_VAR_KEYS).toHaveLength(3);
    for (const table of [MD520_S7_VARS, MD520_MITSUBISHI_SIM_VARS, MD520_MITSUBISHI_REAL_VARS]) {
      expect(Object.keys(table).sort()).toEqual([...ALL_KEYS].sort());
    }
  });

  it('Modbus TCP 用 coils 130~134 / 140~142，纯数字地址', () => {
    expect(MD520_MODBUS_DI_BASE).toBe(130);
    expect(MD520_MODBUS_DO_BASE).toBe(140);
    expect(md520BoolVarsFor('modbus')).toBeNull();
  });

  it('S7 用 M 区位，避开 485 数值字占用的 MB1000~MB1015', () => {
    for (const key of ALL_KEYS) expect(MD520_S7_VARS[key]).toMatch(/^M\d+\.\d$/);
    const bytes = ALL_KEYS.map((k) => Number(MD520_S7_VARS[k].slice(1).split('.')[0]));
    expect(bytes.every((b) => b < 1000 || b > 1015)).toBe(true);
    expect(md520BoolVarsFor('s7')?.VFD_DI1).toBe('M130.0');
  });

  it('三菱仿真档 Y/X；实物档无实际接线统一 M 区', () => {
    expect(MD520_MITSUBISHI_SIM_VARS.VFD_DI1).toBe('Y0');
    expect(MD520_MITSUBISHI_SIM_VARS.VFD_DO1).toBe('X0');
    expect(Object.values(MD520_MITSUBISHI_SIM_VARS).every((v) => /^[YX]\d+$/.test(v))).toBe(true);
    expect(Object.values(MD520_MITSUBISHI_REAL_VARS).every((v) => /^M\d+$/.test(v))).toBe(true);
    expect(md520BoolVarsFor('mitsubishi', 'real')?.VFD_DI1).toBe('M130');
    expect(md520BoolVarsFor('mitsubishi', 'simulator')?.VFD_DI1).toBe('Y0');
  });

  it('DI 位字打包 / DO 位字解包与 MD520_DI / MD520_DO 顺序一致', () => {
    expect(packDiFlags([true, false, true, false, true])).toBe(0b10101);
    expect(packDiFlags([false, false, false, false, false])).toBe(0);
    expect(MD520_DO_BITS).toEqual(MD520_DO.map((d) => d.bit));
    expect(unpackDoFlags(1 << 0)).toEqual([true, false, false]);
    expect(unpackDoFlags((1 << 4) | (1 << 2))).toEqual([false, true, true]);
  });
});

describe('前端与共用服务的接线', () => {
  const link = src('platform/VfdLink.tsx');
  const conn = src('platform/VfdPlcConnection.tsx');
  const shared = src('../../shared/src/services/modbus-websocket.ts');

  it('VfdLink 按协议分派布尔读写，并保留零帧跳过', () => {
    expect(link).toContain('modbusService.readCoils(');
    expect(link).toContain('modbusService.writeCoils(');
    expect(link).toContain('modbusService.readVars(');
    expect(link).toContain('modbusService.writeVars(');
    expect(link).toContain('packDiFlags');
    expect(link).toContain('unpackDoFlags');
    expect(link).toContain('s2.engaged || diFlags !== 0');
    expect(link).toContain('零帧跳过');
  });

  it('VfdPlcConnection 下发设备自带点位表并启用三菱双档', () => {
    expect(conn).toContain('md520BoolVarsFor');
    expect(conn).toContain('boolVariables');
    expect(conn).toContain('enableMitsubishiProfile');
    expect(conn).toContain('onProfileChange');
    expect(conn).not.toContain('modbusService.connect(config)');
  });

  it('共用服务只在显式传入 boolVariables 时改表，默认行为不变', () => {
    expect(shared).toContain('boolVariables?: Record<string, string>');
    expect(shared).toContain('variables: config.boolVariables ?? S7_VARIABLES');
    expect(shared).toContain('variables: config.boolVariables,');
    // 没有全局 setVariableTable 状态，避免切设备后污染其它场景
    expect(shared).not.toContain('setVariableTable');
  });
});
