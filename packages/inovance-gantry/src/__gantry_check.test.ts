/**
 * 汇川龙门 XY 象棋分拣场景防回退自检：
 * 变量命名、position 坐标驱动、完整吸取流程、观众镜像与平台壳接线。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGantryStore, exportGantrySnapshot } from './stores/useGantryStore';
import {
  GANTRY_AXIS, GANTRY_BOARD, CHESS_POSITIONS, INITIAL_PIECES, cellToMm,
} from './constants/gantryConstants';
import {
  GANTRY_HOLDING_REGISTERS, GANTRY_COILS, ETHERCAT_PDO_MAP,
  GANTRY_PHASE, splitDint, joinDint,
} from './constants/gantryVariables';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

beforeEach(() => { useGantryStore.getState().resetAll(); });

const runFrames = (n: number) => {
  for (let i = 0; i < n; i += 1) useGantryStore.getState().tick(1 / 60);
};

describe('常量与变量命名（单一来源）', () => {
  it('沿用旧龙门口径：450/600/50mm 行程、3x3 教学落点、40mm 格距、A1~C3', () => {
    expect(GANTRY_AXIS.X_TRAVEL).toBe(450);
    expect(GANTRY_AXIS.Y_TRAVEL).toBe(600);
    expect(GANTRY_AXIS.Z_STROKE).toBe(50);
    expect(GANTRY_BOARD.CELL_SPACING).toBe(40);
    // 实物照片是多格深棕棋盘，视觉 8x8；教学落点仍 3x3
    expect(GANTRY_BOARD.VISUAL_ROWS).toBe(8);
    expect(GANTRY_BOARD.VISUAL_COLS).toBe(8);
    expect(CHESS_POSITIONS).toHaveLength(9);
    expect(CHESS_POSITIONS[0].label).toBe('A1');
    expect(CHESS_POSITIONS[8].label).toBe('C3');
    expect(cellToMm(0, 0)).toEqual({ x: 120, y: 120 });
    expect(cellToMm(2, 2)).toEqual({ x: 200, y: 200 });
    expect(INITIAL_PIECES).toHaveLength(3);
  });

  it('position 坐标变量：X/Y DINT 低字在前，线圈与 PDO 映射齐备', () => {
    expect(GANTRY_HOLDING_REGISTERS.GANTRY_X_POS_L).toBe(200);
    expect(GANTRY_HOLDING_REGISTERS.GANTRY_X_POS_H).toBe(201);
    expect(GANTRY_HOLDING_REGISTERS.GANTRY_Y_POS_L).toBe(202);
    expect(GANTRY_HOLDING_REGISTERS.GANTRY_Y_POS_H).toBe(203);
    expect(Object.keys(GANTRY_COILS)).toContain('GANTRY_CYL_DOWN');
    expect(Object.keys(GANTRY_COILS)).toContain('GANTRY_VACUUM');
    expect(ETHERCAT_PDO_MAP.length).toBeGreaterThanOrEqual(11);
    expect(ETHERCAT_PDO_MAP[0].signal).toBe('GANTRY_X_POS_DINT');
    const [lo, hi] = splitDint(0x12345678);
    expect([lo, hi]).toEqual([0x5678, 0x1234]);
    expect(joinDint(lo, hi)).toBe(0x12345678);
  });

  it('ETHERCAT 只是变量/信号映射声明，不含任何底层链路实现', () => {
    const vars = read('packages/inovance-gantry/src/constants/gantryVariables.ts');
    expect(vars).toContain('仅声明，不实现链路');
    expect(vars).not.toMatch(/net\.Socket|createConnection|EtherCATMaster|writePdo|socket\.connect/);
    const store = read('packages/inovance-gantry/src/stores/useGantryStore.ts');
    expect(store).not.toMatch(/net\.Socket|modbus-serial|EtherCAT/);
  });
});

describe('position 坐标变量驱动', () => {
  it('外部 PLC 写坐标帧直接改变 x/y position 真值', () => {
    useGantryStore.getState().setPlcFrame({ xPos: 233, yPos: 188, zPos: 25 });
    const s = useGantryStore.getState();
    expect(s.x.position).toBe(233);
    expect(s.y.position).toBe(188);
    expect(s.z).toBe(25);
    expect(s.controlSource).toBe('plc');
  });

  it('坐标被行程钳制，非法值不污染状态', () => {
    useGantryStore.getState().setPlcFrame({ xPos: 9999, yPos: -50 });
    const s = useGantryStore.getState();
    expect(s.x.position).toBe(GANTRY_AXIS.X_TRAVEL);
    expect(s.y.position).toBe(0);
  });

  it('本地点动通过 target 斜坡逼近，不瞬间跳变', () => {
    useGantryStore.getState().setControlSource('local');
    useGantryStore.getState().setXTarget(120);
    runFrames(1);
    expect(useGantryStore.getState().x.position).toBeGreaterThan(0);
    expect(useGantryStore.getState().x.position).toBeLessThan(120);
    runFrames(120);
    expect(useGantryStore.getState().x.position).toBeCloseTo(120, 1);
  });
});

describe('吸取 → 移动 → 放置流程', () => {
  it('默认从 A1 吸取并放到 C1，棋子位置与吸取/释放状态同步更新', () => {
    const before = useGantryStore.getState().pieces[0];
    expect(before.label).toBe('A1');
    expect(before.held).toBe(false);
    useGantryStore.getState().startAuto();

    let sawHeld = false;
    let sawMove = false;
    for (let i = 0; i < 3000; i += 1) {
      useGantryStore.getState().tick(1 / 60);
      const s = useGantryStore.getState();
      if (s.heldPieceId) sawHeld = true;
      if (sawHeld && s.x.position > 100 && s.y.position > 130) sawMove = true;
      if (s.phase === GANTRY_PHASE.IDLE && !s.autoRunning) break;
    }
    const s = useGantryStore.getState();
    expect(sawHeld).toBe(true);
    expect(sawMove).toBe(true);
    expect(s.heldPieceId).toBeNull();
    expect(s.suction.vacuum).toBe(false);
    expect(s.cylinder.extended).toBe(false);
    expect(s.phase).toBe(GANTRY_PHASE.IDLE);
    const moved = s.pieces.find((p) => p.id === 'piece-1')!;
    expect(moved.label).toBe('C1');
    expect(moved.row).toBe(2);
    expect(moved.col).toBe(0);
    expect(moved.held).toBe(false);
    expect(moved.x).toBe(cellToMm(2, 0).x);
    expect(moved.y).toBe(cellToMm(2, 0).y);
    // 其余两颗棋子不受影响
    expect(s.pieces.find((p) => p.id === 'piece-2')!.label).toBe('B2');
  });

  it('急停冻结流程，复位回到初始三颗棋子', () => {
    useGantryStore.getState().startAuto();
    runFrames(30);
    const before = useGantryStore.getState().x.position;
    useGantryStore.getState().setEstop(true);
    runFrames(60);
    expect(useGantryStore.getState().x.position).toBe(before);
    expect(useGantryStore.getState().autoRunning).toBe(false);
    useGantryStore.getState().resetAll();
    expect(useGantryStore.getState().pieces[0].label).toBe('A1');
    expect(useGantryStore.getState().x.position).toBe(0);
  });
});

describe('观众镜像与平台壳接线', () => {
  it('exportSnapshot / applyBroadcast 键成对，全数值键', () => {
    const snap = exportGantrySnapshot();
    expect(Object.keys(snap).length).toBeGreaterThan(12);
    for (const v of Object.values(snap)) expect(typeof v).toBe('number');
    useGantryStore.getState().setPlcFrame({ xPos: 300, yPos: 240 });
    const changed = exportGantrySnapshot();
    useGantryStore.getState().resetAll();
    useGantryStore.getState().applyBroadcast(changed);
    expect(useGantryStore.getState().x.position).toBe(300);
    expect(useGantryStore.getState().y.position).toBe(240);
    const store = read('packages/inovance-gantry/src/stores/useGantryStore.ts');
    // 棋子键是模板字符串动态生成的，单独校验模板；其余键必须是源码字面量
    for (const k of Object.keys(changed).filter((k) => !k.startsWith('GANTRY_PIECE_'))) {
      expect(store).toContain(k);
    }
    expect(store).toContain('GANTRY_PIECE_${i + 1}_ROW');
    expect(store).toContain('num(`GANTRY_PIECE_${i + 1}_ROW`)');
  });

  it('平台壳五处接线齐全，其它场景零龙门残留', () => {
    expect(read('packages/platform/src/registry.ts')).toContain('inovanceGantryDevice');
    expect(read('packages/platform/package.json')).toContain('@digital-twin/inovance-gantry');
    expect(read('packages/platform/vite.config.ts')).toContain("'@digital-twin/inovance-gantry'");
    expect(read('packages/platform/tsconfig.app.json')).toContain('"@digital-twin/inovance-gantry"');
    expect(read('packages/platform/src/index.css')).toContain('../../inovance-gantry/src');
    for (const p of ['conveyor-sorting', 'auto-dispensing', 'md520-vfd']) {
      const idx = read(`packages/${p}/src/index.ts`);
      expect(idx).not.toContain('GANTRY_');
      expect(idx).not.toContain('inovance-gantry');
    }
  });

  it('3D 只读 position 坐标变量，不在场景里另算位置', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    expect(scene).toContain('useGantryStore.getState()');
    expect(scene).toContain('s.y.position');
    expect(scene).toContain('s.x.position');
    expect(scene).toContain('s.z');
    expect(scene).not.toContain('useGLTF');
  });

  it('3D 结构按 Inovance.STEP 真实装配树：焊接台体 / 一侧 Y 模组 + 一侧 D20 从动导轨 / X 模组横梁 / 气缸吸盘', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    for (const t of [
      'WeldedTable', '台体', 'Y 轴线性模组-600', 'HG-KR43 伺服', 'D20 直线导轨',
      '导轨固定板', 'X 直线模组-450', '200W 伺服', '气缸吸盘支架', '吸盘',
      'Z_HEAD_BASE', 'yBridge', 'xSlider', 'zHead',
    ]) expect(scene).toContain(t);
    // 两端竖立支撑把横梁落到滑座上，不再是旧的「四角立柱 + 两条等粗光杆」
    expect(scene).toContain('gantry-post-');
    expect(scene).toContain('POST_BOTTOM');
    expect(scene).not.toContain('四角立柱');
  });

  it('3D 外观：深棕多格棋盘小桌 / 黑吸盘 + 青色气管 / 铝银灰整板 + 细 T 槽线', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    for (const t of [
      '深棕多格棋盘', '黑色波纹橡胶吸盘', '青色气管', '铝银灰整板', '细 T 槽线',
      'VISUAL_ROWS', 'VISUAL_COLS', 'boardEdge', 'C.hose', 'C.cup',
    ]) expect(scene).toContain(t);
  });

  it('按用户要求去掉所有非必要装饰件', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    for (const t of [
      'SupportColumn', 'function Sensor', '<Sensor', 'C.column', 'C.sensor', 'ref={fan}',
      'HmiPanel', 'PlcIoBoard', 'DragChain', 'chain-l-',
    ]) expect(scene).not.toContain(t);
    expect(scene).toContain('低调深灰伺服端盖');
  });

  it('视觉接入共享工业视觉令牌：与传送带 / 配药同一套结构色与三点布光', () => {
    const c = read('packages/inovance-gantry/src/constants/gantryConstants.ts');
    expect(c).toContain("from '@digital-twin/shared'");
    for (const t of ['INDUSTRIAL_VISUAL', 'INDUSTRIAL_LIGHTING', 'INDUSTRIAL_DETAIL', '...INDUSTRIAL_VISUAL']) {
      expect(c).toContain(t);
    }
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    expect(scene).toContain('GANTRY_VISUAL.SCENE_LIGHTING');
    for (const t of ['L.ambient', 'L.key', 'L.fillColor', 'GANTRY_VISUAL.BASE_COLOR']) expect(scene).toContain(t);
    const wrapper = read('packages/inovance-gantry/src/platform/GantrySceneWrapper.tsx');
    expect(wrapper).toContain('GANTRY_VISUAL.SCENE_BACKGROUND');
  });

  it('黑色坦克链（拖链）按用户要求移除', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    expect(scene).not.toContain('DragChain');
    expect(scene).not.toContain('chain-l-');
    expect(scene).not.toContain('C.chain');
    expect(scene).toContain('坦克链');
  });

  it('Z 高度按真实行程标定：下降 50mm 后吸盘底面贴近棋子顶面', () => {
    const scene = read('packages/inovance-gantry/src/scenes/GantrySceneContent.tsx');
    const frame = 0.52;
    const base = -0.104;
    const suctionUp = frame + base - 0.091;
    const suctionDown = suctionUp - GANTRY_AXIS.Z_STROKE * GANTRY_AXIS.MM2M * 2;
    const pieceTop = 0.16 + 0.028 + 0.037;
    expect(Math.abs(suctionDown - pieceTop)).toBeLessThan(0.005);
    expect(scene).toContain('suctionBottomDown');
    expect(scene).toContain('pieceTop');
  });
});
