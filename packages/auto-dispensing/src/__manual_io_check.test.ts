/**
 * 手动模式「PLC 单点 I/O 操作台」自检。
 *
 * 手动模式的语义是「面板按键 ≡ 直接置位/复位 PLC 输出线圈」，因此这里要守住三件事：
 *   1. 面板上的地址必须来自 constants.ts 的三张协议地址表，不能在 JSX 里回填 'Y2' / 'C32'；
 *   2. 输入点（X）电平由纯函数读取；位置改走 32 位 DINT 数据寄存器，不占任何输入点；
 *   3. UI 紧凑化不能回退：只渲染两张卡、输入点三列；X/Y/C 地址不直显，
 *      改由信号名称悬停浮框提供；手动模式不展示自动流程状态；
 *   4. 滑台点动必须是一次点击 10mm 的离散脉冲，不能退回 rAF 连续速度。
 * 另外把「信号灯塔抬高」也锁进断言，防止后续改常量又让灯头与立杆脱开或被展台裁切。
 */
import { describe, it, expect } from 'vitest';
import {
  MODBUS_READ_VARS, MITSUBISHI_READ_VARS, MITSUBISHI_WRITE_VARS,
  MITSUBISHI_DISPLAY_VARS, S7_VARS, ENCODER_DINT,
  LIGHT_POLE_Y, LIGHT_POLE_H, LIGHT_DOME_R, LIGHT_DOME_STEP, PART_STAGES,
  MANUAL_JOG, PULSES_PER_M, ENCODER_PULSES_PER_REV, HOPPER, MAGAZINE_X, SCREW_DETAIL,
  type MagazineId,
} from './scenes/auto-dispensing/constants';
import {
  MANUAL_OUTPUT_POINTS, MANUAL_INPUT_POINTS, MANUAL_IO_SUMMARY,
  IO_GROUP_TITLES, ENCODER_REGISTER_INFO, DINT_ADDRESS_ROWS,
  inputPointLevel, outputPointLevel, ioAddressRows, pointAddressRow,
  type InputSnapshot, type OutputSnapshot,
} from './scenes/auto-dispensing/manualIo';

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

/** Vite 的 import.meta.glob 只接受静态字面量，逐个文件分别声明 */
const globs: Record<string, Record<string, string>> = {
  './App.tsx': import.meta.glob<string>('./App.tsx', { query: '?raw', import: 'default', eager: true }),
  './platform/PlatformModePanels.tsx': import.meta.glob<string>('./platform/PlatformModePanels.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseControlPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseControlPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseStatusPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseStatusPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseSimPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/AddressHint.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/AddressHint.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/ReadoutNum.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/ReadoutNum.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseDemoPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseDemoPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/components/ControlCabinet.tsx': import.meta.glob<string>('./scenes/auto-dispensing/components/ControlCabinet.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/hooks/useDispenseLoop.ts': import.meta.glob<string>('./scenes/auto-dispensing/hooks/useDispenseLoop.ts', { query: '?raw', import: 'default', eager: true }),
  './stores/useDispensingStore.ts': import.meta.glob<string>('./stores/useDispensingStore.ts', { query: '?raw', import: 'default', eager: true }),
};

function rawSource(path: string): string {
  const source = globs[path]?.[path];
  if (!source) throw new Error(`源码读取失败：${path}`);
  return source;
}

const appSource = rawSource('./App.tsx');
const platformSource = rawSource('./platform/PlatformModePanels.tsx');
const controlSource = rawSource('./scenes/auto-dispensing/panels/DispenseControlPanel.tsx');
const statusSource = rawSource('./scenes/auto-dispensing/panels/DispenseStatusPanel.tsx');
const simSource = rawSource('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const hintSource = rawSource('./scenes/auto-dispensing/panels/AddressHint.tsx');
const readoutSource = rawSource('./scenes/auto-dispensing/panels/ReadoutNum.tsx');
const demoSource = rawSource('./scenes/auto-dispensing/panels/DispenseDemoPanel.tsx');
const cabinetSource = rawSource('./scenes/auto-dispensing/components/ControlCabinet.tsx');
const loopSource = rawSource('./scenes/auto-dispensing/hooks/useDispenseLoop.ts');
const storeSource = rawSource('./stores/useDispensingStore.ts');
/**
 * CSS 必须用文件读取而不是 ?raw：Vitest 默认会 stub CSS 模块，
 * .css?raw 拿到的是空串；源码级断言必须读到真实文本。
 *
 * 但本包 vite.config.ts 挂了 vite-plugin-electron-renderer，它会把 `node:fs`
 * 重写成用 CJS require 的垫片，在 vitest 的 ESM 环境里直接 `import 'node:fs'`
 * 会抛 "require is not defined"。改用 Node 内建的 getBuiltinModule 绕过 Vite
 * 解析拿真正的 fs；new URL 是全局 Web API，同样无需被垫片接管的 node:url。
 */
const cssSource = process.getBuiltinModule('fs').readFileSync(
  new URL('./index.css', import.meta.url),
  'utf8',
);

function makeInput(): InputSnapshot {
  return {
    buttons: { start: false, stop: false, reset: false, estop: false, confirm: false },
    sensors: {
      limitStart: false,
      limitEnd: false,
      magEmpty: { A: false, B: false, C: false, D: false },
      binHasDrug: false,
      mscBack: { A: false, B: false, C: false, D: false },
      mscFront: { A: false, B: false, C: false, D: false },
      mscTiltHold: false,
      mscTiltDump: false,
    },
    encoderPulses: 0,
  };
}

function makeOutput(): OutputSnapshot {
  return {
    motorFwd: false,
    motorRev: false,
    sendCyl: {
      A: { extended: false, position: 0 }, B: { extended: false, position: 0 },
      C: { extended: false, position: 0 }, D: { extended: false, position: 0 },
    },
    tiltCyl: { tilted: false, angle: 0 },
    lamp: { green: false, yellow: false, red: false },
  };
}

// ============================================================
// 点位表：面板上的每个地址都要能回溯到协议地址表
// ============================================================

describe('手动 I/O 点位表与协议地址表同源', () => {
  it('输出点逐项对应三菱 Y 地址与 Modbus 线圈号', () => {
    expect(MANUAL_OUTPUT_POINTS).toHaveLength(Object.keys(MITSUBISHI_WRITE_VARS).length);
    MANUAL_OUTPUT_POINTS.forEach((p) => {
      expect(p.addr).toBe(MITSUBISHI_WRITE_VARS[p.key as keyof typeof MITSUBISHI_WRITE_VARS]);
      expect(p.coil).toBe(`C${MODBUS_READ_VARS[p.key as keyof typeof MODBUS_READ_VARS]}`);
      expect(p.label.length).toBeGreaterThan(0);
      expect(IO_GROUP_TITLES[p.group].length).toBeGreaterThan(0);
      expect(p.addr).toMatch(/^Y\d+$/);
    });
  });

  it('输入点逐项对应三菱 X 地址与 Modbus 线圈号，且不含任何编码器位', () => {
    expect(MANUAL_INPUT_POINTS).toHaveLength(Object.keys(MITSUBISHI_READ_VARS).length);
    MANUAL_INPUT_POINTS.forEach((p) => {
      expect(p.addr).toBe(MITSUBISHI_READ_VARS[p.key as keyof typeof MITSUBISHI_READ_VARS]);
      expect(p.coil).toBe(`C${MODBUS_READ_VARS[p.key as keyof typeof MODBUS_READ_VARS]}`);
      expect(p.label.length).toBeGreaterThan(0);
      expect(IO_GROUP_TITLES[p.group].length).toBeGreaterThan(0);
      expect(p.addr).toMatch(/^X\d+$/);
      expect(p.key.startsWith('ENCODER_BIT')).toBe(false);
    });
    expect(Object.keys(IO_GROUP_TITLES)).not.toContain('encoder');
  });

  it('输出/输入地址各自不重复，汇总计数与数组长度一致', () => {
    expect(new Set(MANUAL_OUTPUT_POINTS.map((p) => p.addr)).size).toBe(MANUAL_OUTPUT_POINTS.length);
    expect(new Set(MANUAL_OUTPUT_POINTS.map((p) => p.coil)).size).toBe(MANUAL_OUTPUT_POINTS.length);
    expect(new Set(MANUAL_INPUT_POINTS.map((p) => p.addr)).size).toBe(MANUAL_INPUT_POINTS.length);
    expect(new Set(MANUAL_INPUT_POINTS.map((p) => p.coil)).size).toBe(MANUAL_INPUT_POINTS.length);
    expect(new Set(MANUAL_OUTPUT_POINTS.map((p) => p.key)).size).toBe(MANUAL_OUTPUT_POINTS.length);
    expect(new Set(MANUAL_INPUT_POINTS.map((p) => p.key)).size).toBe(MANUAL_INPUT_POINTS.length);
    expect(MANUAL_IO_SUMMARY.outputs).toBe(MANUAL_OUTPUT_POINTS.length);
    expect(MANUAL_IO_SUMMARY.inputs).toBe(MANUAL_INPUT_POINTS.length);
  });

  it('输出点按「电机 → 四仓送药缸 → 翻转缸 → 三色灯」的操作顺序排列', () => {
    const keys = MANUAL_OUTPUT_POINTS.map((p) => p.key);
    expect(keys.slice(0, 2)).toEqual(['MOTOR_FWD', 'MOTOR_REV']);
    expect(keys.slice(2, 6)).toEqual(['CYL_SEND_A', 'CYL_SEND_B', 'CYL_SEND_C', 'CYL_SEND_D']);
    expect(keys[6]).toBe('CYL_TILT');
    expect(keys.slice(7)).toEqual(['LAMP_GREEN', 'LAMP_YELLOW', 'LAMP_RED']);
  });
});

// ============================================================
// 输入点电平：纯函数逐组校验
// ============================================================

describe('输入点 X 电平读取', () => {
  it('五个主令按钮各自独立，互不串点', () => {
    const fields = ['start', 'stop', 'reset', 'estop', 'confirm'] as const;
    const keys = ['BUTTON_START', 'BUTTON_STOP', 'BUTTON_RESET', 'BUTTON_ESTOP', 'BUTTON_CONFIRM'];
    fields.forEach((field, i) => {
      const s = makeInput();
      s.buttons[field] = true;
      expect(inputPointLevel(keys[i], s), keys[i]).toBe(true);
      keys.filter((_, j) => j !== i).forEach((other) => {
        expect(inputPointLevel(other, s), other).toBe(false);
      });
    });
  });

  it('限位、空仓、取药仓与翻转位逐点对应传感器字段', () => {
    const cases: [string, (s: InputSnapshot) => void][] = [
      ['S_LIMIT_START', (s) => { s.sensors.limitStart = true; }],
      ['S_LIMIT_END', (s) => { s.sensors.limitEnd = true; }],
      ['S_BIN_HAS_DRUG', (s) => { s.sensors.binHasDrug = true; }],
      ['MSC_TILT_HOLD', (s) => { s.sensors.mscTiltHold = true; }],
      ['MSC_TILT_DUMP', (s) => { s.sensors.mscTiltDump = true; }],
      ...MAGS.map((m) => [
        `S_MAG_${m}_EMPTY`,
        (s: InputSnapshot) => { s.sensors.magEmpty[m] = true; },
      ] as [string, (s: InputSnapshot) => void]),
    ];
    cases.forEach(([key, mutate]) => {
      const s = makeInput();
      mutate(s);
      expect(inputPointLevel(key, s), key).toBe(true);
    });
  });

  it('四仓送药缸前后磁性开关按仓按方向独立读取', () => {
    MAGS.forEach((m) => {
      const back = makeInput();
      back.sensors.mscBack[m] = true;
      expect(inputPointLevel(`MSC_${m}_BACK`, back)).toBe(true);
      expect(inputPointLevel(`MSC_${m}_FRONT`, back)).toBe(false);

      const front = makeInput();
      front.sensors.mscFront[m] = true;
      expect(inputPointLevel(`MSC_${m}_FRONT`, front)).toBe(true);
      expect(inputPointLevel(`MSC_${m}_BACK`, front)).toBe(false);
    });
  });

  it('位置是 32 位 DINT 数值，输入点电平里不再有位镜像', () => {
    expect(ENCODER_REGISTER_INFO.type).toBe('DINT32');
    expect(ENCODER_REGISTER_INFO.address).toContain('HR120');
    expect(ENCODER_REGISTER_INFO.address).toContain('MD120');
    expect(ENCODER_REGISTER_INFO.address).toContain('D120');
    // 旧版 8 位线圈位镜像已彻底移除：任何 ENCODER_BIT 都不是输入点
    for (let bit = 0; bit < 8; bit += 1) {
      const s = makeInput();
      s.encoderPulses = 1 << bit;
      expect(inputPointLevel(`ENCODER_BIT${bit}`, s)).toBe(false);
    }
  });

  it('未知点位返回 false，不会误报为传感器接通', () => {
    expect(inputPointLevel('NOT_A_POINT', makeInput())).toBe(false);
    expect(outputPointLevel('NOT_A_POINT', makeOutput())).toBe(false);
  });
});

// ============================================================
// 输出点电平：每个按键都有可回读的线圈状态
// ============================================================

describe('输出点 Y 电平读取', () => {
  it('10 个输出点逐项可独立置位并回读', () => {
    const cases: [string, (s: OutputSnapshot) => void][] = [
      ['MOTOR_FWD', (s) => { s.motorFwd = true; }],
      ['MOTOR_REV', (s) => { s.motorRev = true; }],
      ...MAGS.map((m) => [
        `CYL_SEND_${m}`,
        (s: OutputSnapshot) => { s.sendCyl[m].extended = true; },
      ] as [string, (s: OutputSnapshot) => void]),
      ['CYL_TILT', (s) => { s.tiltCyl.tilted = true; }],
      ['LAMP_GREEN', (s) => { s.lamp.green = true; }],
      ['LAMP_YELLOW', (s) => { s.lamp.yellow = true; }],
      ['LAMP_RED', (s) => { s.lamp.red = true; }],
    ];
    cases.forEach(([key, mutate]) => {
      const s = makeOutput();
      mutate(s);
      expect(outputPointLevel(key, s), key).toBe(true);
      MANUAL_OUTPUT_POINTS.filter((p) => p.key !== key).forEach((p) => {
        expect(outputPointLevel(p.key, s), p.key).toBe(false);
      });
    });
    expect(cases).toHaveLength(MANUAL_OUTPUT_POINTS.length);
  });
});

// ============================================================
// 面板源码：I/O 语义与紧凑化防回退
// ============================================================

describe('手动面板：点位可见、单点控制、无重复渲染', () => {
  it('控制面板地址一律由点位表拼出，不回填写死地址', () => {
    expect(controlSource).toContain('MANUAL_OUTPUT_POINTS');
    expect(controlSource).toContain('outputPointLevel(point.key, outSnap)');
    // 双点行（滑台正/反转、三色灯塔）必须把每个点的地址都拼进浮框
    expect(controlSource).toContain('AddrLabel');
    expect(controlSource).toContain('ioAddressRows(points)');
    expect(controlSource).not.toContain('points[0].coil');
    // 只允许点位表引用，不允许任何具体 Y 地址 / 线圈号字面量（含注释示例）
    expect(controlSource).not.toMatch(/['"`]Y\d+['"`]/);
    expect(controlSource).not.toMatch(/['"`]C\d+['"`]/);
    expect(controlSource).not.toMatch(/['"`]X\d+['"`]/);
    expect(controlSource).toContain('setSendCyl(mag, true, cyl.position)');
    expect(controlSource).toContain('setSendCyl(mag, false, cyl.position)');
    expect(controlSource).toContain('setTiltCyl(true, tiltCyl.angle)');
    expect(controlSource).toContain('setTiltCyl(false, tiltCyl.angle)');
    expect(controlSource).toContain('setMotor(dir > 0, dir < 0)');
    expect(controlSource).toContain('setMotor(false, false)');
  });

  it('前进/后退是单击精确步进 + 长按连续点动，松开复位输出线圈', () => {
    expect(controlSource).toContain('onPointerDown={() => beginJog(1)}');
    expect(controlSource).toContain('onPointerDown={() => beginJog(-1)}');
    expect(controlSource).toContain('onPointerUp={stopJog}');
    expect(controlSource).toContain('onPointerLeave={stopJog}');
    expect(controlSource).toContain('onPointerCancel={stopJog}');
    expect(controlSource).toContain('jogStep(dir)');
    expect(controlSource).toContain('MANUAL_JOG.HOLD_MS');
    expect(controlSource).toContain('MANUAL_JOG.REPEAT_MS');
    // Pointer Events 已覆盖触屏；旧版 pointer + touch 双绑定会让一次点击发两个脉冲
    expect(controlSource).not.toContain('onTouchStart');
    expect(controlSource).not.toContain('onTouchEnd');
  });

  it('输入点地址改由信号名称悬停浮框提供，按组两列成对排布', () => {
    expect(statusSource).toContain('AddressHint');
    expect(statusSource).toContain('ioAddressRows([point])');
    expect(statusSource).toContain('grid-cols-2');
    expect(statusSource).toContain('inputPointLevel(point.key, snapshot)');
    expect(statusSource).toContain('IO_GROUP_TITLES[group]');
    expect(statusSource).not.toContain('grid-cols-3');
    // 地址不能再作为可见列渲染，也不能退化成原生 title
    expect(statusSource).not.toMatch(/>\{point\.addr\}</);
    expect(statusSource).not.toContain('title={point.addr}');
  });

  it('App 与平台壳只挂一次操作台，不再额外重复挂状态面板', () => {
    expect(appSource).not.toContain('DispenseStatusPanel');
    expect(platformSource).not.toContain('DispenseStatusPanel');
    expect(controlSource).toContain('<DispenseStatusPanel />');
    // import 语句里组件名出现两次（导入名 + 路径），再加桌面栏与移动抽屉各一次
    expect(appSource.match(/DispenseControlPanel/g)).toHaveLength(4);
    expect(platformSource).toContain('<DispenseControlPanel />');
  });

  it('手动模式只有两张卡，且不展示自动流程状态', () => {
    expect((controlSource.match(/device-card/g) ?? []).length).toBe(1);
    expect((statusSource.match(/device-card/g) ?? []).length).toBe(1);
    expect(controlSource).not.toContain('autoPhase');
    expect(statusSource).not.toContain('autoPhase');
    expect(statusSource).not.toContain('autoCycle');
    // 进度条只保留最顶部一条滑台位置总览，不再给每个执行器各铺一条
    expect((controlSource.match(/progress-bar/g) ?? []).length).toBe(1);
    expect(controlSource).toContain('补满');
  });
});

// ============================================================
// 输入点表两列成对：磁性开关 10 点 = 5 对前后磁性开关，不留孤儿行
//
// 旧版三列排布下「磁性开关」最后一行只剩「翻转位」一个 LED（用户反馈），
// 且主令(5)/空仓(4)/取药仓(1) 都有不满行。现在每组点数必须为偶数，
// 两列渲染后每行恰好 2 个点；取药仓单点并入主令组凑成 6 点。
// ============================================================

describe('输入点表两列成对排布（防回退）', () => {
  const groupKeys = [...new Set(MANUAL_INPUT_POINTS.map((p) => p.group))];
  const counts = Object.fromEntries(
    groupKeys.map((g) => [g, MANUAL_INPUT_POINTS.filter((p) => p.group === g).length]),
  ) as Record<string, number>;

  it('每组点数都是偶数，22 个点恰好铺满 11 行、无孤儿行', () => {
    expect(MANUAL_INPUT_POINTS.length).toBe(22);
    expect(Object.values(counts).every((n) => n % 2 === 0)).toBe(true);
    expect(Object.values(counts).reduce((a, b) => a + b / 2, 0)).toBe(11);
  });

  it('取药仓单点并入主令组凑成 6 点，不再有独立 bin 组', () => {
    expect(counts.button).toBe(6);
    expect(counts.bin).toBeUndefined();
    expect(Object.keys(IO_GROUP_TITLES)).not.toContain('bin');
    expect(MANUAL_INPUT_POINTS.find((p) => p.key === 'S_BIN_HAS_DRUG')?.group).toBe('button');
    expect(IO_GROUP_TITLES.button).toContain('取药仓');
  });

  it('磁性开关 10 点按地址表顺序恰好是 5 对「后 / 前」磁性开关', () => {
    const reedKeys = MANUAL_INPUT_POINTS.filter((p) => p.group === 'reed').map((p) => p.key);
    expect(reedKeys).toEqual([
      'MSC_A_BACK', 'MSC_A_FRONT',
      'MSC_B_BACK', 'MSC_B_FRONT',
      'MSC_C_BACK', 'MSC_C_FRONT',
      'MSC_D_BACK', 'MSC_D_FRONT',
      'MSC_TILT_HOLD', 'MSC_TILT_DUMP',
    ]);
    for (let i = 0; i < reedKeys.length; i += 2) {
      expect(reedKeys[i].endsWith('_BACK') || reedKeys[i] === 'MSC_TILT_HOLD').toBe(true);
      expect(reedKeys[i + 1].endsWith('_FRONT') || reedKeys[i + 1] === 'MSC_TILT_DUMP').toBe(true);
    }
  });

  it('面板源码固定为 grid-cols-2，不回退三列', () => {
    expect(statusSource).toContain('grid grid-cols-2');
    expect(statusSource).not.toContain('grid-cols-3');
  });
});

// ============================================================
// 地址显示：X/Y/C 不直显，只在信号名称悬停浮框里出现
// ============================================================

describe('PLC 地址改为信号名称悬停浮框', () => {
  it('AddressHint 用 portal + fixed 定位，不受左栏滚动裁剪', () => {
    expect(hintSource).toContain('createPortal');
    expect(hintSource).toContain("position: 'fixed'");
    expect(hintSource).toContain('document.body');
    expect(hintSource).toContain('onMouseEnter={show}');
    expect(hintSource).toContain('onMouseLeave={hide}');
    expect(hintSource).toContain('role="tooltip"');
    expect(hintSource).toContain('data-io-hint-trigger');
    expect(hintSource).toContain('完整地址映射见');
  });

  it('三个模式面板都不再直接渲染 X/Y/C 地址文本', () => {
    [controlSource, statusSource, simSource].forEach((src) => {
      expect(src).toContain('AddressHint');
      expect(src).not.toMatch(/>\{point\.addr\}</);
      expect(src).not.toMatch(/>\{ENCODER_REGISTER_INFO\.address\}</);
    });
    expect(controlSource).not.toContain('AddrTag');
    expect(simSource).not.toContain('title={addr}');
  });

  it('位置寄存器三协议地址收进浮框，完整映射仍以使用说明为准', () => {
    expect(DINT_ADDRESS_ROWS).toHaveLength(1);
    expect(DINT_ADDRESS_ROWS[0].s7).toBe('MD120');
    [controlSource, statusSource, simSource].forEach((src) => {
      expect(src).toContain('DINT_ADDRESS_ROWS');
    });
  });
});

// ============================================================
// 悬停浮框一次给出三协议地址：三菱 X/Y + Modbus 线圈 + Siemens S7 M 区
//
// 旧版手动面板只给「X/Y + C」，仿真面板更弱 —— getAddr() 按当前所选协议
// 只返回一个地址（切到 Modbus 就只有 Coil 20）。现在浮框表头固定三协议，
// 不管是哪个模式、当前连的是哪种协议，都一次列出全部三套地址。
// ============================================================

describe('悬停浮框三协议地址（防回退）', () => {
  const allPoints = [...MANUAL_OUTPUT_POINTS, ...MANUAL_INPUT_POINTS];

  it('32 个点位都带 S7 地址且与 S7_VARS 同源', () => {
    expect(allPoints).toHaveLength(32);
    allPoints.forEach((p) => {
      expect(p.s7).toBe(S7_VARS[p.key as keyof typeof S7_VARS]);
      expect(p.s7).toMatch(/^M\d+\.\d$/);
    });
  });

  it('ioAddressRows 把点位转成三协议行，三列值全部来自地址表', () => {
    const rows = ioAddressRows(allPoints);
    expect(rows).toHaveLength(allPoints.length);
    rows.forEach((r, i) => {
      const p = allPoints[i];
      expect(r.label).toBe(p.label);
      expect(r.mitsubishi).toBe(MITSUBISHI_DISPLAY_VARS[p.key as keyof typeof MITSUBISHI_DISPLAY_VARS]);
      expect(r.modbus).toBe(`C${MODBUS_READ_VARS[p.key as keyof typeof MODBUS_READ_VARS]}`);
      expect(r.s7).toBe(S7_VARS[p.key as keyof typeof S7_VARS]);
    });
  });

  it('pointAddressRow 对全部变量名返回三协议地址（仿真面板用）', () => {
    Object.keys(MODBUS_READ_VARS).forEach((key) => {
      const r = pointAddressRow(key, key);
      expect(r.mitsubishi).toBe(MITSUBISHI_DISPLAY_VARS[key as keyof typeof MITSUBISHI_DISPLAY_VARS]);
      expect(r.modbus).toMatch(/^C\d+$/);
      expect(r.s7).toMatch(/^M\d+\.\d$/);
    });
  });

  it('位置寄存器浮框也是三协议一行，双字地址紧凑写法不撑破列宽', () => {
    const [r] = DINT_ADDRESS_ROWS;
    expect(r.label).toBe('位置脉冲');
    // 「·」两侧不留空格：宽松写法 'HR120 / HR121' 在浮框三等分列里会挤到 S7 列
    expect(r.mitsubishi).toBe('D120·D121');
    expect(r.modbus).toBe('HR120·HR121');
    expect(r.s7).toBe('MD120');
    expect(r.mitsubishi).not.toContain(' ');
    expect(r.modbus).not.toContain(' ');
    // 值仍必须由 ENCODER_DINT 派生，不允许在 manualIo 里回填地址字面量
    expect(r.mitsubishi).toBe(ENCODER_DINT.MITSUBISHI_LABEL.replace(/\s+/g, ''));
    expect(r.modbus).toBe(ENCODER_DINT.MODBUS_LABEL.replace(/\s+/g, ''));
    expect(r.s7).toBe(ENCODER_DINT.S7_LABEL);
  });

  it('AddressHint 渲染三协议表头与三列地址，不再只显示 addr/coil 两列', () => {
    expect(hintSource).toContain('三菱 FX');
    expect(hintSource).toContain('Modbus TCP');
    expect(hintSource).toContain('Siemens S7');
    expect(hintSource).toContain('row.mitsubishi');
    expect(hintSource).toContain('row.modbus');
    expect(hintSource).toContain('row.s7');
    expect(hintSource).not.toContain('row.coil');
    expect(hintSource).not.toContain('row.addr');
  });

  it('浮框宽度与列模板容得下双字地址，地址单元格 nowrap', () => {
    // 旧 310px 浮框 + 'HR120 / HR121' 会挤进 S7 列；加宽并改用紧凑写法
    const boxW = Number(hintSource.match(/const BOX_W = (\d+)/)?.[1]);
    expect(boxW).toBeGreaterThanOrEqual(330);
    expect(hintSource).toContain("'62px 1fr 1fr 1fr'");
    // 信号名 + 三协议地址共 4 个单元格都必须 nowrap，宽度才与地址位数无关
    expect((hintSource.match(/whiteSpace: 'nowrap'/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('三个面板都走单一来源，仿真面板不再按当前协议只显示一个地址', () => {
    expect(controlSource).toContain('ioAddressRows(points)');
    expect(statusSource).toContain('ioAddressRows([point])');
    expect(simSource).toContain('pointAddressRow(addrKey, label)');
    expect(simSource).toContain('addrKey="MOTOR_FWD"');
    expect(simSource).not.toContain('getAddr(');
    expect(simSource).not.toContain('Coil ${map');
  });
});

// ============================================================
// 滑台点动：单击固定 10mm，脉冲数按编码器分辨率派生
// ============================================================

describe('手动点动：单击 10mm 精确步进', () => {
  it('步长脉冲数由 1024 脉冲/转 × 导程派生，且远小于料斗半宽与药仓间距', () => {
    const stepPulses = MANUAL_JOG.STEP * PULSES_PER_M;
    expect(stepPulses).toBeCloseTo(
      MANUAL_JOG.STEP * ENCODER_PULSES_PER_REV / SCREW_DETAIL.LEAD, 6);
    expect(Number.isInteger(stepPulses)).toBe(true);
    expect(stepPulses).toBeGreaterThan(1);
    expect(MANUAL_JOG.STEP).toBeGreaterThan(0);
    expect(MANUAL_JOG.STEP).toBeLessThan(HOPPER.W / 2);
    expect(MANUAL_JOG.STEP).toBeLessThan(MAGAZINE_X.B - MAGAZINE_X.A);
  });

  it('旧连续速度下轻点 0.2s 就越过接药窗口，新步长小一个量级', () => {
    const oldShortClick = SCREW_DETAIL.SLIDER_SPEED * 0.2;
    expect(oldShortClick).toBeGreaterThan(HOPPER.W / 2);
    expect(MANUAL_JOG.STEP).toBeLessThan(oldShortClick / 4);
  });

  it('长按连续点动等效速度低于演示速度，且仍能覆盖相邻仓行程', () => {
    const jogSpeed = MANUAL_JOG.STEP / (MANUAL_JOG.REPEAT_MS / 1000);
    expect(jogSpeed).toBeGreaterThan(0);
    expect(jogSpeed).toBeLessThan(SCREW_DETAIL.SLIDER_SPEED);
    expect((MAGAZINE_X.B - MAGAZINE_X.A) / jogSpeed).toBeLessThan(5);
  });

  it('面板占用电机时 rAF 连续速度驱动让位，演示/PLC 链路不受影响', () => {
    expect(loopSource).toContain('!s.jogActive');
    expect(loopSource).toContain('SLIDER_SPEED * dt');
    expect(controlSource).toContain('setJogActive(true)');
    expect(controlSource).toContain('setJogActive(false)');
    expect(storeSource).toContain('jogActive: false');
    expect(storeSource).toContain('setJogActive: (active) => set({ jogActive: active })');
  });

  it('卸载与复位都会释放点动占用，Y0/Y1 不会一直挂着', () => {
    expect(controlSource).toContain('window.clearInterval(j.repeat)');
    expect(controlSource).toContain('s.setMotor(false, false)');
    expect(storeSource).toContain('jogActive: false,');
  });
});

// ============================================================
// 信号灯塔：抬高后的几何闭环与展台取景
// ============================================================

describe('信号灯塔抬高', () => {
  it('灯头明显高于旧 1.15m 机架齐平高度，立杆顶面仍与红灯罩中心同源', () => {
    expect(LIGHT_POLE_Y).toBeGreaterThanOrEqual(1.5);
    expect(LIGHT_POLE_Y - 1.15).toBeGreaterThanOrEqual(0.35);
    expect(LIGHT_POLE_H).toBeCloseTo(LIGHT_POLE_Y, 6);
    expect(LIGHT_POLE_Y - LIGHT_DOME_R).toBeLessThan(LIGHT_POLE_H);
  });

  it('展台竖向视野完整覆盖杆底 0 到绿灯罩顶', () => {
    const s = PART_STAGES.tower;
    const d = Math.hypot(
      s.camera[0] - s.target[0], s.camera[1] - s.target[1], s.camera[2] - s.target[2],
    );
    const half = d * Math.tan((s.fov * Math.PI) / 360);
    const towerTop = LIGHT_POLE_Y + 2 * LIGHT_DOME_STEP + LIGHT_DOME_R;
    expect(towerTop).toBeCloseTo(1.685, 6);
    expect(s.target[1] - half).toBeLessThanOrEqual(0);
    expect(s.target[1] + half).toBeGreaterThanOrEqual(towerTop);
    expect(s.camera[1]).toBeGreaterThan(s.target[1]);
  });

  it('展台上下各留 ≥6% 视野余量，灯头不贴画面边缘', () => {
    const s = PART_STAGES.tower;
    const d = Math.hypot(
      s.camera[0] - s.target[0], s.camera[1] - s.target[1], s.camera[2] - s.target[2],
    );
    const height = 2 * d * Math.tan((s.fov * Math.PI) / 360);
    const half = height / 2;
    const towerTop = LIGHT_POLE_Y + 2 * LIGHT_DOME_STEP + LIGHT_DOME_R;
    expect((s.target[1] + half - towerTop) / height).toBeGreaterThan(0.06);
    expect((0 - (s.target[1] - half)) / height).toBeGreaterThan(0.06);
  });

  it('立杆与三层灯罩都由常量推导，不写死旧高度', () => {
    expect(cabinetSource).toContain('args={[0.012, 0.02, LIGHT_POLE_H, 8]}');
    expect(cabinetSource).toContain('LIGHT_POLE_Y + LIGHT_DOME_STEP * 2');
    expect(cabinetSource).not.toContain('0.55, 8]');
  });
});

// ============================================================
// 读数区布局稳定性：滑台走到终点时 UI 不得跳变
//
// 旧版把 5 个 badge 塞进一个 flex-wrap 行：脉冲数 0~87040（1~5 位）、
// 方向文案「↑ + / ↓ − / 静止」宽度不同，在左栏临界宽度处「终点」会被挤到
// 第二行，整张卡片与左栏高度跳变 28px。现在数值一行、传感器一行，
// 且数值字段定宽 + 等宽数字，行数与每行宽度都与运行状态无关。
// ============================================================

describe('读数区布局稳定性（防回退）', () => {
  /** 取出整个 data-readout 容器块（含其 className），用于禁止 flex-wrap 回退 */
  const readoutBlock = controlSource.slice(
    controlSource.indexOf('<div className="mt-1 space-y-1" data-readout'),
    controlSource.indexOf('progress-bar mt-1'),
  );

  it('手动面板读数区固定两行、不再有 flex-wrap 换行判定', () => {
    expect(readoutBlock).toContain('data-readout');
    expect(readoutBlock).toContain('space-y-1');
    expect(readoutBlock).not.toContain('flex-wrap');
    // 两行：数值行 + 传感器行
    expect((readoutBlock.match(/flex items-center gap-1 min-w-0/g) || []).length).toBe(2);
  });

  it('读数区每个变化数值都由 ReadoutNum 定宽，方向 badge 居中定宽', () => {
    expect(readoutBlock).toContain('<ReadoutNum value={encoderPulses} digits={5} />');
    expect(readoutBlock).toContain('DIRECTION_BADGE_CLS');
    expect(controlSource).toContain('<ReadoutNum value={magStock[mag]} digits={2} />');
    expect(statusSource).toContain('<ReadoutNum value={encoderPulses} digits={5} />');
    expect(simSource).toContain('<ReadoutNum value={encoderPulses} digits={5} />');
    expect(demoSource).toContain('<ReadoutNum value={encoderPulses} digits={5} />');
  });

  it('四个面板都不再把变长数值直接插进 flex-wrap badge', () => {
    [controlSource, statusSource, simSource, demoSource].forEach((src) => {
      expect(src).toContain("from './ReadoutNum'");
    });
    expect(statusSource).toContain('料斗 <ReadoutNum');
    expect(statusSource).toContain('仓内 <ReadoutNum');
    expect(demoSource).toContain('轮次 <ReadoutNum');
    expect(demoSource).toContain('料斗 <ReadoutNum');
  });

  it('ReadoutNum 用 ch 定宽且 digits 与 32 位行程上限一致', () => {
    expect(readoutSource).toContain('minWidth: `${digits + 0.6}ch`');
    expect(readoutSource).toContain('tabular-nums');
    expect(readoutSource).toContain('whitespace-nowrap');
    expect(readoutSource).toContain('DIRECTION_BADGE_CLS');
    expect(readoutSource).toContain('DIRECTION_BADGE_WIDE_CLS');
    // 87040 是 5 位十进制，digits=5 必须能容纳
    expect(String((1.95 - 0.25) * PULSES_PER_M).length).toBe(5);
  });

  it('.badge 全局等宽数字 + 不换行，避免数字位数改变 badge 宽度', () => {
    const badgeRule = cssSource.slice(cssSource.indexOf('.badge {'), cssSource.indexOf('.badge-green'));
    expect(badgeRule).toContain('font-variant-numeric: tabular-nums');
    expect(badgeRule).toContain('white-space: nowrap');
  });

  it('演示/仿真的方向文案也有定宽，阶段文案定宽居中', () => {
    expect(demoSource).toContain('DIRECTION_BADGE_CLS');
    expect(demoSource).toContain('min-w-[5.2rem] justify-center');
    expect(simSource).toContain('DIRECTION_BADGE_WIDE_CLS');
  });
});
