/**
 * 液体混装 S1~S5 静态自检：接线点、场景隔离、变量表单源、REAL 地址、回写表、模式边界。
 * 故意漏接任一项都要能被本文件发现（S1 门禁要求）。
 * src/ → 仓库根需要 ../../..，与项目其它包自检同口径。
 */
import { describe, expect, it } from 'vitest';
import { SCENE_DESCRIPTORS } from '../../platform/src/deviceCatalog';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIQUID_WORD_VARIABLES, LIQUID_REAL_NAMES, LIQUID_REPORT_WORD_NAMES,
  LIQUID_COMMAND_WORD_NAMES, LIQUID_SENSOR_FEEDBACK, LIQUID_BOOL_S7,
  LIQUID_BOOL_MITSUBISHI, LIQUID_OUTPUT_COIL_NAMES, LIQUID_LAMP_COIL_NAMES, LIQUID_OPERATOR_COIL_NAMES,
  liquidSelectorBits,
  LIQUID_ADDRESS_ROWS, LIQUID_COILS, liquidSensorBits, liquidSensorMask, LIQUID_IO_MAP,
  LIQUID_PANEL_HINT_SIGNALS, liquidAddressRowsFor, liquidSensorHintRow,
  type LiquidPanelHintKey,
} from './constants/liquidVariables';
import {
  liquidSensorStates, LIQUID_PHASE, LIQUID_VIEW_PRESETS,
  LIQUID_VISUAL, liquidValveStateColor, liquidLampStateColor,
  LIQUID_LEVEL_SWITCHES, LIQUID_LEVEL_SWITCH_ORDER,
  LIQUID_INITIAL_VOLUMES, LIQUID_INITIAL_COMPONENTS,
  LIQUID_RESET_VOLUMES, LIQUID_EMPTY_COMPONENTS,
  LIQUID_OPERATOR_BUTTONS, LIQUID_OPERATOR_SELECTOR,
} from './constants/liquidConstants';
import { LIQUID_REAL32_WORD_ORDER } from './constants/real32';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(here, '../../..'));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('S1 六处接线', () => {
  const wiring: [string, string][] = [
    ['packages/liquid-mixing/device.json', '"id": "liquid-mixing"'],
    ['packages/liquid-mixing/src/device.ts', 'liquidMixingDevice'],
    ['packages/platform/src/deviceCatalog.ts', 'import.meta.glob'],
    ['packages/platform/src/deviceMeta.ts', 'DEVICE_META'],
    ['packages/platform/src/registry.ts', 'src/device.ts'],
    ['packages/platform/vite.config.ts', 'sceneAliases'],
    ['packages/platform/tsconfig.app.json', '"@digital-twin/*"'],
    ['packages/platform/src/index.css', '@source'],
    ['packages/liquid-mixing/vite.config.ts', 'test:'],
  ];
  it.each(wiring)('%s 含 %s', (file, token) => {
    expect(read(file).includes(token)).toBe(true);
  });

  it('场景包由 device.json 自动发现，顺序由 order 决定', () => {
    const reg = read('packages/platform/src/registry.ts');
    expect(reg).toContain('import.meta.glob');
    expect(reg).toContain('SCENE_DESCRIPTORS');
    const desc = JSON.parse(read('packages/liquid-mixing/device.json'));
    expect(desc.id).toBe('liquid-mixing');
    expect(Number.isFinite(desc.order)).toBe(true);
    expect(SCENE_DESCRIPTORS.map((s) => s.id)).toContain('liquid-mixing');
    expect(read('packages/liquid-mixing/src/device.ts')).toContain('liquidMixingDevice');
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
    for (const pkg of SCENE_DESCRIPTORS.map((s) => s.pkg).filter((p) => p !== 'liquid-mixing')) {
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

  it('四路 REAL 在本场景内连续成对，且所有字变量互不占字', () => {
    // 地址只在本场景命名空间内有意义：只校验场景内自洽，
    // 禁止写「必须大于其它场景最大地址」这类跨场景避让判断（见地址分配规范 P1/P4）。
    const bases = LIQUID_REAL_NAMES.map((n) => LIQUID_WORD_VARIABLES[n].modbus.address);
    bases.forEach((b, i) => expect(b).toBe(bases[0] + i * 2));
    const occupied = new Set<number>();
    for (const [name, spec] of Object.entries(LIQUID_WORD_VARIABLES)) {
      for (let w = 0; w < spec.modbus.words; w += 1) {
        const addr = spec.modbus.address + w;
        expect(occupied.has(addr), `${name} 与场景内其它字变量占用 HR${addr}`).toBe(false);
        occupied.add(addr);
      }
    }
  });

  it('地址表 / 线圈表 / 三协议 BOOL 表同源，且本场景从 C0 起（P2）', () => {
    // 只锁场景内自洽：地址不与其他场景比较，也不做跨场景避让（规范 P1/P4）。
    expect(LIQUID_COILS.LIQUID_VALVE_A).toBe(0);
    LIQUID_OUTPUT_COIL_NAMES.forEach((name, i) => {
      expect(LIQUID_COILS[name], name).toBe(i);
      expect(LIQUID_BOOL_MITSUBISHI[name], name).toBe(`Y${i}`);
      expect(LIQUID_BOOL_S7[name], name).toBe(`M40.${i}`);
    });
    // 三色灯独立小簇：Modbus 紧接执行器占 C5~C7、三菱 Y5~Y7、S7 M40.5~M40.7
    LIQUID_LAMP_COIL_NAMES.forEach((name, i) => {
      expect(LIQUID_COILS[name], name).toBe(5 + i);
      expect(LIQUID_BOOL_S7[name], name).toBe(`M40.${5 + i}`);
    });
    expect(LIQUID_BOOL_MITSUBISHI.LIQUID_LAMP_GREEN).toBe('Y5');
    expect(LIQUID_BOOL_MITSUBISHI.LIQUID_LAMP_YELLOW).toBe('Y6');
    expect(LIQUID_BOOL_MITSUBISHI.LIQUID_LAMP_RED).toBe('Y7');
    // 操作站输入簇紧随三色灯占 C8~C14 / X0~X6 / M41.0~M41.6
    Object.values(LIQUID_OPERATOR_COIL_NAMES).forEach((name, i) => {
      expect(LIQUID_COILS[name], name).toBe(8 + i);
      expect(LIQUID_BOOL_S7[name], name).toBe(`M41.${i}`);
    });
    LIQUID_SENSOR_FEEDBACK.forEach((r, i) => {
      expect(LIQUID_COILS[r.key], r.key).toBe(r.modbus);
      expect(r.modbus, r.key).toBe(15 + i);
      expect(LIQUID_BOOL_S7[r.key], r.key).toBe(r.s7);
      expect(LIQUID_BOOL_MITSUBISHI[r.key], r.key).toBe(r.mitsubishi);
    });
    // 地址表面板列的每个线圈号都必须来自变量表，防「改了 COILS 忘了改字面量表」
    const coilNumbers = new Set<number>(Object.values(LIQUID_COILS));
    for (const row of LIQUID_ADDRESS_ROWS) {
      const re = /C(\d+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(row.modbus)) !== null) {
        expect(coilNumbers.has(Number(m[1])), `${row.signal} → C${m[1]}`).toBe(true);
      }
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
  it('8 路液位开关反馈与 liquidSensorBits 同序同长，线圈连续', () => {
    expect(LIQUID_SENSOR_FEEDBACK).toHaveLength(8);
    expect(liquidSensorBits(liquidSensorStates({ a: 0, b: 0, mix: 0, product: 0 }))).toHaveLength(8);
    const coils = LIQUID_SENSOR_FEEDBACK.map((r) => r.modbus);
    expect(coils).toEqual(Array.from({ length: 8 }, (_, i) => 15 + i));
    expect(LIQUID_COILS.LIQUID_SENSOR_A_LOW).toBe(coils[0]);
  });

  it('掩码与位数组同源，且不超过 8 位', () => {
    const sensors = liquidSensorStates({ a: 95, b: 95, mix: 115, product: 290 });
    const bits = liquidSensorBits(sensors);
    const mask = liquidSensorMask(sensors);
    expect(bits.reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0)).toBe(mask);
    expect(mask).toBeLessThan(1 << 8);
  });

  it('S7 / 三菱布尔表覆盖 5 执行器 + 3 三色灯 + 7 操作站输入 + 8 路反馈', () => {
    for (const name of LIQUID_OUTPUT_COIL_NAMES) {
      expect(LIQUID_BOOL_S7[name]).toBeTruthy();
      expect(LIQUID_BOOL_MITSUBISHI[name]).toBeTruthy();
    }
    for (const name of LIQUID_LAMP_COIL_NAMES) {
      expect(LIQUID_BOOL_S7[name]).toBeTruthy();
      expect(LIQUID_BOOL_MITSUBISHI[name]).toBeTruthy();
    }
    for (const row of LIQUID_SENSOR_FEEDBACK) {
      expect(LIQUID_BOOL_S7[row.key]).toBe(row.s7);
      expect(LIQUID_BOOL_MITSUBISHI[row.key]).toBe(row.mitsubishi);
    }
    expect(Object.keys(LIQUID_BOOL_S7)).toHaveLength(23);
  });

  it('设备侧 300ms 链路把 REAL 位模式写回，且开关量仅在掩码变化时发帧', () => {
    const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');
    expect(effects).toContain('floatToDintBits');
    expect(effects).toContain('LIQUID_REAL_NAMES');
    expect(effects).toContain('mask !== lastSensorMask');
    expect(effects).toContain('if (write.success) lastSensorMask = mask');
    expect(effects).toContain('isViewerRuntime()');
    expect(effects).toContain('if (!st.connected)');
    // 读失败整轮跳过（不得用 0 兜底清配方 / 重置动作字边沿）+ 轮询不重入
    expect(effects).toContain('if (!words.success || !words.values) return');
    expect(effects).not.toContain('words.values ? words.values : {}');
    expect(effects).toContain('if (busy || stopped) return');
  });
});

/**
 * 面板内容契约第二块（11-15 用户拍板）：
 * 删「状态读数 / 配方设定 / 去皮设定」，「开关量状态」改成「传感器信号」并改变组合，
 * 场景与面板新增三色灯塔，三协议分配地址并逐灯显示。
 */
describe('传感器信号组合与三色灯塔', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const scene = read('packages/liquid-mixing/src/scenes/LiquidSceneContent.tsx');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');

  it('液位开关组成：A / B 各 1 路下限、混合罐四档、成品罐上下限，共 8 路', () => {
    expect(LIQUID_LEVEL_SWITCH_ORDER).toHaveLength(8);
    expect(LIQUID_LEVEL_SWITCHES.a.map((s) => s.key)).toEqual(['aLow']);
    expect(LIQUID_LEVEL_SWITCHES.b.map((s) => s.key)).toEqual(['bLow']);
    expect(LIQUID_LEVEL_SWITCHES.mix.map((s) => s.key))
      .toEqual(['mixLow', 'mixMid', 'mixHigh', 'mixOver']);
    expect(LIQUID_LEVEL_SWITCHES.product.map((s) => s.key))
      .toEqual(['productLow', 'productHigh']);
    // 四档阈值自下而上递增，只有下限是「低于等于」，其余三档都是「高于等于」
    expect(LIQUID_LEVEL_SWITCHES.mix.map((s) => s.ratio)).toEqual([0.1, 0.35, 0.65, 0.9]);
    expect(LIQUID_LEVEL_SWITCHES.mix.map((s) => s.mode)).toEqual(['low', 'high', 'high', 'high']);
    // 原料罐不再有上限：字段本身就是只保留下限
    const empty = liquidSensorStates({ a: 0, b: 0, mix: 0, product: 0 });
    expect(Object.keys(empty).some((k) => k === 'aHigh' || k === 'bHigh')).toBe(false);
  });

  it('回写表 8 路与液位开关表逐路同名同序，搅拌与阀位不再出现', () => {
    LIQUID_LEVEL_SWITCH_ORDER.forEach((sw, i) => {
      expect(LIQUID_SENSOR_FEEDBACK[i].sensor, sw.key).toBe(sw.key);
      expect(LIQUID_SENSOR_FEEDBACK[i].signal, sw.key).toBe(sw.label);
    });
    expect(LIQUID_SENSOR_FEEDBACK).toHaveLength(8);
    expect(LIQUID_SENSOR_FEEDBACK.map((r) => r.sensor)).toEqual([
      'aLow', 'bLow', 'mixLow', 'mixMid', 'mixHigh', 'mixOver', 'productLow', 'productHigh',
    ]);
  });

  it('「状态读数」「配方设定」「去皮设定」三个区块已从面板删除，保留回补原液与全部复位', () => {
    expect(panel).not.toContain('LiquidStatusPanel');
    expect(panel).not.toContain('LiquidRecipeEditor');
    expect(panel).not.toContain('inputStyle');
    for (const src of [panel, manual]) {
      expect(src).not.toContain('状态读数');
      expect(src).not.toContain('配方设定');
      expect(src).not.toContain('去皮设定');
    }
    expect(manual).toContain('回补原液');
    expect(manual).toContain('全部复位');
    // 配方真值与 PLC 配方字仍在：删的只是面板输入控件
    expect(constants).toContain('LIQUID_DEFAULT_RECIPE');
    expect(Object.keys(LIQUID_WORD_VARIABLES)).toContain('LIQUID_RECIPE_A');
  });

  it('传感器信号取 PLC 回写顺序，标题挂开关量掩码地址', () => {
    expect(panel).toContain('export function LiquidSensorPanel');
    expect(panel).toContain('传感器信号');
    expect(panel).toContain('LIQUID_SENSOR_FEEDBACK.map((r, i)');
    expect(panel).toContain('hintKey="sensorMask"');
  });

  it('三色灯三协议地址与线圈表同源，并进地址表与 300ms 读回', () => {
    expect(LIQUID_COILS.LIQUID_LAMP_GREEN).toBe(5);
    expect(LIQUID_COILS.LIQUID_LAMP_YELLOW).toBe(6);
    expect(LIQUID_COILS.LIQUID_LAMP_RED).toBe(7);
    for (const signal of ['三色灯 绿', '三色灯 黄', '三色灯 红']) {
      const row = LIQUID_ADDRESS_ROWS.find((r) => r.signal === signal);
      expect(row, signal).toBeDefined();
      expect(row?.modbus).toMatch(/^C[567]$/);
      expect(row?.s7).toMatch(/^M40\.[567]$/);
    }
    expect(LIQUID_LAMP_COIL_NAMES).toHaveLength(3);
    expect(effects).toContain('LIQUID_LAMP_COIL_NAMES');
    expect(effects).toContain('LIQUID_LAMP_GREEN');
    expect(effects).toContain('LAMP_COIL_OFFSET');
  });

  it('3D 灯塔与面板按钮共用同一份灯色，材质成组单例不改共享材质', () => {
    expect(constants).toContain('export const LIQUID_LAMP_COLOR');
    expect(constants).toContain('export function liquidLampStateColor');
    expect(liquidLampStateColor('green', true)).toBe(LIQUID_VISUAL.LAMP_GREEN);
    expect(liquidLampStateColor('yellow', true)).toBe(LIQUID_VISUAL.LAMP_YELLOW);
    expect(liquidLampStateColor('red', true)).toBe(LIQUID_VISUAL.LAMP_RED);
    expect(liquidLampStateColor('red', false)).toBe(LIQUID_VISUAL.LAMP_DARK);
    expect(materials).toContain('lampGreen: lampMat(LIQUID_LAMP_COLOR.green)');
    expect(materials).toContain('lampYellow: lampMat(LIQUID_LAMP_COLOR.yellow)');
    expect(materials).toContain('lampRed: lampMat(LIQUID_LAMP_COLOR.red)');
    expect(parts).toContain('export function TowerLamp');
    expect(parts).toContain('LAMP_ORDER');
    expect(manual).toContain('liquidLampStateColor(t.key, on)');
    expect(manual).toContain('data-dt-liquid-lamp={t.key}');
    expect(scene).toContain('<TowerLamp />');
    // 灯塔落点由四罐包围盒与柜体派生，不写裸坐标；灯罩颜色不逐帧改共享材质
    expect(scene).toContain('const LAMP_X = TANK_X_MAX +');
    expect(scene).toContain('const LAMP_Z = CABINET_Z +');
    expect(parts).not.toContain('LM.lampGreen.color.set');
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
    const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
    expect(demo).toContain('stopRequested');
    expect(demo).toContain('data-dt-liquid-phase');
    // 急停不再由演示面板自己实现：统一挂在操作站上，按下即真正置 estop 并切断输出
    expect(demo).toContain('<LiquidOperatorPanel />');
    expect(store).toContain("case 'estop':");
    expect(demo).not.toContain('stopDemo()');
  });

  it('去皮设定按用户要求从面板移除，但真值层仍保留零位移偏置 API', () => {
    const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
    const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
    const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
    // 面板不再出现去皮输入与「设 0.0 点」，避免与「只改偏置不改真值」的语义混淆
    expect(manual).not.toContain('tareTo');
    expect(manual).not.toContain('data-dt-liquid-tare');
    // 真值层语义不动：tareTo 只写偏置，liquidDisplay 才做减法
    expect(store).toContain('tareTo: (tank, display = 0)');
    expect(constants).toContain('export function liquidDisplay');
  });
});

describe('搅拌可视化四层：桨叶 / 涡流 / 均匀度 / 转向与机位', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const switcher = read('packages/liquid-mixing/src/platform/LiquidViewSwitcher.tsx');

  it('① 桨叶可见：混合罐液柱半透明、非对称锚式框桨与示踪色，液面盘仍不透明', () => {
    expect(materials).toContain('translucentLiquidMat');
    expect(materials).toContain('depthWrite: false');
    expect(materials).toContain('bladeMark');
    expect(parts).toContain('frameR');
    expect(parts).toContain('LM.bladeMark');
    expect(parts).toContain('liquidMixUpper');
  });

  it('② 液体被搅动：Lathe 涡流碗面 + 旋流弧线贴碗面 + 两段分层色带随均匀度收敛', () => {
    expect(parts).toContain('latheGeometry');
    expect(parts).toContain('SWIRL_RADII');
    expect(parts).toContain('surfaceY - depth * (1 - t) ** 2');
    expect(parts).toContain('liquidMixBandColors');
    expect(parts).toContain('liquidSwirlStrength');
    expect(parts).toContain('LM.swirl');
    // 碗沿与液柱顶错开 CAP_GAP，不把涡流面抬到液面上方
    expect(parts).toContain('surfaceY = top + CAP_GAP;');
  });

  it('② 分层带随搅拌缩短到零：液柱连续、搅匀后不再有「两层」横线', () => {
    expect(parts).toContain('liquidMixStratification');
    expect(parts).toContain('const upperH = h * 0.5 * strat;');
    expect(parts).toContain('upper.visible = upperH > GAP * 0.5;');
    // 两段都只有侧面、首尾精确相接，绝不再留中间 GAP 缝隙
    expect(parts).toContain('1, 32, 1, isMix');
    expect(parts).toContain('1, 32, 1, true');
    expect(parts).not.toContain('h / 2 - GAP / 2');
    expect(constants).toContain('liquidBlendColor');
  });

  it('搅匀后颜色保持饱和且浓度恒定，不会「变透明」', () => {
    expect(parts).not.toContain('opacity = 0.48');
    expect(parts).not.toContain('LM.liquidMix.opacity');
    expect(materials).toContain('opacity: 0.66');
    expect(materials).toContain('浓度恒定');
  });

  it('③ 搅拌有结果：均匀度常量与纯函数单一来源，进 store / 快照 / 3D 分层带', () => {
    expect(constants).toContain('UNIFORMITY_RATE');
    expect(constants).toContain('clampUniformity');
    expect(constants).toContain('liquidStratification');
    expect(store).toContain('mixUniformity:');
    expect(store).toContain('LIQUID_UNIFORMITY');
    expect(store).toContain('UNIFORMITY_RATE * dt');
    // 用户已删除「状态读数」区块：面板不再有均匀度进度条，但 3D 分层色带仍按它收敛
    expect(panel).not.toContain('data-dt-liquid-uniformity');
    expect(parts).toContain('liquidMixStratification');
  });

  it('④ 方向与机位：罐顶转向环 + 六机位含「搅拌观察」，切换器自动遍历预设', () => {
    expect(materials).toContain('direction:');
    expect(parts).toContain('LM.direction');
    expect(Object.keys(LIQUID_VIEW_PRESETS)).toHaveLength(6);
    expect(LIQUID_VIEW_PRESETS.stir.label).toBe('搅拌观察');
    expect(switcher).toContain('Object.keys(LIQUID_VIEW_PRESETS)');
  });

  it('混合均匀度是纯本地教学量：不进 PLC 变量表 / 地址表 / 300ms 链路', () => {
    const vars = read('packages/liquid-mixing/src/constants/liquidVariables.ts');
    const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');
    const connection = read('packages/liquid-mixing/src/platform/LiquidPlcConnection.tsx');
    expect(vars).not.toMatch(/UNIFORMITY|uniformity/);
    expect(effects).not.toMatch(/UNIFORMITY|uniformity/);
    expect(connection).not.toMatch(/UNIFORMITY|uniformity/);
    expect(Object.keys(LIQUID_WORD_VARIABLES).some((k) => /UNIFORM/i.test(k))).toBe(false);
    for (const row of LIQUID_ADDRESS_ROWS) {
      expect(row.signal).not.toMatch(/均匀度|UNIFORM/i);
    }
    // 本轮按用户要求加了 3 行三色灯、把 8 路液位开关拆成 3 行（净 +5），此后行数应锁死
    expect(LIQUID_ADDRESS_ROWS.length).toBe(31);
  });

  it('均匀度在 exportSnapshot / applyBroadcast 成对出现，观众端同源可见', () => {
    expect((store.match(/LIQUID_UNIFORMITY/g) ?? []).length).toBe(2);
    expect(store).toContain('clampUniformity(uniformity)');
  });
});

describe('成品罐颜色与混合后的液体同源', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const vars = read('packages/liquid-mixing/src/constants/liquidVariables.ts');
  const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');

  it('取消成品罐独立绿色，颜色由与混合色相同的纯函数派生', () => {
    expect(constants).toContain('liquidProductColor');
    expect(constants).toContain('return liquidBlendColor(productA, productB);');
    expect(constants).toContain('if (a + b <= 0) return LIQUID_VISUAL.LIQUID_MIX;');
    expect(constants).not.toContain("LIQUID_PRODUCT: '#10b981'");
    expect(constants).toMatch(/product: \{[^}]*color: LIQUID_VISUAL\.LIQUID_MIX \}/);
    expect(materials).toContain('liquidProduct: liquidMat(LIQUID_TANKS.product.color)');
  });

  it('3D 液柱 / 液面 / 面板读数条三处同源，且有颜色诊断锚点', () => {
    expect(parts).toContain("tank === 'product'");
    expect(parts).toContain('LM.liquidProduct.color.set(c)');
    expect(parts).toContain('LM.surfaceProduct.color.set(c)');
    expect(panel).toContain('liquidProductColor(productA, productB)');
    expect(panel).toContain("if (tank === 'mix') return liquidBlendColor(mixA, mixB);");
    expect(panel).toContain('data-dt-liquid-color');
    expect(panel).toContain('background: tankColor(tank)');
  });

  it('组分随出料转移，只进本地快照 / 观众镜像，不上 PLC 地址表', () => {
    expect(store).toContain('productA += d * fA;');
    expect(store).toContain('productB += d * fB;');
    expect(store).toContain('LIQUID_PRODUCT_A');
    expect(store).toContain("num('LIQUID_PRODUCT_A')");
    expect(vars).not.toMatch(/PRODUCT_A|PRODUCT_B/);
    expect(effects).not.toMatch(/PRODUCT_A|PRODUCT_B|productColor/);
    // LIQUID_LEVEL_PRODUCT 是既有 REAL 液位字，与颜色无关；这里只排除颜色 / 组分新键
    expect(Object.keys(LIQUID_WORD_VARIABLES).some((k) => /PRODUCT_A|PRODUCT_B|COLOR/i.test(k))).toBe(false);
    expect(LIQUID_ADDRESS_ROWS.length).toBe(31);
  });
});

describe('阀门开关状态色：3D / 面板 / 展台同源', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const scene = read('packages/liquid-mixing/src/scenes/LiquidSceneContent.tsx');
  const vars = read('packages/liquid-mixing/src/constants/liquidVariables.ts');
  const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');

  it('状态色只有一处定义，直接复用共享工业灯色令牌', () => {
    expect(constants).toContain('export const LIQUID_VALVE_STATE');
    expect(constants).toContain('open: LIQUID_VISUAL.LAMP_GREEN');
    expect(constants).toContain('closed: LIQUID_VISUAL.LAMP_RED');
    expect(liquidValveStateColor(true)).toBe(LIQUID_VISUAL.LAMP_GREEN);
    expect(liquidValveStateColor(false)).toBe(LIQUID_VISUAL.LAMP_RED);
    expect(liquidValveStateColor(true)).not.toBe(liquidValveStateColor(false));
  });

  it('3D 按 open 二选一成组单例材质，不改写共享的管路 / 泵材质', () => {
    expect(materials).toContain('valveOpen: new THREE.MeshStandardMaterial');
    expect(materials).toContain('valveClosed: new THREE.MeshStandardMaterial');
    expect(materials).toContain('valveLampOpen:');
    expect(materials).toContain('valveLampClosed:');
    // 旧「恒红手柄」材质必须删掉，否则开阀仍是红的
    expect(materials).not.toContain('handle: new THREE.MeshStandardMaterial');
    // 阀体恒金属银灰，状态色只落在指示件：此前整阀染色，展台看是「一坨红塑料」
    expect(parts).toContain('const indicator = open ? LM.valveOpen : LM.valveClosed;');
    expect(parts).toContain('const lamp = open ? LM.valveLampOpen : LM.valveLampClosed;');
    expect(parts).toContain('<mesh material={LM.valve} castShadow>');
    expect(parts).not.toContain('material={body}');
    expect(parts).toContain('阀位指示片');
    // 工业结构件：两端法兰 / 法兰螺栓 / 阀杆压盖 / 罐顶封盖 / 管卡支架
    expect(parts).toContain('VALVE_FLANGE_X');
    expect(parts).toContain('VALVE_BOLTS');
    expect(parts).toContain('ringGeometry');
    expect(parts).toContain('supports');
    expect(parts).not.toContain('LM.pipe.color.set');
    expect(parts).not.toContain('LM.valve.color.set');
    // 机械语义保留：开平行于管轴、关旋转 90°
    expect(parts).toContain('rotation={[0, open ? 0 : Math.PI / 2, 0]}');
    // 状态环与球面错开 ≥ GAP，避免共面闪烁
    expect(parts).toContain('torusGeometry args={[VALVE_R + GAP * 4, GAP * 2.4, 8, 28]}');
  });

  it('执行器按钮与阀门状态色隐藏锚点都跟 3D 用同一个纯函数', () => {
    expect(manual).toContain('liquidValveStateColor(on)');
    expect(manual).toContain('valveKeys.includes(t.key)');
    expect(manual).toContain('data-dt-liquid-valve');
    expect(manual).toContain('liquidValveStateColor(outputs.valveA)');
    expect(manual).toContain('liquidValveStateColor(outputs.valveB)');
    expect(manual).toContain('liquidValveStateColor(outputs.discharge)');
  });

  it('部件展台阀门跟随 A 阀真值，不再恒开', () => {
    expect(scene).toContain('renderBarePart(kind, valveOpen)');
    expect(scene).toContain('<BallValve open={valveOpen} />');
    expect(scene).not.toContain('<BallValve open />');
  });

  it('状态色是纯本地派生量，PLC 变量表 / 地址表 / 回写链路零改动', () => {
    expect(LIQUID_ADDRESS_ROWS.length).toBe(31);
    expect(vars).not.toMatch(/VALVE_STATE|VALVE_COLOR/i);
    expect(effects).not.toMatch(/valveStateColor|LIQUID_VALVE_STATE/);
    expect(Object.keys(LIQUID_WORD_VARIABLES).some((k) => /VALVE_STATE|COLOR/i.test(k))).toBe(false);
  });
});

describe('面板变量地址浮框（参考自动配药 AddressHint）', () => {
  const vars = read('packages/liquid-mixing/src/constants/liquidVariables.ts');
  const hint = read('packages/liquid-mixing/src/platform/LiquidAddressHint.tsx');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const demo = read('packages/liquid-mixing/src/platform/LiquidDemoPanel.tsx');
  const sim = read('packages/liquid-mixing/src/platform/LiquidSimPanel.tsx');

  it('每个面板语义键都在仿真地址表里有对应 signal，地址零回填', () => {
    const signals = new Set(LIQUID_ADDRESS_ROWS.map((r) => r.signal));
    for (const [key, list] of Object.entries(LIQUID_PANEL_HINT_SIGNALS)) {
      expect(list.length, `${key} 至少一行`).toBeGreaterThan(0);
      for (const s of list) expect(signals.has(s), `${key} → ${s}`).toBe(true);
    }
    expect(vars).toContain('LIQUID_ADDRESS_ROWS.find((r) => r.signal === signal)');
    // 组件与面板 JSX 里都不许出现 C0 / HR0 / M40.0 这类地址字面量
    expect(hint).not.toMatch(/'[CHM DXY][0-9]{1,3}[·.]?[0-9]*'/);
    for (const src of [panel, manual, demo, sim]) {
      expect(src).not.toMatch(/hintKey="[A-Z]{1,2}[0-9]{2,3}/);
    }
  });

  it('浮框行三协议地址与仿真地址表逐字段一致', () => {
    for (const key of Object.keys(LIQUID_PANEL_HINT_SIGNALS) as LiquidPanelHintKey[]) {
      for (const row of liquidAddressRowsFor(key)) {
        const src = LIQUID_ADDRESS_ROWS.find((r) => r.signal === row.label);
        expect(src, `${key} → ${row.label}`).toBeDefined();
        expect(row.mitsubishi).toBe(src?.mitsubishi);
        expect(row.modbus).toBe(src?.modbus);
        expect(row.s7).toBe(src?.s7);
      }
    }
    // 三色灯三个灯罩各占一行，顺序恒 绿 → 黄 → 红，地址逐灯各自给出
    expect(liquidAddressRowsFor('lampGreen').map((r) => r.modbus)).toEqual(['C5']);
    expect(liquidAddressRowsFor('lampYellow').map((r) => r.modbus)).toEqual(['C6']);
    expect(liquidAddressRowsFor('lampRed').map((r) => r.modbus)).toEqual(['C7']);
  });

  it('8 路液位开关逐路地址与回写表同源', () => {
    for (const r of LIQUID_SENSOR_FEEDBACK) {
      const [row] = liquidSensorHintRow(r.key);
      expect(row.label).toBe(r.signal);
      expect(row.modbus).toBe(`C${r.modbus}`);
      expect(row.mitsubishi).toBe(r.mitsubishi);
      expect(row.s7).toBe(r.s7);
    }
  });

  it('浮框用 portal 挂 body，表头恒三协议，锚点与配药一致', () => {
    expect(hint).toContain('createPortal');
    expect(hint).toContain('document.body');
    expect(hint).toContain('data-io-hint-trigger');
    expect(hint).toContain('data-io-hint-head');
    expect(hint).toContain('data-io-hint-row');
    expect(hint).toContain('>三菱 FX</span>');
    expect(hint).toContain('>Modbus TCP</span>');
    expect(hint).toContain('>Siemens S7</span>');
    expect(hint).toContain('data-addr="mitsubishi"');
    expect(hint).toContain('data-addr="modbus"');
    expect(hint).toContain('data-addr="s7"');
    expect(hint).toContain('data-hint-key={hintKey}');
  });

  it('三模式面板都挂了浮框，且每个语义键都被真实使用', () => {
    const all = panel + manual + demo + sim;
    for (const src of [panel, manual, demo, sim]) expect(src).toContain('LiquidHint');
    expect(panel).toContain('LiquidSensorHint');
    // 演示面板的传感器逐路浮框随「正转 / 反转」读数一起移除，操作站改为共享组件
    expect(demo).toContain('<LiquidOperatorPanel />');
    for (const key of Object.keys(LIQUID_PANEL_HINT_SIGNALS)) {
      // 静态写法 hintKey="xxx"，或经 LEVEL_HINT / EXECUTOR_HINT 映射表引用 'xxx'
      const used = all.includes(`hintKey="${key}"`) || all.includes(`'${key}'`);
      expect(used, `语义键 ${key} 未被任何面板使用`).toBe(true);
    }
    expect(LIQUID_ADDRESS_ROWS.length).toBe(31);
  });

  it('纯本地教学量与本地演示主令严禁标地址', () => {
    const keys = Object.keys(LIQUID_PANEL_HINT_SIGNALS);
    // 操作站键名形如 opEstop / opStart，属于真实 PLC 输入点；裸 estop / alarm 这种本地量才禁标
    expect(keys.some((k) => /^(estop|alarm|demo|uniform)$/i.test(k))).toBe(false);
    expect(keys.some((k) => /uniform|productA|productB|color/i.test(k))).toBe(false);
    // 均匀度是纯本地教学量，不在 PLC 链路上；演示启动 / 停止是本地状态机主令
    expect(panel).not.toMatch(/LiquidHint[^>]*>[^<]*混合均匀度/);
    expect(demo).not.toMatch(/LiquidHint[^>]*>[^<]*(启动|停止本轮后|暂停|紧急停)/);
  });
});

/** 精修红线：工业结构件、教学首屏展示态、面板可读性，防止后续改回「量筒 + 红球 + 截断面板」 */
describe('精修：工业结构件 / 教学首屏展示态 / 面板可读性', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const scene = read('packages/liquid-mixing/src/scenes/LiquidSceneContent.tsx');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const mode = read('packages/liquid-mixing/src/platform/LiquidModePanel.tsx');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const demo = read('packages/liquid-mixing/src/platform/LiquidDemoPanel.tsx');
  const sim = read('packages/liquid-mixing/src/platform/LiquidSimPanel.tsx');
  const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
  const index = read('packages/liquid-mixing/src/index.ts');

  it('四罐首屏都有液体，组分与体积同源，均匀度是 0..1 的过渡态', () => {
    expect(Object.values(LIQUID_INITIAL_VOLUMES).every((v) => v > 0)).toBe(true);
    expect(LIQUID_INITIAL_COMPONENTS.mixA + LIQUID_INITIAL_COMPONENTS.mixB)
      .toBe(LIQUID_INITIAL_VOLUMES.mix);
    expect(LIQUID_INITIAL_COMPONENTS.productA + LIQUID_INITIAL_COMPONENTS.productB)
      .toBe(LIQUID_INITIAL_VOLUMES.product);
    expect(LIQUID_INITIAL_COMPONENTS.mixUniformity).toBeGreaterThan(0);
    expect(LIQUID_INITIAL_COMPONENTS.mixUniformity).toBeLessThan(1);
  });

  it('首屏展示态只用于初始化，三处复位统一走工艺复位态', () => {
    // 首次进入场景：展示态（四罐有液体）只出现一次
    expect(store).toContain('const initialComponents = () => ({ ...LIQUID_INITIAL_COMPONENTS });');
    expect((store.match(/\.\.\.initialComponents\(\)/g) ?? []).length).toBe(1);
    // 全部复位 / 动作字 RESET / 复位按钮：统一走 processResetPatch 一份补丁，不再各写一遍
    expect(store).toContain('const resetVolumes = (): Volumes => ({ ...LIQUID_RESET_VOLUMES });');
    expect(store).toContain('const emptyComponents = () => ({ ...LIQUID_EMPTY_COMPONENTS });');
    expect((store.match(/function processResetPatch\(\): Partial<LiquidStore>/g) ?? []).length).toBe(1);
    expect((store.match(/Object\.assign\(patch, processResetPatch\(\)\)/g) ?? []).length).toBe(2);
    expect((store.match(/const volumes = resetVolumes\(\);/g) ?? []).length).toBe(1);
    expect(store).toContain('sensors: liquidSensorStates(volumes),');
    expect(LIQUID_RESET_VOLUMES.a).toBe(LIQUID_INITIAL_VOLUMES.a);
    expect(LIQUID_RESET_VOLUMES.b).toBe(LIQUID_INITIAL_VOLUMES.b);
    expect(LIQUID_RESET_VOLUMES.mix).toBe(0);
    expect(LIQUID_RESET_VOLUMES.product).toBe(0);
    expect(Object.values(LIQUID_EMPTY_COMPONENTS).every((v) => v === 0)).toBe(true);
  });

  it('退出工作区只清运行时状态，不把复位后的空罐填回展示态', () => {
    // 只检查 onCleanup 块：进入仿真的 onModeChange 合法调用了一次 resetAll()
    const cleanup = index.slice(index.indexOf('onCleanup:'), index.indexOf('/** 观众只读镜像'));
    expect(cleanup).toContain('resetRuntime()');
    expect(cleanup).not.toContain('resetAll()');
    expect(store).toContain('resetRuntime: () => set({');
    // 退出工作区连 operator 姿态也回静止态，不把按下中的按钮带到下一节课
    expect(store).toContain('operator: emptyOperator(),');
    expect(store).not.toContain('resetRuntime: () => set(processResetPatch');
  });

  it('展示初值仍是纯本地教学量，不进 PLC 变量表与地址表', () => {
    expect(LIQUID_ADDRESS_ROWS.length).toBe(31);
    expect(Object.keys(LIQUID_WORD_VARIABLES).some((k) => /UNIFORM|MIX_A|PRODUCT_A/i.test(k))).toBe(false);
    expect(constants).toContain('不进 PLC 地址表');
  });

  it('罐顶封盖 / 人孔 / 支腿底脚全部由几何常量派生', () => {
    for (const k of ['LID_INNER_RATIO', 'LID_BOLTS', 'MANHOLE_LID_H', 'MANHOLE_HANDLE_R',
      'LEG_R', 'FOOT_R', 'FOOT_H']) expect(parts).toContain(k);
    expect(parts).toContain('ringGeometry args={[r * LID_INNER_RATIO');
    expect(materials).toContain('lid: new THREE.MeshStandardMaterial');
    expect(materials).toContain("'lid'");
    expect(materials).toContain("'pipeClamp'");
  });

  it('球阀阀体恒金属色，状态色只落在四处指示件', () => {
    expect(parts).toContain('<mesh material={LM.valve} castShadow>');
    for (const k of ['VALVE_FLANGE_X', 'VALVE_BOLTS', 'VALVE_STEM_H', '阀位指示片']) {
      expect(parts).toContain(k);
    }
    expect(parts).not.toContain('material={body}');
    expect(parts).not.toContain('LM.valve.color.set');
  });

  it('整机三路与部件展台都启用管卡 / 法兰环 / 立管支架', () => {
    expect((scene.match(/<PipeRun points=\{PIPE_[A-Z]+\} supports \/>/g) ?? []).length).toBe(3);
    expect(scene).toContain('<PipeRun points={STAGE_PIPE} supports />');
    // 支架高度只能由竖段长度派生；依赖机架台面绝对 Y 会让展台支架被整体过滤掉
    expect(parts).toContain('s.vertical && s.len > PIPE_R * 6');
    expect(parts).toContain('const postH = s.len * 0.7;');
    expect(parts).not.toContain('platformTop');
  });

  it('面板关键读数上移、自身可滚动、地址表默认折叠', () => {
    expect(mode).toContain("maxHeight: 'calc(100vh - 96px)'");
    expect(mode).toContain("overflowY: 'auto'");
    expect(panel).toContain('useState(false)');
    for (const src of [manual, demo, sim]) {
      const readouts = src.indexOf('<LiquidLevelReadout />');
      const recipe = src.indexOf('<LiquidRecipeEditor />');
      const table = src.indexOf('<LiquidVariableTable />');
      expect(readouts).toBeGreaterThan(-1);
      if (recipe > -1) expect(readouts).toBeLessThan(recipe);
      if (table > -1) expect(readouts).toBeLessThan(table);
    }
  });
});

/** 用户反馈：进入仿真界面应清空后两个罐，方便学生从空罐开始做实验 */
describe('模式切换：进入仿真从空罐开始实验', () => {
  const index = read('packages/liquid-mixing/src/index.ts');
  const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');

  it('onModeChange 带新模式参数，只在 sim 且非观众端时复位工艺真值', () => {
    expect(index).toContain('function onModeChange(mode: Mode)');
    expect(index).toContain('  onModeChange,');
    expect(index).toContain("if (mode === 'sim' && !isViewerRuntime())");
    expect(index).toContain('useLiquidStore.getState().resetAll()');
    expect(index).not.toContain('onModeChange: stopAndDisconnect');
    // 手动 / 演示之间切换只停演示断连接，不碰四罐真值
    expect(index).toContain('function stopAndDisconnect()');
    expect((index.match(/resetAll\(\)/g) ?? []).length).toBe(1);
  });

  it('复位目标仍是「只留原料罐」，与面板 / PLC RESET 同源', () => {
    expect(LIQUID_RESET_VOLUMES.mix).toBe(0);
    expect(LIQUID_RESET_VOLUMES.product).toBe(0);
    expect(LIQUID_RESET_VOLUMES.a).toBe(LIQUID_INITIAL_VOLUMES.a);
    expect(LIQUID_RESET_VOLUMES.b).toBe(LIQUID_INITIAL_VOLUMES.b);
    expect(store).toContain('const volumes = resetVolumes();');
    expect(store).toContain('sensors: liquidSensorStates(volumes),');
  });
});

/**
 * 面板内容契约第一块（11-15 用户拍板：全场景统一、先内容后格式、逐块连内容带样式一起改）。
 * 执行器按信号类型分簇：三个阀门一排、搅拌正反转一排；形状归平台壳共享类，
 * 状态色仍由各场景与 3D 同源的纯函数注入，绝不抹平成通用 UI 语义色。
 */
describe('面板执行器分簇与全场景统一基线', () => {
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const css = read('packages/platform/src/index.css');

  it('执行器 3+2 两排，顺序恒为 A 阀 / B 阀 / 出料阀 → 搅拌正 / 搅拌反', () => {
    expect(manual).toContain('const EXECUTOR_ROWS');
    expect(manual).toContain('gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`');
    const rows = manual.slice(manual.indexOf('const EXECUTOR_ROWS'), manual.indexOf('const LAMP_ROWS'));
    expect((rows.match(/key: '/g) ?? []).length).toBe(5);
    const keys = ['valveA', 'valveB', 'discharge', 'stirForward', 'stirReverse'];
    let last = -1;
    for (const k of keys) {
      const at = rows.indexOf(`key: '${k}'`);
      expect(at, `${k} 必须在分簇里`).toBeGreaterThan(last);
      last = at;
    }
    // 短标签放按钮，完整信号名放地址浮框标题（窄栏只放得下 3~4 字）
    for (const s of ["label: '搅拌正'", "label: '搅拌反'", "title: '搅拌正转'",
      "title: '搅拌反转'", "title: 'A 进料阀 / 泵'"]) expect(rows).toContain(s);
    // 三色灯独立成簇：绿 → 黄 → 红，与线圈表 / 3D 灯塔同序
    const lampRows = manual.slice(manual.indexOf('const LAMP_ROWS'), manual.indexOf('/** 三个阀门用'));
    expect((lampRows.match(/key: '/g) ?? []).length).toBe(3);
    expect(lampRows.indexOf("key: 'green'")).toBeLessThan(lampRows.indexOf("key: 'yellow'"));
    expect(lampRows.indexOf("key: 'yellow'")).toBeLessThan(lampRows.indexOf("key: 'red'"));
  });

  it('按钮形状统一到平台壳共享类，状态色仍与 3D 同源', () => {
    expect(manual).toContain('className="btn btn-xs dt-executor touch-manipulation"');
    expect(manual).toContain('className="section-title"');
    expect(manual).toContain('badge-green');
    expect(manual).toContain('className="dt-state-led"');
    expect(manual).toContain('liquidValveStateColor(on)');
    expect(manual).toContain('valveKeys.includes(t.key)');
    expect(manual).toContain("'--dt-state-color': color");
    expect(manual).toContain('underline={false}');
    // 状态不再靠按钮里的 ON/OFF 文字，改由可读取的属性承载
    expect(manual).toContain('data-dt-liquid-executor={t.key}');
    expect(manual).toContain("data-on={on ? '1' : '0'}");
    expect(manual).toContain('aria-pressed={on}');
    expect(manual).not.toContain("{on ? 'ON' : 'OFF'}");
  });

  it('共享样式在平台壳单一来源，紧凑尺寸与配色不回退', () => {
    expect(css).toContain('.device-card--compact');
    expect(css).toContain('.dt-executor[data-on="1"]');
    expect(css).toContain('var(--dt-state-color');
    expect(css).toContain('padding: 6px 9px;');
    // 新增的共享段落不得硬编码任何场景的设备灯色（色值只由场景侧注入 CSS 变量）
    const shared = css.slice(css.indexOf('/* 高密度读数面板'), css.indexOf('/* 跨设备适配'));
    expect(shared).not.toContain('#2fb862');
    expect(shared).not.toContain('#e04b3c');
    expect(panel).toContain('linear-gradient(135deg, rgba(30,41,59,.9) 0%, rgba(15,23,42,.95) 100%)');
    expect(panel).toContain("padding: '6px 9px'");
    expect(panel).toContain('fontWeight: 600');
  });
});

/**
 * 面板内容契约第三块（11-16 用户拍板）：
 * ① 传感器只留 8 路液位开关，搅拌运行 / 搅拌方向 / 三阀到位都不是传感器，全部剔除；
 * ② 报警整体下架（面板区块 / 地址表「报警字」/ 快照键），内部联锁仍在真值层；
 * ③ 面板与 3D 开关柜新增操作站 6 个操作件并分配地址。
 */
describe('操作站与开关柜', () => {
  const operator = read('packages/liquid-mixing/src/platform/liquidOperator.ts');
  const cabinet = read('packages/liquid-mixing/src/scenes/components/OperatorCabinet.tsx');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
  const store = read('packages/liquid-mixing/src/stores/useLiquidStore.ts');
  const scene = read('packages/liquid-mixing/src/scenes/LiquidSceneContent.tsx');

  it('操作件表：5 个点动按钮顺序恒 启动 → 停止 → 复位 → 急停 → 放料，急停是唯一的蘑菇头', () => {
    expect(LIQUID_OPERATOR_BUTTONS.map((b) => b.key))
      .toEqual(['start', 'stop', 'reset', 'estop', 'release']);
    expect(LIQUID_OPERATOR_BUTTONS.map((b) => b.label))
      .toEqual(['启动', '停止', '复位', '急停', '放料']);
    expect(LIQUID_OPERATOR_BUTTONS.filter((b) => b.kind === 'estop')).toHaveLength(1);
    expect(LIQUID_OPERATOR_BUTTONS.find((b) => b.kind === 'estop')?.key).toBe('estop');
    // 手自动两位选择开关：两档各自一个输入点
    expect(Object.keys(LIQUID_OPERATOR_SELECTOR.angles)).toEqual(['manual', 'auto']);
  });

  it('选择开关指向与铭牌同源：手动档倒向左上、自动档倒向右上', () => {
    // 门板法线朝 +Z，观察者在 +Z 侧看进来时局部 +X 就是屏幕右侧；
    // 绕 +Z 逆时针为正 → 正角把拨柄倒向左上 = 手动档，负角倒向右上 = 自动档。
    // 这里曾经把符号写反（manual 写成 -1.0），铭牌与按钮顺序都对、唯独拨柄指反，锁死符号。
    expect(LIQUID_OPERATOR_SELECTOR.angles.manual).toBeGreaterThan(0);
    expect(LIQUID_OPERATOR_SELECTOR.angles.auto).toBeLessThan(0);
    expect(LIQUID_OPERATOR_SELECTOR.angles.manual)
      .toBeCloseTo(-LIQUID_OPERATOR_SELECTOR.angles.auto, 6);
    // 拨柄朝向必须直接取表里的角度，不能在组件里就地写死
    expect(cabinet).toContain('const angle = LIQUID_OPERATOR_SELECTOR.angles[mode];');
    expect(cabinet).toContain('<group rotation={[0, 0, angle]}>');
  });

  it('选择开关拨柄：杆根 / 杆尖 / 刻点半径全派生，描边与芯共面靠 polygonOffset 分层', () => {
    // 杆根、杆尖、刻点半径三处派生，改一处三处同步，禁止各写裸数
    expect(cabinet).toContain('const HANDLE_ROOT = KNOB_R * 0.16;');
    expect(cabinet).toContain('const HANDLE_END = HANDLE_ROOT + HANDLE_L;');
    expect(cabinet).toContain('const TICK_R = BEZEL_R * 1.78;');
    expect(cabinet).toContain('const shoulder = root + HANDLE_L * 0.62;');
    // 描边与芯用同一条轮廓函数缩放：各写一份描边迟早不均匀
    expect(cabinet).toContain('function handleShapeOf(halfW: number)');
    expect(cabinet).toContain('edge: handleShapeOf(HANDLE_W / 2 + HANDLE_EDGE)');
    expect(cabinet).toContain('core: handleShapeOf(HANDLE_W / 2)');
    // 两层必须同 z —— 任何 z 间距都会在斜视角下产生视差，把指向推歪半根杆
    expect(cabinet.match(/position=\{\[0, 0, handleZ\]\}/g)).toHaveLength(2);
    expect(cabinet).not.toContain('handleZ + HANDLE_T + GAP');
    // 层序靠 polygonOffset 分级（-2 描边 / -4 芯），不靠 z
    const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
    expect(materials).toContain('cabinetPointer');
    expect(materials).toMatch(/cabinetPointer[\s\S]*?polygonOffsetFactor: -4/);
    expect(materials).toMatch(/cabinetDecal[\s\S]*?polygonOffsetFactor: -2/);
    // 贴面错开 GAP：刻度环与拨柄都不与旋钮顶面共面
    expect(cabinet).toContain('const dialZ = knobTop + GAP;');
    expect(cabinet).toContain('const handleZ = knobTop + GAP * 2;');
  });

  it('操作站 7 个输入点占 C8~C14 / X0~X6 / M41.0~M41.6，与地址表逐行同源', () => {
    const labels = ['启动按钮', '停止按钮', '复位按钮', '急停按钮', '手动档', '自动档', '放料按钮'];
    Object.values(LIQUID_OPERATOR_COIL_NAMES).forEach((name, i) => {
      expect(LIQUID_COILS[name], name).toBe(8 + i);
      expect(LIQUID_BOOL_S7[name], name).toBe(`M41.${i}`);
      expect(LIQUID_BOOL_MITSUBISHI[name], name).toBe(i === 6 ? 'X6' : `X${i}`);
    });
    labels.forEach((signal, i) => {
      const row = LIQUID_ADDRESS_ROWS.find((r) => r.signal === signal);
      expect(row, signal).toBeDefined();
      expect(row?.modbus, signal).toBe(`C${8 + i}`);
      expect(row?.s7, signal).toBe(`M41.${i}`);
      expect(row?.direction, signal).toBe('设备 → PLC');
    });
    // 手动 / 自动两档互锁：一帧写两路，必有一真一假
    const bits = liquidSelectorBits('auto');
    expect(bits.names).toEqual(['LIQUID_OP_MANUAL', 'LIQUID_OP_AUTO']);
    expect(bits.values).toEqual([false, true]);
    expect(liquidSelectorBits('manual').values).toEqual([true, false]);
  });

  it('急停 / 复位不再挂在 PLC → 设备 输出簇，只作为操作站输入点', () => {
    expect(Object.keys(LIQUID_COILS)).not.toContain('LIQUID_ESTOP');
    expect(Object.keys(LIQUID_COILS)).not.toContain('LIQUID_RESET');
    expect(LIQUID_OUTPUT_COIL_NAMES).toEqual([
      'LIQUID_VALVE_A', 'LIQUID_VALVE_B', 'LIQUID_STIR_FWD', 'LIQUID_STIR_REV', 'LIQUID_DISCHARGE',
    ]);
    // 连接帧不再下发急停 / 复位布尔，避免与操作站输入同名两套
    expect(Object.keys(LIQUID_BOOL_S7)).not.toContain('LIQUID_ESTOP');
    expect(Object.keys(LIQUID_BOOL_S7)).not.toContain('LIQUID_RESET');
    const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');
    expect(effects).not.toContain('LIQUID_ESTOP');
    expect(effects).not.toContain('LIQUID_RESET');
  });

  it('柜面与面板同源：两处都从 LIQUID_OPERATOR_BUTTONS 渲染，不各写一份顺序', () => {
    for (const src of [cabinet, panel]) {
      expect(src).toContain('LIQUID_OPERATOR_BUTTONS');
      expect(src).toContain('LIQUID_OPERATOR_SELECTOR');
      expect(src).toContain('pressLiquidOperator');
      expect(src).toContain('selectLiquidOperatorMode');
    }
    // 柜面不再自带第二份按钮表；面板也不再硬编码五个按钮的坐标式数组
    expect(cabinet).not.toContain('const CABINET_BUTTONS');
    expect(panel).toContain('export function LiquidOperatorPanel');
    // 三模式面板统一挂同一块操作站
    for (const f of ['LiquidManualPanel.tsx', 'LiquidDemoPanel.tsx', 'LiquidSimPanel.tsx']) {
      expect(read(`packages/liquid-mixing/src/platform/${f}`)).toContain('<LiquidOperatorPanel />');
    }
  });

  it('写 PLC 只走一个入口：观众端与未连接时零上行，整块写 + 位串去重', () => {
    expect(operator).toContain('isViewerRuntime()');
    expect(operator).toContain('if (!st.connected)');
    expect(operator).toContain('lastKey');
    expect(operator).toContain("modbusService.getProtocol() === 'modbus'");
    expect(operator).toContain('modbusService.writeCoils(OP_BASE, bits)');
    expect(operator).toContain('modbusService.writeVars([...OP_ORDER], bits)');
    // 300ms 轮询只做去重同步，点动落帧靠事件入口
    const effects = read('packages/liquid-mixing/src/platform/LiquidDeviceEffects.tsx');
    expect(effects).toContain('flushLiquidOperator()');
    // 3D 柜面自己再判一次观众端，双保险
    expect(cabinet).toContain('if (viewer) return;');
  });

  it('柜面三盏指示灯镜像塔式三色灯，读同一份 lamps，不新增地址', () => {
    expect(cabinet).toContain('useLiquidStore((s) => s.lamps)');
    expect(cabinet).toContain('LM.lampGreen');
    expect(cabinet).toContain('LM.lampYellow');
    expect(cabinet).toContain('LM.lampRed');
    // 灭态复用同一块暗玻璃单例，不逐帧改共享材质
    expect(cabinet).toContain('LM.ledOff');
    expect(cabinet).not.toMatch(/LM\.lampGreen\.color\.set/);
    expect(LIQUID_ADDRESS_ROWS.filter((r) => r.signal.includes('指示灯'))).toHaveLength(0);
  });

  it('3D 柜体：柜脚落地、元件沿 +Z 逐层派生，绝不用 rotation=[PI/2,0,0] 摆平按钮', () => {
    expect(scene).toContain('<OperatorCabinet />');
    expect(scene).toContain('const CABINET_X =');
    expect(scene).toContain('const CABINET_Z =');
    // 柜体与灯塔都落在观察者一侧：z 从罐体纵向中部往前派生，灯塔再往前让出开门站位
    expect(scene).toContain('const CABINET_Z = TANK_Z_MID +');
    expect(scene).toContain('const LAMP_Z = CABINET_Z +');
    // 灯塔已随柜体移出机架，底面直接落地（不再坐在台面上）
    expect(scene).toContain('const LAMP_Y = 0;');
    expect(scene).toContain('rotation={[0, CABINET_ROT_Y, 0]}');
    // 圆盘元件统一绕 X 转 90° 让端面朝观察者（与自动配药同一条教训）
    expect(cabinet).toContain('rotation={[Math.PI / 2, 0, 0]}');
    // 元件前表面由 FRONT_Z 派生，贴面一律错开 GAP
    expect(cabinet).toContain('const FRONT_Z = CABINET_SIZE[2] / 2 + PANEL_T;');
    expect(cabinet).toContain('FRONT_Z + GAP');
    // 急停用真实蘑菇剖面（车削），不是压扁的球
    expect(cabinet).toContain('latheGeometry');
    // 柜体高度由尺寸表派生，柜脚与柜体不共面
    expect(cabinet).toContain('CABINET_SIZE[1] / 2 + 0.01');
  });

  it('报警整体下架：面板无报警区块、地址表无「报警字」、快照无报警键', () => {
    expect(panel).not.toContain('LiquidAlarmPanel');
    for (const f of ['LiquidManualPanel.tsx', 'LiquidDemoPanel.tsx', 'LiquidSimPanel.tsx']) {
      expect(read(`packages/liquid-mixing/src/platform/${f}`)).not.toContain('LiquidAlarmPanel');
    }
    expect(Object.keys(LIQUID_WORD_VARIABLES)).not.toContain('LIQUID_ALARM_W');
    expect(LIQUID_ADDRESS_ROWS.filter((r) => r.signal.includes('报警'))).toHaveLength(0);
    expect(Object.keys(LIQUID_PANEL_HINT_SIGNALS)).not.toContain('alarm');
    expect(store).not.toContain('LIQUID_ALARM:');
    expect(store).not.toContain("num('LIQUID_ALARM')");
    // 内部联锁判据仍在真值层，只是不再对外暴露
    expect(store).toContain('liquidAlarmFlags(');
  });

  it('开关量只有 8 路液位开关，掩码为 8 位', () => {
    expect(LIQUID_SENSOR_FEEDBACK).toHaveLength(8);
    expect(LIQUID_SENSOR_FEEDBACK.map((r) => r.signal)).toEqual([
      'A 罐下限', 'B 罐下限', '混合罐下限', '混合罐中液位',
      '混合罐高液位', '混合罐上极限', '成品罐下限', '成品罐上限',
    ]);
    for (const banned of ['搅拌运行', '搅拌正转', '搅拌反转', 'A 阀到位', 'B 阀到位', '出料阀到位']) {
      expect(LIQUID_SENSOR_FEEDBACK.some((r) => r.signal === banned), banned).toBe(false);
    }
    expect(LIQUID_ADDRESS_ROWS.find((r) => r.signal === '开关量掩码')?.note).toBe('8 位');
  });
});
