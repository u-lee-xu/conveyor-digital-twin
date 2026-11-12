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
import { GANTRY_WORD_VARIABLES, GANTRY_ADDRESS_ROWS } from './constants/gantryVariables';

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
  it('点动 / 回原点 / position 赋值 / 一键定位 / 传感器状态齐备', () => {
    const manual = read(`${PANEL}GantryManualPanel.tsx`);
    expect(manual).toContain('aria-label="回原点"');
    expect(manual).toContain('aria-label="position赋值"');
    expect(manual).toContain('setManualPosition');
    expect(manual).toContain('<CellGrid');
    expect(manual).toContain('<GantryStatusPanel');
    expect(manual).toContain('aria-label="X轴左移"');
    expect(manual).toContain('aria-label="气缸下降"');
    expect(manual).toContain('aria-label="真空吸盘"');
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

  it('position 赋值同步 position 与 target，下一帧斜坡不把值拉回', () => {
    useGantryStore.getState().setManualPosition(120, 160);
    let s = useGantryStore.getState();
    expect(s.x.position).toBe(120);
    expect(s.x.target).toBe(120);
    expect(s.y.position).toBe(160);
    expect(s.y.target).toBe(160);
    s.tick(1 / 60);
    s = useGantryStore.getState();
    expect(s.x.position).toBe(120);
    expect(s.y.position).toBe(160);
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

describe('仿真模式与方案 A 虚拟 PLC', () => {
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
    expect(Object.keys(GANTRY_WORD_VARIABLES)).toHaveLength(7);
  });

  it('连接预设指向 :1509，并下发设备自己的单字变量表', () => {
    const conn = read(`${PANEL}GantryPlcConnection.tsx`);
    expect(conn).toContain('1509');
    expect(conn).toContain('wordVariables: GANTRY_WORD_VARIABLES');
    expect(conn).toContain("protocol: 'modbus'");
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
});
