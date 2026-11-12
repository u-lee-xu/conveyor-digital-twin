/**
 * 汇川龙门 XY 场景防回退自检（部件拆分后统一适配）。
 * 覆盖：变量命名、position 坐标驱动、两轴 6 路传感器与金属挡片、
 * Z 轴可伸缩活塞杆、吸取流程、观众镜像、共享视觉令牌、程序化纹理。
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGantryStore, exportGantrySnapshot } from './stores/useGantryStore';
import {
  GANTRY_AXIS, GANTRY_BOARD, CHESS_POSITIONS, INITIAL_PIECES, cellToMm,
  GANTRY_SENSOR, computeSensors, SENSOR_DETAIL, CYLINDER_DETAIL,
  CARRIAGE_DETAIL, END_SUPPORT_DETAIL, MODULE_DETAIL,
  GANTRY_VIEW_PRESETS, GANTRY_PART_STAGES, GANTRY_PART_STAGE_ORIGIN,
  isGantryPartStage, isGantryViewKey,
} from './constants/gantryConstants';
import {
  GANTRY_HOLDING_REGISTERS, GANTRY_COILS, ETHERCAT_PDO_MAP,
  GANTRY_PHASE, splitDint, joinDint,
} from './constants/gantryVariables';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const SCENE = 'packages/inovance-gantry/src/scenes/GantrySceneContent.tsx';
const COMP = 'packages/inovance-gantry/src/scenes/gantry/components/';
const SHARED = 'packages/inovance-gantry/src/scenes/shared/';

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
    expect(GANTRY_HOLDING_REGISTERS.GANTRY_Y_POS_H).toBe(203);
    expect(Object.keys(GANTRY_COILS)).toContain('GANTRY_CYL_DOWN');
    expect(ETHERCAT_PDO_MAP.length).toBeGreaterThanOrEqual(14);
    const [lo, hi] = splitDint(0x12345678);
    expect([lo, hi]).toEqual([0x5678, 0x1234]);
    expect(joinDint(lo, hi)).toBe(0x12345678);
  });

  it('ETHERCAT 只是变量/信号映射声明，不含任何底层链路实现', () => {
    const vars = read('packages/inovance-gantry/src/constants/gantryVariables.ts');
    expect(vars).toContain('仅声明，不实现链路');
    expect(vars).not.toMatch(/net\.Socket|createConnection|EtherCATMaster|writePdo|socket\.connect/);
  });

  it('部件尺寸收敛到 *_DETAIL 单一来源', () => {
    for (const k of ['BODY_W', 'BRACKET_ARM', 'FLAG_W', 'MOUNT_SIDE']) expect(SENSOR_DETAIL).toHaveProperty(k);
    for (const k of ['BODY_LEN', 'ROD_R', 'ROD_OVERLAP', 'GUIDE_X']) expect(CYLINDER_DETAIL).toHaveProperty(k);
    expect(CARRIAGE_DETAIL.W).toBeGreaterThan(0);
    expect(END_SUPPORT_DETAIL.W).toBeGreaterThan(0);
    expect(MODULE_DETAIL.HALF).toBe(MODULE_DETAIL.SECTION / 2);
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
    expect(useGantryStore.getState().x.position).toBe(GANTRY_AXIS.X_TRAVEL);
    expect(useGantryStore.getState().y.position).toBe(0);
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

describe('两轴各 3 个接近开关（端点限位 + 原点在原点侧限位内侧）', () => {
  it('常量口径：X 轴负限位 0 / 原点 25（内侧）/ 正限位 450；Y 轴 0 / 20 / 600', () => {
    const s = GANTRY_SENSOR;
    expect(s.X_END_MINUS).toBe(0);
    expect(s.X_ORIGIN).toBeGreaterThan(s.X_END_MINUS);
    expect(s.X_ORIGIN).toBeLessThan(s.X_END_PLUS);
    expect(s.X_ORIGIN).toBeLessThan(60); // 原点靠近原点侧限位
    expect(s.X_END_PLUS).toBe(GANTRY_AXIS.X_TRAVEL);
    expect(s.Y_END_MINUS).toBe(0);
    expect(s.Y_ORIGIN).toBe(20);
    expect(s.Y_END_PLUS).toBe(GANTRY_AXIS.Y_TRAVEL);
    expect(s.X_ORIGIN_MM).toBeGreaterThan(s.X_END_MINUS_MM);
    expect(s.X_END_PLUS_MM).toBeGreaterThan(s.X_ORIGIN_MM);
  });

  it('6 路触发状态由 x/y position 派生，每路都能单独亮', () => {
    expect(computeSensors(0, 0)).toMatchObject({ origin: false, endMinus: true, endPlus: false,
      xOrigin: false, xEndMinus: true, xEndPlus: false });
    expect(computeSensors(20, 25)).toMatchObject({ origin: true, endMinus: false,
      xOrigin: true, xEndMinus: false });
    expect(computeSensors(200, 200)).toMatchObject({ origin: false, endMinus: false, endPlus: false,
      xOrigin: false, xEndMinus: false, xEndPlus: false });
    expect(computeSensors(600, 450)).toMatchObject({ endPlus: true, xEndPlus: true });
  });

  it('store 的 tick / setPlcFrame / resetAll / applyBroadcast 都同步 6 路', () => {
    expect(useGantryStore.getState().sensors.xEndMinus).toBe(true);
    useGantryStore.getState().setPlcFrame({ yPos: 20, xPos: 25 });
    expect(useGantryStore.getState().sensors.origin).toBe(true);
    expect(useGantryStore.getState().sensors.xOrigin).toBe(true);
    useGantryStore.getState().tick(1 / 60);
    expect(useGantryStore.getState().sensors.xOrigin).toBe(true);
    useGantryStore.getState().applyBroadcast({ GANTRY_Y_POS: 600, GANTRY_X_POS: 450,
      GANTRY_SENSOR_ORIGIN: 0, GANTRY_SENSOR_END_MINUS: 0, GANTRY_SENSOR_END_PLUS: 1,
      GANTRY_SENSOR_X_ORIGIN: 0, GANTRY_SENSOR_X_END_MINUS: 0, GANTRY_SENSOR_X_END_PLUS: 1 });
    expect(useGantryStore.getState().sensors.endPlus).toBe(true);
    expect(useGantryStore.getState().sensors.xEndPlus).toBe(true);
    useGantryStore.getState().resetAll();
    expect(useGantryStore.getState().sensors.endMinus).toBe(true);
    expect(useGantryStore.getState().sensors.xEndMinus).toBe(true);
  });

  it('传感器由 L 形固定支架夹在型材 T 槽侧面，不再悬浮', () => {
    const sensor = read(COMP + 'SensorSet.tsx');
    for (const t of ['function LimitSensor', '固定支架', 'BRACKET_RISE', 'BRACKET_T',
      '夹在型材', 'Bolt', 'ledOrigin', 'ledEnd', 'ledOff', '感应面']) expect(sensor).toContain(t);
    // 支架尺寸常量在单一来源里定义，组件通过 S / D 引用
    expect(read('packages/inovance-gantry/src/constants/gantryConstants.ts')).toContain('BRACKET_ARM');
    expect(sensor).toContain('S.BRACKET_W');
    // 支架必须有明确的型材锚点，而不是无支撑的悬空 mesh
    expect(sensor).toContain('perp(axis, side, D.HALF)');
  });

  it('金属挡片固定在滑块上随动，X/Y 各一片', () => {
    const sensor = read(COMP + 'SensorSet.tsx');
    for (const t of ['function SensorFlag', 'sensor-flag', 'FLAG_W', 'M.silver', '随滑块']) {
      expect(sensor).toContain(t);
    }
    const carriage = read(COMP + 'Carriage.tsx');
    expect(carriage).toContain('<SensorFlag axis="x"');
    const scene = read(SCENE);
    expect(scene).toContain('<SensorFlag axis="z"');
  });

  it('两轴各装 3 个开关，面板 / 线圈表 / EtherCAT / 快照键齐全', () => {
    const sensor = read(COMP + 'SensorSet.tsx');
    expect(sensor).toContain('endMinus');
    expect(sensor).toContain('origin');
    expect(sensor).toContain('endPlus');
    const scene = read(SCENE);
    expect((scene.match(/<AxisSensorSet/g) || []).length).toBe(2);
    expect(scene).toContain('axis="x"');
    expect(scene).toContain('axis="z"');
    const panel = read('packages/inovance-gantry/src/platform/GantryModePanel.tsx');
    expect(panel).toContain('data-dt-gantry-sensors');
    expect(panel).toContain('data-dt-gantry-sensors-x');
    const vars = read('packages/inovance-gantry/src/constants/gantryVariables.ts');
    for (const t of ['GANTRY_SENSOR_X_ORIGIN', 'GANTRY_SENSOR_X_END_MINUS', 'GANTRY_SENSOR_X_END_PLUS',
      'X_Axis.OriginSensor', 'X_Axis.NegativeLimit', 'X_Axis.PositiveLimit']) expect(vars).toContain(t);
    const snap = exportGantrySnapshot();
    for (const k of ['GANTRY_SENSOR_ORIGIN', 'GANTRY_SENSOR_X_ORIGIN', 'GANTRY_SENSOR_X_END_PLUS']) {
      expect(Object.keys(snap)).toContain(k);
    }
  });
});

describe('部件拆分（参照配药项目：单独设计完善后再组装）', () => {
  const FILES = [
    'IndustrialProfile.tsx', 'LinearModule.tsx', 'EndSupport.tsx', 'Carriage.tsx',
    'ZAxisAssembly.tsx', 'SensorSet.tsx', 'WeldedTable.tsx',
    'ChessboardTable.tsx', 'ChessPieceMesh.tsx', 'index.ts',
  ];
  it('9 个部件各有独立文件 + 统一出口', () => {
    for (const f of FILES) expect(existsSync(join(root, COMP + f))).toBe(true);
    const index = read(COMP + 'index.ts');
    for (const t of ['IndustrialProfile', 'LinearModule', 'EndSupport', 'Carriage',
      'ZAxisAssembly', 'SensorSet', 'WeldedTable', 'ChessboardTable', 'ChessPieceMesh']) {
      expect(index).toContain(t);
    }
  });

  it('SceneContent 是纯组装层：从 components 统一导入，不再内联零件实现', () => {
    const scene = read(SCENE);
    expect(scene).toContain("from './gantry/components'");
    expect(scene).toContain('纯组装层');
    for (const t of ['<WeldedTable', '<ChessboardTable', '<LinearModule', '<EndSupport',
      '<Carriage', '<ZAxisAssembly', '<AxisSensorSet', '<SensorFlag']) expect(scene).toContain(t);
    expect(scene).not.toContain('function Profile(');
    expect(scene).not.toContain('function LimitSensor(');
  });

  it('旧 GantryParts.tsx 退化为兼容 re-export 层', () => {
    const compat = read(SHARED + 'GantryParts.tsx');
    expect(compat).toContain('兼容层');
    expect(compat).toContain("from '../gantry/components'");
    expect(compat).not.toContain('function LimitSensor');
  });
});

describe('机位与部件展台（与传送带 / 配药同款交互）', () => {
  it('5 个整机机位 + 7 个部件展台，各自有专用相机与 0.1m 标尺网格', () => {
    expect(Object.keys(GANTRY_VIEW_PRESETS)).toEqual(['overview', 'top', 'front', 'zaxis', 'board']);
    expect(Object.keys(GANTRY_PART_STAGES)).toHaveLength(7);
    for (const [key, stage] of Object.entries(GANTRY_PART_STAGES)) {
      expect(GANTRY_PART_STAGE_ORIGIN).toHaveProperty(key);
      expect(stage.camera).toHaveLength(3);
      expect(stage.target).toHaveLength(3);
      expect(stage.fov).toBeGreaterThan(0);
      expect(stage.grid).toBeGreaterThan(0);
    }
    expect(isGantryPartStage('zaxis')).toBe(true);
    expect(isGantryPartStage('nope')).toBe(false);
    expect(isGantryViewKey('top')).toBe(true);
    expect(isGantryViewKey('nope')).toBe(false);
  });

  it('SceneContent 支持 ?stage= 短路，展台复用同一批组件', () => {
    const scene = read(SCENE);
    for (const t of ['useGantryViewStore', 'PartStageView', 'GantryCameraRig',
      'renderBarePart', 'gridHelper', 'AssembledScene', "from './gantry/components'"]) {
      expect(scene).toContain(t);
    }
    for (const kind of ['module', 'carriage', 'zaxis', 'sensor', 'endSupport', 'board', 'piece']) {
      expect(scene).toContain(`case '${kind}'`);
    }
  });

  it('相机阻尼过渡 + OrbitControls makeDefault + 右上角切换器 + URL 同步', () => {
    const rig = read(COMP + 'GantryCameraRig.tsx');
    for (const t of ['useFrame', 'useThree', 'lerp', 'updateProjectionMatrix', 'goalRef']) expect(rig).toContain(t);
    const wrapper = read('packages/inovance-gantry/src/platform/GantrySceneWrapper.tsx');
    expect(wrapper).toContain('makeDefault');
    expect(wrapper).toContain('GantryViewSwitcher');
    expect(wrapper).toContain('minDistance={activeStage ? 0.06 : 0.3}');
    const sw = read('packages/inovance-gantry/src/platform/GantryViewSwitcher.tsx');
    for (const t of ['data-dt-gantry-view-switcher', 'data-dt-gantry-stage-select',
      'data-dt-gantry-stage-back', '返回整机']) expect(sw).toContain(t);
    const store = read('packages/inovance-gantry/src/stores/useGantryViewStore.ts');
    expect(store).toContain('history.replaceState');
    expect(store).toContain('不污染设备真值');
  });
});

describe('Z 轴导杆随动（用户指出「升降气缸还是不对」）', () => {
  it('防转导杆固定在移动板上随 Z 伸出，缸体侧只有固定导套', () => {
    const z = read(COMP + 'ZAxisAssembly.tsx');
    expect(z).toContain('guide-bush-');   // 固定导套
    expect(z).toContain('guide-');        // 随动导杆在 headRef 内
    expect(z).toContain('D.GUIDE_LEN');
    expect(z).toContain('GUIDE_BUSH_R');
    expect(CYLINDER_DETAIL.GUIDE_LEN).toBeGreaterThan(0.1); // 大于视觉行程，始终留在导套内
    // 导杆必须在 headRef 之后（移动板内），不能留在固定缸体段
    const headAt = z.indexOf('<group ref={headRef}');
    const guideAt = z.indexOf('key={`guide-${s}`}');
    expect(guideAt).toBeGreaterThan(headAt);
  });
});

describe('Z 轴升降总成：活塞杆随行程伸缩，不与缸体脱开', () => {
  it('杆顶埋进缸体 ROD_OVERLAP，杆底始终接吸盘头', () => {
    const z = read(COMP + 'ZAxisAssembly.tsx');
    for (const t of ['Z_AXIS_GEOM', 'ROD_TOP', 'ROD_OVERLAP', 'rodRef.current.scale.y',
      'rodRef.current.position.y', 'headRef.current.position.y', 'useFrame']) expect(z).toContain(t);
    expect(z).toContain('BODY_Y - D.BODY_LEN / 2 + D.ROD_OVERLAP');
  });

  it('Z 高度标定：下降 50mm 后吸盘底面正好贴棋子顶面', () => {
    const z = read(COMP + 'ZAxisAssembly.tsx');
    expect(z).toContain('HEAD_BASE: -0.146');
    expect(z).toContain('HEAD_LENGTH: 0.049');
    const frame = 0.52;
    const headBase = -0.146;
    const headLength = 0.049;
    const suctionDown = frame + headBase - headLength - GANTRY_AXIS.Z_STROKE * GANTRY_AXIS.MM2M * 2;
    const pieceTop = 0.16 + 0.028 + 0.037;
    expect(Math.abs(suctionDown - pieceTop)).toBeLessThan(0.005);
    const scene = read(SCENE);
    expect(scene).toContain('suctionBottomDown');
    expect(scene).toContain('pieceTop');
    expect(scene).toContain('Z_AXIS_GEOM');
  });
});

describe('吸取 → 移动 → 放置流程', () => {
  it('默认从 A1 吸取并放到 C1，棋子位置与吸取/释放状态同步更新', () => {
    const before = useGantryStore.getState().pieces[0];
    expect(before.label).toBe('A1');
    expect(before.held).toBe(false);
    useGantryStore.getState().startAuto();
    let sawHeld = false, sawMove = false;
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
    expect(Object.keys(snap).length).toBeGreaterThan(18);
    for (const v of Object.values(snap)) expect(typeof v).toBe('number');
    useGantryStore.getState().setPlcFrame({ xPos: 300, yPos: 240 });
    const changed = exportGantrySnapshot();
    useGantryStore.getState().resetAll();
    useGantryStore.getState().applyBroadcast(changed);
    expect(useGantryStore.getState().x.position).toBe(300);
    expect(useGantryStore.getState().y.position).toBe(240);
    const store = read('packages/inovance-gantry/src/stores/useGantryStore.ts');
    for (const k of Object.keys(changed).filter((k) => !k.startsWith('GANTRY_PIECE_'))) {
      expect(store).toContain(k);
    }
    expect(store).toContain('GANTRY_PIECE_${i + 1}_ROW');
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
});

describe('视觉与建模质量', () => {
  it('3D 只读 position 坐标变量，不在场景里另算位置', () => {
    const scene = read(SCENE);
    expect(scene).toContain('useGantryStore.getState()');
    expect(scene).toContain('s.y.position');
    expect(scene).toContain('s.x.position');
    expect(scene).not.toContain('useGLTF');
    expect(scene).not.toContain('<meshStandardMaterial color=');
  });

  it('结构按 Inovance.STEP 装配树：台体 / 一侧 Y 模组 + 一侧 D20 导轨 / X 横梁 / 气缸吸盘', () => {
    const scene = read(SCENE);
    for (const t of ['WeldedTable', '台体', 'Y 轴线性模组-600', 'HG-KR43 伺服', 'D20 直线导轨',
      '导轨固定板', 'X 直线模组-450', '200W 伺服', '吸盘', 'yBridge', 'xSlider', 'POST_BOTTOM']) {
      expect(scene).toContain(t);
    }
    expect(scene).toContain('gantry-end-support-');
    expect(scene).not.toContain('四角立柱');
  });

  it('外观细节：铝银灰整板 + T 槽 / 深棕 8x8 棋盘 / 波纹吸盘 / 中性气管', () => {
    for (const t of ['BoltRow', 'T 槽', 'castShadow']) expect(read(COMP + 'IndustrialProfile.tsx')).toContain(t);
    for (const t of ['VISUAL_ROWS', 'M.boardEdge', 'M.boardGrid']) expect(read(COMP + 'ChessboardTable.tsx')).toContain(t);
    for (const t of ['M.cup', 'M.cupLip', 'M.brass', '节流阀接头', '波纹']) {
      expect(read(COMP + 'ZAxisAssembly.tsx')).toContain(t);
    }
  });

  it('借鉴 Saltline 的程序化表面纹理：JS 端 fbm + DataTexture，不注入 shader', () => {
    const proc = read(SHARED + 'proceduralTextures.ts');
    for (const t of ['THREE.DataTexture', 'RepeatWrapping', 'export function fbm', 'valueNoise',
      'getProcTextures', 'brushed', 'micro', 'wood', 'SRGBColorSpace', 'NoColorSpace']) expect(proc).toContain(t);
    expect(proc).not.toContain('document.createElement');
    expect(proc).not.toContain('.onBeforeCompile =');
    expect(proc).not.toContain('replace("#include');
    expect(proc).toContain('__dtGantryTextureBakeMs');
    expect(proc).not.toContain('export const PROC_TEXTURES');
    const mat = read(SHARED + 'gantryMaterials.ts');
    expect(mat).toContain('export function applyProceduralTextures');
    expect(mat).toContain('mat.map = T.brushed');
    expect(mat).toContain('mat.map = T.wood');
    const scene = read(SCENE);
    expect(scene).toContain("has('noProcTex')");
    expect(scene).toContain('if (!skipProcTex) applyProceduralTextures()');
  });

  it('材质单例 + metalness/roughness 分层 + polygonOffset 贴面', () => {
    const mat = read(SHARED + 'gantryMaterials.ts');
    for (const t of ['new THREE.MeshStandardMaterial', 'metalness', 'roughness', 'polygonOffset',
      'V.BASE_COLOR', 'V.SILVER_COLOR', 'V.PROFILE_SLOT_COLOR', 'GAP']) expect(mat).toContain(t);
  });

  it('滚珠丝杆沿模组长边居中，不再垂直戳出导轨/横梁', () => {
    const mod = read(COMP + 'LinearModule.tsx');
    expect(mod).toContain('axisRotation');
    expect(mod).toContain('position={[0, D.HALF + GAP * 2, 0]}');
    expect(mod).not.toContain('along[0] / 2');
  });

  it('外接气管 / 绿色端子 / HMI 盒 / 坦克链等非必要装饰已移除，只留节流阀接头', () => {
    const all = [
      read(SCENE), read(COMP + 'ZAxisAssembly.tsx'), read(SHARED + 'gantryMaterials.ts'),
      read('packages/inovance-gantry/src/constants/gantryConstants.ts'),
    ].join('\n');
    for (const t of ['C.terminal', 'HOSE_COLOR', 'M.hose', '中性色气管', 'C.chain', 'DragChain',
      'HmiPanel', 'PlcIoBoard', 'SupportColumn', 'ref={fan}', 'planeGeometry']) {
      expect(all).not.toContain(t);
    }
    expect(read(COMP + 'ZAxisAssembly.tsx')).toContain('节流阀接头');
    expect(read(SHARED + 'gantryMaterials.ts')).toContain('ledOrigin');
  });

  it('视觉接入共享工业视觉令牌：与传送带 / 配药同一套结构色与三点布光', () => {
    const c = read('packages/inovance-gantry/src/constants/gantryConstants.ts');
    expect(c).toContain("from '@digital-twin/shared'");
    for (const t of ['INDUSTRIAL_VISUAL', 'INDUSTRIAL_LIGHTING', 'INDUSTRIAL_DETAIL', '...INDUSTRIAL_VISUAL']) {
      expect(c).toContain(t);
    }
    const scene = read(SCENE);
    expect(scene).toContain('GANTRY_VISUAL.SCENE_LIGHTING');
    for (const t of ['L.ambient', 'L.key', 'L.fillColor', 'gantryMaterials']) expect(scene).toContain(t);
    expect(read('packages/inovance-gantry/src/platform/GantrySceneWrapper.tsx'))
      .toContain('GANTRY_VISUAL.SCENE_BACKGROUND');
  });
});
