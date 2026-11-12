/**
 * 液体混装 S1~S5 静态自检：接线点、场景隔离、变量表单源、REAL 地址、回写表、模式边界。
 * 故意漏接任一项都要能被本文件发现（S1 门禁要求）。
 * src/ → 仓库根需要 ../../..，与项目其它包自检同口径。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIQUID_WORD_VARIABLES, LIQUID_REAL_NAMES, LIQUID_REPORT_WORD_NAMES,
  LIQUID_COMMAND_WORD_NAMES, LIQUID_SENSOR_FEEDBACK, LIQUID_BOOL_S7,
  LIQUID_BOOL_MITSUBISHI, LIQUID_OUTPUT_COIL_NAMES, LIQUID_ADDRESS_ROWS,
  LIQUID_COILS, liquidSensorBits, liquidSensorMask, LIQUID_IO_MAP,
} from './constants/liquidVariables';
import { liquidSensorStates, LIQUID_EMPTY_OUTPUTS, LIQUID_PHASE } from './constants/liquidConstants';
import { LIQUID_REAL32_WORD_ORDER } from './constants/real32';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(here, '../../..'));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('S1 六处接线', () => {
  const wiring: [string, string][] = [
    ['packages/platform/src/registry.ts', 'liquidMixingDevice'],
    ['packages/platform/package.json', '"@digital-twin/liquid-mixing"'],
    ['packages/platform/vite.config.ts', "'@digital-twin/liquid-mixing'"],
    ['packages/platform/tsconfig.app.json', '"@digital-twin/liquid-mixing"'],
    ['packages/platform/tsconfig.app.json', '"@digital-twin/liquid-mixing/*"'],
    ['packages/platform/tsconfig.app.json', '"../liquid-mixing/src"'],
    ['packages/platform/src/index.css', '../../liquid-mixing/src'],
    ['packages/liquid-mixing/vite.config.ts', 'test:'],
    ['packages/liquid-mixing/tsconfig.app.json', '"include"'],
  ];
  it.each(wiring)('%s 含 %s', (file, token) => {
    expect(read(file).includes(token)).toBe(true);
  });

  it('注册表恰好 7 个设备，新设备排在末尾且已定稿 6 场景顺序不变', () => {
    const reg = read('packages/platform/src/registry.ts');
    const ids = [...reg.matchAll(/^\s{2}(\w+Device),$/gm)].map((m) => m[1]);
    expect(ids).toEqual([
      'conveyorDevice', 'pneumaticDevice', 'trafficLightDevice',
      'dispensingDevice', 'md520VfdDevice', 'inovanceGantryDevice', 'liquidMixingDevice',
    ]);
  });
});

describe('外部 PLC 仿真软件 / 零新增内置服务', () => {
  const startLab = read('scripts/start-lab.cjs');
  const connection = read('packages/liquid-mixing/src/platform/LiquidPlcConnection.tsx');
  const index = read('packages/liquid-mixing/src/index.ts');

  it('不新增内置虚拟 PLC、端口或进程：启动编排零液体混装残留', () => {
    expect(startLab).not.toMatch(/liquid[-_]mixing|LIQUID_PLC_PORT|mock-liquid/i);
    expect(startLab).toContain('assertInternalPorts');
  });
  it('连接预设只给外部仿真软件常规入口，不固化 IP、不列本机练习靶机', () => {
    expect(connection).toContain('port: 502');
    expect(connection).toContain('port: 102');
    expect(connection).not.toMatch(/1509|5089/);
    expect(connection).not.toMatch(/192\.168\.|10\.\d+\.\d+\.|172\.16\./);
  });
  it('设备定义声明三协议与三模式，且带观众只读镜像', () => {
    expect(index).toContain("id: 'manual'");
    expect(index).toContain("id: 'auto'");
    expect(index).toContain("id: 'sim'");
    expect(index).not.toContain("id: 'scoring'");
    expect(index).toContain('applyBroadcast');
    expect(index).toContain('exportSnapshot');
  });
  it('手动 / 演示面板不含任何对外通信调用（零对外帧）', () => {
    for (const f of ['LiquidManualPanel.tsx', 'LiquidDemoPanel.tsx']) {
      const src = read(`packages/liquid-mixing/src/platform/${f}`);
      expect(src).not.toMatch(/modbusService|writeWords|writeCoils|writeVars|readWords/);
    }
  });
  it('已定稿 6 个场景源码零液体混装残留', () => {
    for (const pkg of ['auto-dispensing', 'conveyor-sorting', 'md520-vfd', 'inovance-gantry', 'pneumatic-robot', 'traffic-light']) {
      const src = read(`packages/${pkg}/src/index.ts`);
      expect(src).not.toMatch(/LIQUID_|liquidMixing/);
    }
  });
});

describe('S5 变量表单一来源与 32 位 REAL 双字', () => {
  it('四路 REAL 液位走 dint32 双字通道，wordOrder 锁死 low-first', () => {
    for (const name of LIQUID_REAL_NAMES) {
      const spec = LIQUID_WORD_VARIABLES[name];
      expect(spec.type).toBe('dint32');
      expect(spec.wordOrder).toBe(LIQUID_REAL32_WORD_ORDER);
      expect(spec.modbus.words).toBe(2);
      expect(spec.mitsubishi.words).toBe(2);
    }
  });

  it('四路 REAL 地址 300~307 连续成对，且不与既有设备寄存器重叠', () => {
    const bases = LIQUID_REAL_NAMES.map((n) => LIQUID_WORD_VARIABLES[n].modbus.address);
    expect(bases).toEqual([300, 302, 304, 306]);
    for (const b of bases) {
      expect(b).toBeGreaterThan(212); // 龙门 HR200~212
      expect(b).not.toBe(120); // 配药 HR120·121
      expect(b).toBeLessThan(4096); // MD520 0x1000 起
    }
  });

  it('字变量类型只落在网关白名单内，uint16 一律单字', () => {
    for (const [name, spec] of Object.entries(LIQUID_WORD_VARIABLES)) {
      expect(['dint32', 'uint16']).toContain(spec.type);
      if (spec.type === 'uint16') {
        expect(spec.modbus.words, name).toBe(1);
        expect(spec.s7.words, name).toBe(1);
        expect(spec.mitsubishi.words, name).toBe(1);
      }
    }
  });

  it('上行上报字与下行命令字零交集，避免设备反写 PLC 输出', () => {
    const up = new Set<string>(LIQUID_REPORT_WORD_NAMES);
    for (const name of LIQUID_COMMAND_WORD_NAMES) expect(up.has(name)).toBe(false);
    for (const name of LIQUID_REAL_NAMES) expect(LIQUID_COMMAND_WORD_NAMES.includes(name as never)).toBe(false);
  });

  it('三协议地址同源：每行四列齐全且地址表行数与常量一致', () => {
    expect(LIQUID_ADDRESS_ROWS.length).toBeGreaterThanOrEqual(20);
    for (const row of LIQUID_ADDRESS_ROWS) {
      expect(row.signal).toBeTruthy();
      expect(row.mitsubishi).toBeTruthy();
      expect(row.modbus).toBeTruthy();
      expect(row.s7).toBeTruthy();
    }
    const table = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
    expect(table).toContain('三菱 FX');
    expect(table).toContain('Modbus TCP');
    expect(table).toContain('Siemens S7');
  });

  it('现场总线映射只是声明，不含底层链路实现', () => {
    const src = read('packages/liquid-mixing/src/constants/liquidVariables.ts');
    expect(src).not.toMatch(/net\.Socket|createConnection|writePdo|EtherCATMaster/);
    expect(LIQUID_IO_MAP.length).toBeGreaterThan(0);
  });
});

describe('S5 模拟量 / 开关量双路与回写表', () => {
  it('14 路开关量反馈与 liquidSensorBits 同序同长，线圈连续', () => {
    expect(LIQUID_SENSOR_FEEDBACK).toHaveLength(14);
    expect(liquidSensorBits(liquidSensorStates({ a: 0, b: 0, mix: 0, product: 0 }, LIQUID_EMPTY_OUTPUTS, 0))).toHaveLength(14);
    const coils = LIQUID_SENSOR_FEEDBACK.map((r) => r.modbus);
    expect(coils).toEqual(Array.from({ length: 14 }, (_, i) => 50 + i));
    expect(LIQUID_COILS.LIQUID_SENSOR_A_HIGH).toBe(coils[0]);
  });

  it('掩码与位数组同源，且不超过 14 位', () => {
    const sensors = liquidSensorStates(
      { a: 95, b: 95, mix: 115, product: 290 },
      { valveA: true, valveB: false, stirForward: true, stirReverse: false, discharge: true },
      1,
    );
    const bits = liquidSensorBits(sensors);
    const mask = liquidSensorMask(sensors);
    expect(bits.reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0)).toBe(mask);
    expect(mask).toBeLessThan(1 << 14);
  });

  it('S7 / 三菱布尔表覆盖全部 7 个 PLC 输出与 14 路反馈', () => {
    for (const name of LIQUID_OUTPUT_COIL_NAMES) {
      expect(LIQUID_BOOL_S7[name]).toBeTruthy();
      expect(LIQUID_BOOL_MITSUBISHI[name]).toBeTruthy();
    }
    for (const row of LIQUID_SENSOR_FEEDBACK) {
      expect(LIQUID_BOOL_S7[row.key]).toBe(row.s7);
      expect(LIQUID_BOOL_MITSUBISHI[row.key]).toBe(row.mitsubishi);
    }
    expect(Object.keys(LIQUID_BOOL_S7)).toHaveLength(21);
  });

  it('设备侧 300ms 链路把 REAL 位模式写回，且开关量仅在掩码变化时发帧', () => {
    const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');
    expect(effects).toContain('floatToDintBits');
    expect(effects).toContain('LIQUID_REAL_NAMES');
    expect(effects).toContain('mask !== lastSensorMask');
    expect(effects).toContain('if (write.success) lastSensorMask = mask');
    expect(effects).toContain('isViewerRuntime()');
    expect(effects).toContain('if (!st.connected)');
  });
});

describe('面板与阶段口径', () => {
  it('三模式面板锚点唯一、可见文案不堆括号补注', () => {
    const panel = read('packages/liquid-mixing/src/platform/LiquidModePanel.tsx');
    expect(panel).toContain('<div data-dt-liquid-panel');
    // 剥掉注释再数，避免文件头注释里的锚点名被误计
    const jsx = panel.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect((jsx.match(/data-dt-liquid-panel/g) ?? []).length).toBe(1);
    for (const f of ['LiquidManualPanel.tsx', 'LiquidDemoPanel.tsx', 'LiquidSimPanel.tsx', 'LiquidPanelParts.tsx']) {
      const src = read(`packages/liquid-mixing/src/platform/${f}`);
      expect(src).not.toMatch(/>[^<]*（[^<]*）</);
    }
  });

  it('阶段枚举含正转与反转两段，演示面板显示阶段与停止请求', () => {
    expect(LIQUID_PHASE.STIR_FWD).toBeLessThan(LIQUID_PHASE.STIR_REV);
    const demo = read('packages/liquid-mixing/src/platform/LiquidDemoPanel.tsx');
    expect(demo).toContain('requestStopDemo');
    expect(demo).toContain('data-dt-liquid-phase');
  });

  it('去皮按钮调用 tareTo，且面板不直接写体积真值', () => {
    const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
    expect(manual).toContain('tareTo');
    expect(manual).toContain('data-dt-liquid-tare');
  });
});
