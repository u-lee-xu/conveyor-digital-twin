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
  LIQUID_BOOL_MITSUBISHI, LIQUID_OUTPUT_COIL_NAMES, LIQUID_ADDRESS_ROWS,
  LIQUID_COILS, liquidSensorBits, liquidSensorMask, LIQUID_IO_MAP,
  LIQUID_PANEL_HINT_SIGNALS, liquidAddressRowsFor, liquidSensorHintRow,
  type LiquidPanelHintKey,
} from './constants/liquidVariables';
import {
  liquidSensorStates, LIQUID_EMPTY_OUTPUTS, LIQUID_PHASE, LIQUID_VIEW_PRESETS,
  LIQUID_VISUAL, liquidValveStateColor,
  LIQUID_INITIAL_VOLUMES, LIQUID_INITIAL_COMPONENTS,
  LIQUID_RESET_VOLUMES, LIQUID_EMPTY_COMPONENTS,
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
    LIQUID_SENSOR_FEEDBACK.forEach((r, i) => {
      expect(LIQUID_COILS[r.key], r.key).toBe(r.modbus);
      expect(r.modbus, r.key).toBe(10 + i);
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
  it('14 路开关量反馈与 liquidSensorBits 同序同长，线圈连续', () => {
    expect(LIQUID_SENSOR_FEEDBACK).toHaveLength(14);
    expect(liquidSensorBits(liquidSensorStates({ a: 0, b: 0, mix: 0, product: 0 }, LIQUID_EMPTY_OUTPUTS, 0))).toHaveLength(14);
    const coils = LIQUID_SENSOR_FEEDBACK.map((r) => r.modbus);
    expect(coils).toEqual(Array.from({ length: 14 }, (_, i) => 10 + i));
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
    // 读失败整轮跳过（不得用 0 兜底清配方 / 重置动作字边沿）+ 轮询不重入
    expect(effects).toContain('if (!words.success || !words.values) return');
    expect(effects).not.toContain('words.values ? words.values : {}');
    expect(effects).toContain('if (busy || stopped) return');
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
    // 紧急停必须真正置 estop（报警 ESTOP 位与快照同源），不能只停演示
    expect(demo).toContain('setEstop(true)');
    expect(demo).not.toContain('stopDemo()');
  });

  it('去皮按钮调用 tareTo，且面板不直接写体积真值', () => {
    const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
    expect(manual).toContain('tareTo');
    expect(manual).toContain('data-dt-liquid-tare');
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

  it('③ 搅拌有结果：均匀度常量与纯函数单一来源，且进 store / 快照 / 面板', () => {
    expect(constants).toContain('UNIFORMITY_RATE');
    expect(constants).toContain('clampUniformity');
    expect(constants).toContain('liquidStratification');
    expect(store).toContain('mixUniformity:');
    expect(store).toContain('LIQUID_UNIFORMITY');
    expect(store).toContain('UNIFORMITY_RATE * dt');
    expect(panel).toContain('data-dt-liquid-uniformity');
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
    // 上行地址表行数不因本轮变化（冻结的 S0 通道口径）
    expect(LIQUID_ADDRESS_ROWS.length).toBe(23);
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
    expect(LIQUID_ADDRESS_ROWS.length).toBe(23);
  });
});

describe('阀门开关状态色：3D / 面板 / 展台同源', () => {
  const constants = read('packages/liquid-mixing/src/constants/liquidConstants.ts');
  const materials = read('packages/liquid-mixing/src/scenes/shared/liquidMaterials.ts');
  const parts = read('packages/liquid-mixing/src/scenes/components/LiquidParts.tsx');
  const manual = read('packages/liquid-mixing/src/platform/LiquidManualPanel.tsx');
  const panel = read('packages/liquid-mixing/src/platform/LiquidPanelParts.tsx');
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

  it('面板按钮 / 状态读数 / 隐藏锚点都与 3D 用同一个纯函数', () => {
    expect(manual).toContain('liquidValveStateColor(on)');
    expect(manual).toContain('valveKeys.includes(t.key)');
    expect(panel).toContain('data-dt-liquid-valve');
    expect(panel).toContain('liquidValveStateColor(outputs.valveA)');
    expect(panel).toContain('liquidValveStateColor(outputs.valveB)');
    expect(panel).toContain('liquidValveStateColor(outputs.discharge)');
  });

  it('部件展台阀门跟随 A 阀真值，不再恒开', () => {
    expect(scene).toContain('renderBarePart(kind, valveOpen)');
    expect(scene).toContain('<BallValve open={valveOpen} />');
    expect(scene).not.toContain('<BallValve open />');
  });

  it('状态色是纯本地派生量，PLC 变量表 / 地址表 / 回写链路零改动', () => {
    expect(LIQUID_ADDRESS_ROWS.length).toBe(23);
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
    // 搅拌方向是正 / 反转两个线圈，各占一行
    expect(liquidAddressRowsFor('stirDirection').map((r) => r.modbus)).toEqual(['C2', 'C3']);
  });

  it('14 路开关量逐路地址与回写表同源', () => {
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
    expect(demo).toContain('LiquidSensorHint');
    for (const key of Object.keys(LIQUID_PANEL_HINT_SIGNALS)) {
      // 静态写法 hintKey="xxx"，或经 LEVEL_HINT / EXECUTOR_HINT 映射表引用 'xxx'
      const used = all.includes(`hintKey="${key}"`) || all.includes(`'${key}'`);
      expect(used, `语义键 ${key} 未被任何面板使用`).toBe(true);
    }
    expect(LIQUID_ADDRESS_ROWS.length).toBe(23);
  });

  it('纯本地教学量与本地演示主令严禁标地址', () => {
    const keys = Object.keys(LIQUID_PANEL_HINT_SIGNALS);
    expect(keys.some((k) => /uniform|productA|productB|color|demo|estop/i.test(k))).toBe(false);
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
    // 全部复位 / frame.reset / 动作字 RESET：只留两个原料罐
    expect(store).toContain('const resetVolumes = (): Volumes => ({ ...LIQUID_RESET_VOLUMES });');
    expect(store).toContain('const emptyComponents = () => ({ ...LIQUID_EMPTY_COMPONENTS });');
    expect((store.match(/patch\.volumes = resetVolumes\(\)/g) ?? []).length).toBe(2);
    expect((store.match(/Object\.assign\(patch, emptyComponents\(\)\)/g) ?? []).length).toBe(2);
    expect(store).toContain('volumes: resetVolumes(), tare: emptyVolumes()');
    expect(store).toContain('sensors: liquidSensorStates(resetVolumes()');
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
    expect(store).toContain('volumes: resetVolumes()');
  });

  it('展示初值仍是纯本地教学量，不进 PLC 变量表与地址表', () => {
    expect(LIQUID_ADDRESS_ROWS.length).toBe(23);
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
    expect(store).toContain('volumes: resetVolumes()');
    expect(store).toContain('sensors: liquidSensorStates(resetVolumes()');
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
    const rows = manual.slice(manual.indexOf('const EXECUTOR_ROWS'), manual.indexOf('/** 三个阀门用'));
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
