/**
 * 汇川龙门 XY：三模式 UI 与方案 A 仿真 PLC 防回退自检。
 * 覆盖：模式注册与收口、手动 position 赋值 / 一键定位 / 传感器读数、
 * 演示循环搬运、仿真变量地址表、:1509 独立虚拟 PLC 与 300ms 轮询链路。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGantryStore, exportGantrySnapshot } from './stores/useGantryStore';
import { GANTRY_DEMO_SEQUENCE } from './constants/gantryConstants';
import {
  GANTRY_WORD_VARIABLES, GANTRY_ADDRESS_ROWS, GANTRY_SENSOR_FEEDBACK,
  gantrySensorBits, gantryBoolVarsFor,
} from './constants/gantryVariables';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const PANEL = 'packages/inovance-gantry/src/platform/';
const IDX = 'packages/inovance-gantry/src/index.ts';

beforeEach(() => { useGantryStore.getState().resetAll(); });

describe('三模式注册与切换收口', () => {
  it('手动 / 演示 / 仿真三档，仿真需要连接，评分不做', () => {
    const idx = read(IDX);
    expect(idx).toContain("id: 'manual'");
    expect(idx).toContain("id: 'auto'");
    expect(idx).toContain("id: 'sim'");
    expect(idx).toContain("label: '仿真'");
    expect(idx).toContain('needsConnection: true');
    expect(idx).not.toContain("id: 'scoring'");
  });

  it('切模式 / 退出工作区都停演示、断 PLC、清连接态', () => {
    const idx = read(IDX);
    expect(idx).toContain('onModeChange: stopAndDisconnect');
    expect(idx).toContain('store.stopDemo()');
    expect(idx).toContain('store.stopAuto()');
    expect(idx).toContain('setPlcConnected(false)');
    expect(idx).toContain('modbusService.disconnect()');
    expect(idx).toContain('resetAll()');
  });

  it('模式面板是三路分发器，不残留单面板结构', () => {
    const mode = read(`${PANEL}GantryModePanel.tsx`);
    expect(mode).toContain('GantryManualPanel');
    expect(mode).toContain('GantryDemoPanel');
    expect(mode).toContain('GantrySimPanel');
    expect(mode).toContain("mode === 'sim'");
  });

  it('三个模式共用同一外壳，data-dt-gantry-panel 锚点唯一', () => {
    const idx = read(IDX);
    expect(idx).toContain('GantryModePanel');
    expect((idx.match(/panel: GantryModePanel/g) || [])).toHaveLength(3);
    expect(read(`${PANEL}GantryModePanel.tsx`)).toContain('data-dt-gantry-panel');
  });
});

describe('手动模式', () => {
  it('点动 / 回原点 / position 置零 / 一键定位 / 传感器状态齐备', () => {
    const manual = read(`${PANEL}GantryManualPanel.tsx`);
    expect(manual).toContain('aria-label="回原点"');
    expect(manual).toContain('aria-label="position赋值"');
    expect(manual).toContain('aria-label="设0.0点"');
    expect(manual).toContain('setPositionZero(0, 0)');
    expect(manual).toContain('<CellGrid');
    expect(manual).toContain('<GantryStatusPanel');
    expect(manual).toContain('aria-label="X轴左移"');
    expect(manual).toContain('aria-label="气缸下降"');
    expect(manual).toContain('aria-label="真空吸盘"');
    expect(manual).toContain('x.position - zeroX');
    expect(manual).not.toContain('setManualPosition');
  });

  it('只读状态区的 position 也是相对读数，另有隐藏机床坐标供验收', () => {
    const parts = read(`${PANEL}GantryPanelParts.tsx`);
    expect(parts).toContain('(x.position - zeroX).toFixed(1)');
    expect(parts).toContain('(y.position - zeroY).toFixed(1)');
    expect(parts).toContain('data-dt-gantry-machine');
  });

  it('不做伺服使能，也不做「选择吸取放置格 + 一次性吸取放置」', () => {
    const manual = read(`${PANEL}GantryManualPanel.tsx`);
    expect(manual).not.toContain('setServoEnable');
    expect(manual).not.toContain('selectPick');
    expect(manual).not.toContain('selectPlace');
    expect(manual).not.toContain('一次性');
  });

  it('状态区显示两轴共 6 路传感器', () => {
    const parts = read(`${PANEL}GantryPanelParts.tsx`);
    expect(parts).toContain('data-dt-gantry-sensors-x');
    for (const key of ['xOrigin', 'xEndMinus', 'xEndPlus', 'origin', 'endMinus', 'endPlus']) {
      expect(parts).toContain(key);
    }
  });

  /** 用户口径：手工定义 0.0 点 = 把当前位置设成 0.0，机构不动；之后 XY 移动读数相对增减 */
  it('设 0.0 点只写零点偏置，机构零位移，之后读数随移动增减且可为负', () => {
    const store = useGantryStore.getState();
    store.setXTarget(160);
    store.setYTarget(160);
    for (let i = 0; i < 200; i += 1) useGantryStore.getState().tick(1 / 60);
    let s = useGantryStore.getState();
    expect(s.x.position).toBeCloseTo(160, 1);
    expect(s.y.position).toBeCloseTo(160, 1);

    s.setPositionZero(0, 0);
    s = useGantryStore.getState();
    // 关键：机械真值与 target 一个都不改，3D 不会跳回机床零点
    expect(s.x.position).toBeCloseTo(160, 1);
    expect(s.x.target).toBe(160);
    expect(s.y.position).toBeCloseTo(160, 1);
    expect(s.zeroX).toBeCloseTo(160, 1);
    expect(s.zeroY).toBeCloseTo(160, 1);
    const readX = () => {
      const st = useGantryStore.getState();
      return st.x.position - st.zeroX;
    };
    expect(readX()).toBeCloseTo(0, 1);

    // 向零点负方向点动 10mm → 读数 -10
    s.setXTarget(s.x.position - 10);
    for (let i = 0; i < 30; i += 1) useGantryStore.getState().tick(1 / 60);
    expect(readX()).toBeCloseTo(-10, 1);
    expect(useGantryStore.getState().x.position).toBeCloseTo(150, 1);

    // 反向两次 +10 → 读数 +10
    for (let n = 0; n < 2; n += 1) {
      const cur = useGantryStore.getState();
      cur.setXTarget(cur.x.position + 10);
      for (let i = 0; i < 30; i += 1) useGantryStore.getState().tick(1 / 60);
    }
    expect(readX()).toBeCloseTo(10, 1);
    expect(useGantryStore.getState().x.position).toBeCloseTo(170, 1);
  });

  it('设当前点为任意读数同样是写偏置，不把机构挪到该坐标', () => {
    const store = useGantryStore.getState();
    store.setXTarget(100);
    for (let i = 0; i < 120; i += 1) useGantryStore.getState().tick(1 / 60);
    store.setPositionZero(50, 25);
    const s = useGantryStore.getState();
    expect(s.x.position).toBeCloseTo(100, 1);
    expect(s.zeroX).toBeCloseTo(50, 1);
    expect(s.zeroY).toBeCloseTo(-25, 1);
    expect(s.x.position - s.zeroX).toBeCloseTo(50, 1);
  });

  it('零点偏置进观众快照 / 广播，键名成对；全部复位清除偏置', () => {
    useGantryStore.getState().setPositionZero(0, 0);
    const snap = exportGantrySnapshot();
    expect(snap).toHaveProperty('GANTRY_ZERO_X');
    expect(snap).toHaveProperty('GANTRY_ZERO_Y');
    useGantryStore.getState().applyBroadcast({ GANTRY_ZERO_X: 12, GANTRY_ZERO_Y: -8 });
    expect(useGantryStore.getState().zeroX).toBe(12);
    expect(useGantryStore.getState().zeroY).toBe(-8);
    useGantryStore.getState().resetAll();
    expect(useGantryStore.getState().zeroX).toBe(0);
    expect(useGantryStore.getState().zeroY).toBe(0);
  });
});

describe('演示模式：循环搬运', () => {
  it('启停 / 暂停 / 轮次 / 复位控件与状态读数齐备', () => {
    const demo = read(`${PANEL}GantryDemoPanel.tsx`);
    expect(demo).toContain('aria-label="演示启动"');
    expect(demo).toContain('aria-label="演示暂停"');
    expect(demo).toContain('aria-label="演示复位"');
    expect(demo).toContain('setDemoRounds');
    expect(demo).toContain('data-dt-gantry-demo-running');
    expect(demo).toContain('<GantryStatusPanel');
    expect(GANTRY_DEMO_SEQUENCE).toHaveLength(3);
  });

  it('startDemo → advanceDemo 触发一次自动流程，轮次与计数推进', () => {
    const s = useGantryStore.getState();
    s.setDemoRounds(2);
    s.startDemo();
    expect(useGantryStore.getState().demoRunning).toBe(true);
    s.advanceDemo();
    const st = useGantryStore.getState();
    expect(st.autoRunning).toBe(true);
    expect(st.demoCompleted).toBe(1);
    expect(st.pickCell).toEqual({ row: 0, col: 0 });
    expect(st.placeCell).toEqual({ row: 2, col: 0 });
    st.stopDemo();
    expect(useGantryStore.getState().demoRunning).toBe(false);
  });

  it('演示状态进观众只读镜像，数值键成对', () => {
    const snap = exportGantrySnapshot();
    expect(snap).toHaveProperty('GANTRY_DEMO_RUNNING');
    expect(snap).toHaveProperty('GANTRY_DEMO_ROUND');
    expect(snap).toHaveProperty('GANTRY_DEMO_COMPLETED');
  });
});

describe('仿真模式与 PLC 交互', () => {
  it('仿真面板常驻三协议变量地址表、位置寄存器与只读状态', () => {
    const sim = read(`${PANEL}GantrySimPanel.tsx`);
    expect(sim).toContain('<GantryPlcConnection');
    expect(sim).toContain('<GantryVariableTable');
    expect(sim).toContain('<GantryStatusPanel');
    expect(sim).toContain('位置数据寄存器');
    const parts = read(`${PANEL}GantryPanelParts.tsx`);
    for (const header of ['信号', '三菱 FX', 'Modbus TCP', 'Siemens S7']) {
      expect(parts).toContain(header);
    }
    expect(GANTRY_ADDRESS_ROWS.length).toBeGreaterThanOrEqual(10);
    // 7 个位置/阶段字 + PLC 显式下发的吸取格 / 放置格
    expect(Object.keys(GANTRY_WORD_VARIABLES)).toHaveLength(9);
  });

  it('仿真模式只对接 PLC 仿真软件 :502，不再列内置虚拟 PLC :1509 预设', () => {
    const conn = read(`${PANEL}GantryPlcConnection.tsx`);
    expect(conn).toContain('PLC 仿真软件 (Modbus TCP :502)');
    expect(conn).toContain('汇川H5U (Modbus :502)');
    expect(conn).toContain('汇川EASY (Modbus :502)');
    expect(conn).toContain('S7-PLCSIM');
    expect(conn).toContain('GX Simulator2');
    expect(conn).toContain('port: 502');
    expect(conn).not.toContain('port: 1509');
    // 默认第一项就是 502，仿真模式开箱指向 PLC 仿真软件
    expect(conn).toContain('initialConfig={PRESETS[0].config}');
    expect(conn).toContain('wordVariables: GANTRY_WORD_VARIABLES');
    expect(conn).toContain("protocol: 'modbus'");
  });

  it('start-lab 默认不启龙门内置靶机，只在显式开关下起', () => {
    const lab = read('scripts/start-lab.cjs');
    expect(lab).toContain('默认起 8 个进程');
    expect(lab).toContain('DT_ENABLE_GANTRY_MOCK');
    expect(lab).toContain('GANTRY_MOCK_ENABLED');
    expect(lab).toContain('if (GANTRY_MOCK_ENABLED)');
  });

  it('虚拟 PLC :1509 绑回环、跑 100ms 参考程序、不实现 EtherCAT 链路', () => {
    const plc = read('websocket-server/mock-gantry-server.js');
    expect(plc).toContain("host: '127.0.0.1'");
    expect(plc).toContain('setInterval(gantryPlcScan, 100)');
    expect(plc).toContain("role: 'virtual-plc'");
    expect(plc).toContain('GANTRY_X_POS');
    expect(plc).toContain('externalPosUntil');
    expect(plc).toContain('MAIN_COMMANDS');
    expect(plc).not.toMatch(/EtherCATMaster|writePdo|net\.Socket/);
  });

  it('start-lab 起第 9 进程并做端口预检，状态口 5089 独立', () => {
    const lab = read('scripts/start-lab.cjs');
    expect(lab).toContain('GANTRY_PLC_PORT = 1509');
    expect(lab).toContain('GANTRY_HTTP_PORT = 5089');
    expect(lab).toContain('mock-gantry-server.js');
    expect(lab).toContain('portBusy(GANTRY_PLC_PORT)');
    expect(lab).toContain('portBusy(GANTRY_HTTP_PORT)');
  });

  it('effects 300ms 读回 7 个字变量并写回 position 坐标变量', () => {
    const effects = read(`${PANEL}GantryDeviceEffects.tsx`);
    expect(effects).toContain('readWords(WORD_NAMES)');
    expect(effects).toContain('setPlcFrame');
    expect(effects).toContain('DOWN_PHASES');
    expect(effects).toContain('}, 300)');
    expect(effects).toContain('isViewerRuntime()');
  });

  it('仿真模式 Z 由 PLC 给定直接驱动，本地斜坡不再改写', () => {
    useGantryStore.getState().setPlcFrame({
      xPos: 200, yPos: 220, zPos: 30, cylinderDown: false,
    });
    expect(useGantryStore.getState().controlSource).toBe('plc');
    useGantryStore.getState().tick(1 / 60);
    const s = useGantryStore.getState();
    expect(s.z).toBe(30);
    expect(s.x.position).toBe(200);
    expect(s.y.position).toBe(220);
  });

  it('PLC 显式下发吸取 / 放置目标格，浏览器不靠滞后坐标猜棋子', () => {
    const vars = read('packages/inovance-gantry/src/constants/gantryVariables.ts');
    expect(vars).toContain('GANTRY_PICK_CELL');
    expect(vars).toContain('GANTRY_PLACE_CELL');
    expect(read('websocket-server/mock-gantry-server.js')).toContain('GANTRY_PICK_CELL: 211');
    expect(read(`${PANEL}GantryDeviceEffects.tsx`)).toContain('pickCell: num(');
    const store = read('packages/inovance-gantry/src/stores/useGantryStore.ts');
    expect(store).toContain("if (s.controlSource === 'plc')");
    expect(store).toContain('pieceAt(pieces, c.x, c.y)');
  });

  it('仿真模式：真空边沿完成吸取 → 跟随吸盘 → 放置，格子与标签同步', () => {
    const store = useGantryStore.getState();
    // PLC 给定：吸盘在 A1(120,120) 且 Z 到底，目标 A1→C1（编码 0 / 6），真空 ON
    store.setPlcFrame({
      xPos: 120, yPos: 120, zPos: 50,
      xTarget: 120, yTarget: 120,
      cylinderDown: true, vacuum: true,
      pickCell: 0, placeCell: 6,
    });
    useGantryStore.getState().tick(1 / 60);
    let s = useGantryStore.getState();
    expect(s.controlSource).toBe('plc');
    expect(s.heldPieceId).toBe('piece-1');
    expect(s.pieces[0].held).toBe(true);

    // PLC 把吸盘移到 C1(120,200)，被吸棋子跟随坐标与 Z
    s.setPlcFrame({ xPos: 120, yPos: 200, zPos: 0, xTarget: 120, yTarget: 200, vacuum: true });
    useGantryStore.getState().tick(1 / 60);
    s = useGantryStore.getState();
    expect(s.pieces[0].x).toBeCloseTo(120, 1);
    expect(s.pieces[0].y).toBeCloseTo(200, 1);
    expect(s.pieces[0].held).toBe(true);

    // 真空 OFF → 落到 C1，更新 row / col / label / held
    s.setPlcFrame({ xPos: 120, yPos: 200, zPos: 50, vacuum: false });
    useGantryStore.getState().tick(1 / 60);
    s = useGantryStore.getState();
    expect(s.heldPieceId).toBe(null);
    expect(s.pieces[0].label).toBe('C1');
    expect(s.pieces[0].row).toBe(2);
    expect(s.pieces[0].col).toBe(0);
    expect(s.pieces[0].x).toBe(120);
    expect(s.pieces[0].y).toBe(200);
    expect(s.pieces[0].held).toBe(false);
  });

  it('6 路接近开关按 sensor→PLC 回写：Modbus 走 coils，S7 / 三菱走变量名', () => {
    expect(GANTRY_SENSOR_FEEDBACK).toHaveLength(6);
    expect(GANTRY_SENSOR_FEEDBACK[0].modbus).toBe(29);
    expect(GANTRY_SENSOR_FEEDBACK[5].modbus).toBe(34);
    expect(gantrySensorBits({
      origin: true, endMinus: false, endPlus: false,
      xOrigin: false, xEndMinus: true, xEndPlus: false,
    })).toEqual([true, false, false, false, true, false]);
    expect(gantryBoolVarsFor('modbus')).toBeUndefined();
    expect(gantryBoolVarsFor('s7')?.['GANTRY_SENSOR_ORIGIN']).toBe('M140.1');
    expect(gantryBoolVarsFor('mitsubishi')?.['GANTRY_SENSOR_X_END_PLUS']).toBe('X6');
    // 只在状态变化时发帧；写失败不更新掩码以便下轮重试
    const effects = read(`${PANEL}GantryDeviceEffects.tsx`);
    for (const t of ['writeCoils(SENSOR_COIL_BASE', 'writeVars(SENSOR_VAR_NAMES',
      'lastSensorMask', 'getProtocol()', 'gantrySensorBits', 'if (write.success)']) {
      expect(effects).toContain(t);
    }
    const conn = read(`${PANEL}GantryPlcConnection.tsx`);
    expect(conn).toContain('boolVariables');
    expect(conn).toContain('gantryBoolVarsFor');
    expect(GANTRY_ADDRESS_ROWS.find((r) => r.signal.includes('原点与限位'))?.direction).toBe('设备 → PLC');
  });
});
