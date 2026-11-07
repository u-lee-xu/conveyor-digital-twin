/**
 * 手动模式「PLC 单点 I/O 操作台」自检。
 *
 * 手动模式的语义是「面板按键 ≡ 直接置位/复位 PLC 输出线圈」，因此这里要守住三件事：
 *   1. 面板上的地址必须来自 constants.ts 的三张协议地址表，不能在 JSX 里回填 'Y2' / 'C32'；
 *   2. 输入点（X）电平由纯函数读取，编码器位镜像与 HR120 低 8 位严格一致；
 *   3. UI 紧凑化不能回退：只渲染两张卡、输入点三列、地址可见、手动模式不展示自动流程状态；
 *   4. 滑台点动必须是一次点击 10mm 的离散脉冲，不能退回 rAF 连续速度。
 * 另外把「信号灯塔抬高」也锁进断言，防止后续改常量又让灯头与立杆脱开或被展台裁切。
 */
import { describe, it, expect } from 'vitest';
import {
  MODBUS_READ_VARS, MITSUBISHI_READ_VARS, MITSUBISHI_WRITE_VARS,
  LIGHT_POLE_Y, LIGHT_POLE_H, LIGHT_DOME_R, LIGHT_DOME_STEP, PART_STAGES,
  MANUAL_JOG, PULSES_PER_M, HOPPER, MAGAZINE_X, SCREW_DETAIL,
  type MagazineId,
} from './scenes/auto-dispensing/constants';
import {
  MANUAL_OUTPUT_POINTS, MANUAL_INPUT_POINTS, MANUAL_IO_SUMMARY,
  IO_GROUP_TITLES, inputPointLevel, outputPointLevel, encoderBits,
  type InputSnapshot, type OutputSnapshot,
} from './scenes/auto-dispensing/manualIo';

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

/** Vite 的 import.meta.glob 只接受静态字面量，逐个文件分别声明 */
const globs: Record<string, Record<string, string>> = {
  './App.tsx': import.meta.glob<string>('./App.tsx', { query: '?raw', import: 'default', eager: true }),
  './platform/PlatformModePanels.tsx': import.meta.glob<string>('./platform/PlatformModePanels.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseControlPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseControlPanel.tsx', { query: '?raw', import: 'default', eager: true }),
  './scenes/auto-dispensing/panels/DispenseStatusPanel.tsx': import.meta.glob<string>('./scenes/auto-dispensing/panels/DispenseStatusPanel.tsx', { query: '?raw', import: 'default', eager: true }),
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
const cabinetSource = rawSource('./scenes/auto-dispensing/components/ControlCabinet.tsx');
const loopSource = rawSource('./scenes/auto-dispensing/hooks/useDispenseLoop.ts');
const storeSource = rawSource('./stores/useDispensingStore.ts');

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

  it('输入点逐项对应三菱 X 地址与 Modbus 线圈号，且覆盖编码器 8 位镜像', () => {
    expect(MANUAL_INPUT_POINTS).toHaveLength(Object.keys(MITSUBISHI_READ_VARS).length);
    MANUAL_INPUT_POINTS.forEach((p) => {
      expect(p.addr).toBe(MITSUBISHI_READ_VARS[p.key as keyof typeof MITSUBISHI_READ_VARS]);
      expect(p.coil).toBe(`C${MODBUS_READ_VARS[p.key as keyof typeof MODBUS_READ_VARS]}`);
      expect(p.label.length).toBeGreaterThan(0);
      expect(IO_GROUP_TITLES[p.group].length).toBeGreaterThan(0);
      expect(p.addr).toMatch(/^X\d+$/);
    });
    expect(MANUAL_INPUT_POINTS.filter((p) => p.group === 'encoder')).toHaveLength(8);
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

  it('ENCODER_BIT0..7 是 HR120 脉冲数的低 8 位位镜像', () => {
    [0, 1, 5, 90, 170, 255].forEach((pulses) => {
      const s = makeInput();
      s.encoderPulses = pulses;
      const bits = encoderBits(pulses);
      expect(bits).toHaveLength(8);
      for (let bit = 0; bit < 8; bit += 1) {
        expect(inputPointLevel(`ENCODER_BIT${bit}`, s), `pulses=${pulses} bit=${bit}`).toBe(bits[bit]);
      }
    });
    expect(inputPointLevel('ENCODER_BIT0', (() => { const s = makeInput(); s.encoderPulses = 2; return s; })())).toBe(false);
    expect(inputPointLevel('ENCODER_BIT1', (() => { const s = makeInput(); s.encoderPulses = 2; return s; })())).toBe(true);
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
    // 双点行（电机正/反转）必须把两个线圈号都拼出来，不能只显示 points[0].coil
    expect(controlSource).toContain('const coils = points.map');
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

  it('输入点每点都显示地址，按组三列排布，不再只塞在 title 里', () => {
    expect(statusSource).toContain('point.addr');
    expect(statusSource).toContain('grid-cols-3');
    expect(statusSource).toContain('inputPointLevel(point.key, snapshot)');
    expect(statusSource).toContain('IO_GROUP_TITLES[group]');
    expect(statusSource).not.toContain('grid-cols-2');
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
// 滑台点动：单击一次只走 1 个编码器脉冲
// ============================================================

describe('手动点动：单击 10mm 精确步进', () => {
  it('步长 = 1 个 HR120 脉冲，且远小于料斗半宽与药仓间距', () => {
    expect(MANUAL_JOG.STEP * PULSES_PER_M).toBeCloseTo(1, 12);
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
