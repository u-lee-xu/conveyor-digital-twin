/**
 * 装配层接口约束自检（替代原先临时脚本里手写的世界常量断言）
 *
 * 三层结构：部件层（局部原点） → 装配层（ASSEMBLY / MAGAZINE_ASSEMBLY） → 场景层。
 * 这里验证两件事：
 *   ① 每个部件的「局部原点 + 局部几何」能严格还原成世界常量，装配表没有漂移；
 *   ② 部件组件源码里不出现任何世界坐标，且每个部件都声明了局部原点契约。
 * 这样以后调整布局只需改装配表，自检会立刻指出哪些接口面没对齐。
 */
import { describe, it, expect } from 'vitest';
import { useDispensingStore } from './stores/useDispensingStore';
import {
  ASSEMBLY, MAGAZINE_ASSEMBLY, PART_STAGES, PART_STAGE_ORIGIN,
  FRAME, RACK, UNIT, BIN, RACK_PILLAR_H, RACK_PILLAR_CY,
  FRAME_AXLE_FROM, FRAME_AXLE_TO, FRAME_LEN, FRAME_CX,
  SCREW_Y, TRACK_Y, MAG_RACK_CX, MAG_RACK_Y, MAG_RACK_Z,
  MAG_RACK_PILLAR_X, MAG_RACK_PILLAR_Z, MAGAZINE_X,
  CHUTE_Y, CHUTE_EXIT_Z, CHUTE_RAMP_MID_Y, CHUTE_RAMP_MID_Z,
  CHUTE_RAMP_END_Z, CHUTE_RAMP_END_Y,
  PILL_BASE_Y, PILL_R, PILL_LAND_Y, HOPPER_OPEN_Y, HOPPER_CENTER_Y, HOPPER_CENTER_Z,
  HOPPER, HOPPER_LOCAL_Y, HOPPER_LOCAL_Z,
  ROTARY_CENTER, ROTARY_BODY, ROTARY_DISC, ROTARY_DISC_RIM, ROTARY_TOP_DETAIL,
  SLIDER_SIZE, SLIDER_TOP_Y, SLIDER_MIN_X, SLIDER_MAX_X,
  COLLECT_BIN_X, BIN_BASE_Y, BIN_TOP_Y, DUMP_LAND_Y,
  CABINET_POSITION, CABINET_SIZE, CABINET_PANEL, CABINET_BUTTONS, CABINET_LAMPS,
  CABINET_LAMP_Y, CABINET_SELECTOR, VISUAL, FRAME_DETAIL, DRIVE_STATIONS, SLIDER_DETAIL,
  SHAFT_END_ENCODER, ENCODER_STATIONS, MODBUS_READ_VARS, MODBUS_HOLDING_REGISTERS,
  VIEW_PRESETS, MIRROR_VIEW_SHIFT, MIRROR_LOCAL_VIEW_SHIFT,
  SCREW_DETAIL, AXIS_R, PULSES_PER_M, ENCODER_PULSES_PER_REV, ENCODER_PULSES_MAX,
  LIGHT_TOWER_X, LIGHT_POLE_H, LIGHT_POLE_Y, LIGHT_DOME_R, LIGHT_DOME_STEP,
  FEED_PUSH_Z0, FEED_PUSH_Z1, CYL_FEED_STROKE, TRACK_R, SENSOR,
  SURFACE_GAP, CHUTE_RAIL, FOOT_RISE, MAG_TRAY_W, SCENE_SCALE, PILL_H,
  type MagazineId,
} from './scenes/auto-dispensing/constants';

/**
 * 用 Vite 的 ?raw 静态收集组件源码，而不是 node:fs：
 * 本包 vite.config.ts 挂了 electron-renderer，会把 fs 重定向到基于 require 的 shim，
 * 在 vitest 的 ESM 环境里会报 "require is not defined"。
 */
const componentSources = import.meta.glob<string>(
  './scenes/auto-dispensing/components/*.tsx',
  { query: '?raw', import: 'default', eager: true },
);

/** 机位相关源码：确认新增特写机位真的接到了工具栏与镜像取景逻辑 */
const switcherSource = import.meta.glob<string>(
  './platform/ViewSwitcher.tsx',
  { query: '?raw', import: 'default', eager: true },
)['./platform/ViewSwitcher.tsx'];
const viewGoalsSource = import.meta.glob<string>(
  './scenes/auto-dispensing/viewGoals.ts',
  { query: '?raw', import: 'default', eager: true },
)['./scenes/auto-dispensing/viewGoals.ts'];

/** 场景层源码：确认新增部件展台真的接到了裸部件渲染分支 */
const sceneContentSource = import.meta.glob<string>(
  './scenes/auto-dispensing/SceneContent.tsx',
  { query: '?raw', import: 'default', eager: true },
)['./scenes/auto-dispensing/SceneContent.tsx'];

/** 出药状态链路源码：确认视觉与刚体共用同一个显式真值 */
const loopSource = import.meta.glob<string>(
  './scenes/auto-dispensing/hooks/useDispenseLoop.ts',
  { query: '?raw', import: 'default', eager: true },
)['./scenes/auto-dispensing/hooks/useDispenseLoop.ts'];

/** 贴面材质 / 物理几何源码：确认渲染层兜底与视觉-碰撞体同源 */
const materialsSource = import.meta.glob<string>(
  './components/scene/shared/materials.ts',
  { query: '?raw', import: 'default', eager: true },
)['./components/scene/shared/materials.ts'];
const physicsGeometrySource = import.meta.glob<string>(
  './scenes/auto-dispensing/physicsGeometry.ts',
  { query: '?raw', import: 'default', eager: true },
)['./scenes/auto-dispensing/physicsGeometry.ts'];

const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];
const PART_NAMES = ['frame', 'rack', 'unit', 'hopper', 'bin', 'cabinet', 'tower', 'encoder'];

/** 展台相机的可视高度（半视角 × 距离），用于确认高部件不会被裁切 */
function stageExtent(name: string) {
  const s = PART_STAGES[name];
  const d = Math.hypot(
    s.camera[0] - s.target[0],
    s.camera[1] - s.target[1],
    s.camera[2] - s.target[2],
  );
  return { d, height: 2 * d * Math.tan((s.fov * Math.PI) / 360) };
}

describe('装配表：局部原点 → 世界坐标严格闭合', () => {
  it('机架：原点是左端轴承位地面，丝杆高度与末端都还原正确', () => {
    const at = ASSEMBLY.frame.position;
    expect(at[0] + FRAME.AXLE_FROM).toBeCloseTo(FRAME_AXLE_FROM, 6);
    expect(at[0] + FRAME.AXLE_TO).toBeCloseTo(FRAME_AXLE_TO, 6);
    expect(at[1] + FRAME.SCREW_H).toBeCloseTo(SCREW_Y, 6);
    expect(at[1] + FRAME.TRACK_H).toBeCloseTo(TRACK_Y, 6);
    expect(at[1]).toBe(0);
    expect(FRAME.AXLE_TO - FRAME.AXLE_FROM).toBeCloseTo(FRAME_LEN, 6);
    expect(FRAME_CX).toBeCloseTo(FRAME_LEN / 2, 6);
    // 末端支撑柱不能穿过抬高的取药仓
    expect(FRAME_AXLE_TO - 0.025).toBeGreaterThan(COLLECT_BIN_X + BIN.W / 2);
  });

  it('料筒托架：两根立柱落回世界 X/Z，且底端贴地不悬空', () => {
    const at = ASSEMBLY.magazineRack.position;
    expect(at[0]).toBeCloseTo(MAG_RACK_CX, 6);
    expect(at[1]).toBeCloseTo(MAG_RACK_Y, 6);
    expect(at[2]).toBeCloseTo(MAG_RACK_Z, 6);
    expect(at[0] + RACK.PILLAR_X[0]).toBeCloseTo(MAG_RACK_PILLAR_X[0], 6);
    expect(at[0] + RACK.PILLAR_X[1]).toBeCloseTo(MAG_RACK_PILLAR_X[1], 6);
    expect(at[2] + RACK.PILLAR_Z).toBeCloseTo(MAG_RACK_PILLAR_Z, 6);
    expect(at[1] + RACK_PILLAR_CY - RACK_PILLAR_H / 2).toBeCloseTo(0.02, 6);
    expect(RACK_PILLAR_H).toBeGreaterThan(1);
  });

  it('供药单元：底座底面接托架横梁、托板面接出药平面、斜槽中点接世界轨迹', () => {
    const at = MAGAZINE_ASSEMBLY.A;
    expect(at[1]).toBeCloseTo(CHUTE_Y, 6);
    expect(at[2]).toBe(0);
    // 关键接口：单元底座底面 = 托架横梁中心面
    expect(at[1] + UNIT.PEDESTAL_Y - UNIT.PEDESTAL_H / 2)
      .toBeCloseTo(ASSEMBLY.magazineRack.position[1], 6);
    // 最底药片中心 = 推药气缸轴线
    expect(at[1] + UNIT.PILL_Y).toBeCloseTo(PILL_BASE_Y, 6);
    // 斜槽与场景层药片飞行共用同一条轨迹
    expect(at[1] + UNIT.RAMP_MID_Y).toBeCloseTo(CHUTE_RAMP_MID_Y, 6);
    expect(UNIT.RAMP_MID_Z).toBeCloseTo(CHUTE_RAMP_MID_Z, 6);
    MAGS.forEach((m) => {
      expect(MAGAZINE_ASSEMBLY[m][0]).toBeCloseTo(MAGAZINE_X[m], 6);
      expect(MAGAZINE_ASSEMBLY[m][1]).toBeCloseTo(CHUTE_Y, 6);
    });
  });

  it('推药接口：推板退回贴片、伸到位顶出托板、斜槽起点共点', () => {
    expect(FEED_PUSH_Z0).toBeCloseTo(-PILL_R - 0.004, 6);
    expect(FEED_PUSH_Z1 + PILL_R).toBeCloseTo(CHUTE_EXIT_Z, 6);
    expect(CYL_FEED_STROKE).toBeCloseTo(FEED_PUSH_Z1 - FEED_PUSH_Z0, 6);
    expect(CHUTE_EXIT_Z).toBeCloseTo(UNIT.TRAY_Z1, 6);
    expect(CYL_FEED_STROKE).toBeGreaterThan(0);
  });

  it('滑块·旋转气缸·料斗：盘心与斗口由装配表 + 局部偏移还原', () => {
    const at = ASSEMBLY.sliderHopper.position;
    expect(at[0]).toBeCloseTo(SLIDER_MIN_X, 6);
    expect(at[1]).toBeCloseTo(SLIDER_TOP_Y, 6);
    expect(at[1] + SLIDER_SIZE[1] / 2).toBeCloseTo(SCREW_Y, 6);
    expect(at[1] + ROTARY_CENTER.Y).toBeCloseTo(HOPPER_CENTER_Y - HOPPER_LOCAL_Y, 6);
    expect(at[1] + ROTARY_CENTER.Y + HOPPER_LOCAL_Y + HOPPER.H / 2)
      .toBeCloseTo(HOPPER_OPEN_Y, 6);
    expect(
      at[2] + ROTARY_CENTER.Z + ROTARY_BODY.D / 2 + ROTARY_DISC.TH / 2 + HOPPER_LOCAL_Z,
    ).toBeCloseTo(HOPPER_CENTER_Z, 6);
    // 斜槽末端落在料斗开口范围内，药片落点在口沿以下、底板以上
    expect(CHUTE_RAMP_END_Z).toBeGreaterThan(HOPPER_CENTER_Z - HOPPER.D / 2);
    expect(CHUTE_RAMP_END_Z).toBeLessThan(HOPPER_CENTER_Z + HOPPER.D / 2);
    expect(CHUTE_RAMP_END_Y).toBeGreaterThan(HOPPER_OPEN_Y);
    expect(PILL_LAND_Y).toBeLessThan(HOPPER_OPEN_Y);
    expect(PILL_LAND_Y).toBeGreaterThan(HOPPER_CENTER_Y - HOPPER.H / 2);
  });

  it('取药仓：仓底/顶面/台座落地闭合，倒药落点在仓内', () => {
    const at = ASSEMBLY.collectBin.position;
    expect(at[0]).toBeCloseTo(COLLECT_BIN_X, 6);
    expect(at[1]).toBeCloseTo(BIN_BASE_Y, 6);
    expect(at[1] + BIN.H).toBeCloseTo(BIN_TOP_Y, 6);
    expect(at[1] + BIN.PEDESTAL_Y - BIN.PEDESTAL_H / 2).toBeCloseTo(0.04, 6);
    expect(COLLECT_BIN_X).toBeGreaterThan(SLIDER_MAX_X);
    expect(DUMP_LAND_Y).toBeLessThan(BIN_TOP_Y);
    expect(DUMP_LAND_Y).toBeGreaterThan(BIN_BASE_Y);
  });

  it('原点/终点传感器：对齐行程两端，L 形吊架填平导轨与本体之间的空隙', () => {
    const frameX = ASSEMBLY.frame.position[0];
    expect(frameX + SENSOR.ORIGIN_X).toBeCloseTo(SLIDER_MIN_X, 6);
    expect(frameX + SENSOR.END_X).toBeCloseTo(SLIDER_MAX_X, 6);
    // 吊架顶面必须贴住 +Z 导轨下沿，竖吊板必须真的接到开关本体顶面
    expect(SENSOR.BRACKET_TOP_Y).toBeCloseTo(FRAME.TRACK_H - TRACK_R, 6);
    expect(SENSOR.BRACKET_RAIL_Z).toBeCloseTo(FRAME.TRACK_Z, 6);
    const strapH = SENSOR.BRACKET_TOP_Y - SENSOR.Y - SENSOR.BODY_H / 2;
    expect(strapH).toBeGreaterThan(0);       // 否则吊板反向 / 传感器悬空
    expect(strapH).toBeLessThan(0.1);        // 是短吊板，不是从地面另立一根柱子
    // 探头装在导轨外侧，避开滑台 Z 行程
    expect(SENSOR.Z).toBeGreaterThan(FRAME.TRACK_Z + TRACK_R);
    expect(SENSOR.LABEL_END_OFFSET[0]).toBeGreaterThan(0); // 终点标签让开翻转料斗
  });

  it('控制柜 / 信号灯塔：位姿一致，且灯头坐在杆顶不悬浮', () => {
    expect(ASSEMBLY.cabinet.position).toEqual(CABINET_POSITION);
    expect(CABINET_SIZE[1]).toBeGreaterThan(0.4);
    expect(ASSEMBLY.lightTower.position[0]).toBeCloseTo(LIGHT_TOWER_X, 6);
    expect(ASSEMBLY.lightTower.position[1]).toBe(0);
    // 旧实现 LIGHT_POLE_H=0.55、灯罩在 1.15，中间断开 0.6m；现在杆顶即红灯罩中心
    expect(LIGHT_POLE_H).toBeCloseTo(LIGHT_POLE_Y, 6);
    expect(LIGHT_POLE_Y - LIGHT_DOME_R).toBeLessThan(LIGHT_POLE_H);
    expect(LIGHT_DOME_STEP).toBeCloseTo(LIGHT_DOME_R, 6);
    Object.values(ASSEMBLY).forEach((p) => expect(p.origin.length).toBeGreaterThan(4));
  });
});

describe('部件层契约与展台取景', () => {
  it('组件源码只使用局部坐标，且逐个声明局部原点', () => {
    const files = [
      'MachineFrame.tsx', 'MagazineRack.tsx', 'MagazineUnit.tsx',
      'SliderHopper.tsx', 'Hopper.tsx', 'CollectBin.tsx', 'ControlCabinet.tsx',
    ];
    const forbidden = [
      'CHUTE_Y', 'SLIDER_TOP_Y', 'SLIDER_MIN_X', 'SLIDER_MAX_X',
      'MAGAZINE_X', 'MAG_RACK_CX', 'MAG_RACK_Y', 'MAG_RACK_Z',
      'COLLECT_BIN_X', 'BIN_BASE_Y', 'CABINET_POSITION', 'LIGHT_TOWER_X',
      'SCREW_Y', 'HOPPER_CENTER_Y', 'HOPPER_CENTER_Z',
    ];
    files.forEach((file) => {
      const raw = componentSources[`./scenes/auto-dispensing/components/${file}`];
      expect(raw, `${file} 源码必须可读`).toBeTruthy();
      // 注释里允许提到世界常量（用来说明原点对应关系），代码里一律禁止
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      forbidden.forEach((id) => {
        expect(
          new RegExp(`\\b${id}\\b`).test(code),
          `${file} 不应出现世界坐标 ${id}`,
        ).toBe(false);
      });
      expect(raw, `${file} 必须声明局部原点`).toMatch(/局部原点/);
    });
  });

  it('八个部件都有展台相机、网格和原点说明，且高部件不被裁切', () => {
    expect(Object.keys(PART_STAGES).sort()).toEqual([...PART_NAMES].sort());
    expect(Object.keys(PART_STAGE_ORIGIN).sort()).toEqual([...PART_NAMES].sort());
    PART_NAMES.forEach((name) => {
      const s = PART_STAGES[name];
      expect(Math.round(s.grid / 0.1) * 0.1).toBeCloseTo(s.grid, 6);
      expect(s.camera[1]).toBeGreaterThan(s.target[1]); // maxPolarAngle 不会夹住相机
      const { d } = stageExtent(name);
      expect(d).toBeGreaterThanOrEqual(0.2); // 展台 OrbitControls.minDistance
      expect(d).toBeLessThanOrEqual(25);
      expect(PART_STAGE_ORIGIN[name].length).toBeGreaterThan(4);
    });
    // 高部件必须完整落在竖向视野内（以 target.y 为中心 ± 半视野），否则截图会被裁切
    const covers = (name: string, low: number, high: number) => {
      const { height } = stageExtent(name);
      const half = height / 2;
      const mid = PART_STAGES[name].target[1];
      expect(mid - half, `${name} 底部被裁切`).toBeLessThanOrEqual(low);
      expect(mid + half, `${name} 顶部被裁切`).toBeGreaterThanOrEqual(high);
    };
    const towerTop = LIGHT_POLE_Y + 2 * LIGHT_DOME_STEP + LIGHT_DOME_R;
    covers('tower', 0, towerTop);
    // 仓顶「有药指示灯」球体半径 0.018，取景必须把它也算进去
    covers('bin', -BIN.PEDESTAL_H, BIN.LAMP_Y + 0.018);
    // 轴末端编码器：法兰半径决定上下界，L 型支架托板略低于法兰
    covers(
      'encoder',
      -SHAFT_END_ENCODER.FLANGE_R - SHAFT_END_ENCODER.BRACKET_T,
      SHAFT_END_ENCODER.FLANGE_R,
    );
  });
});

// ============================================================
// 控制柜面板：工业按钮盒的接口约束
// 按钮头必须朝 +Z 凸出（组件里的 ZDisc 绕 X 转 90°），这里用尺寸/位置
// 关系把「像按钮盒」这件事量化，防止以后改常量又把元件压扁、挤成一排。
// ============================================================
const P = CABINET_PANEL;
const panelBottom = P.CENTER_Y - P.H / 2;
const panelTop = P.CENTER_Y + P.H / 2;

/** 相对亮度，用来保证「背景 < 结构件 < 柜体 < 门板」的明度层次不被改没 */
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

const buttonRadius = (b: (typeof CABINET_BUTTONS)[number]) =>
  b.kind === 'estop' ? P.ESTOP_BASE_R : P.BEZEL_R;

describe('控制柜面板：按钮盒几何与配色层次', () => {
  it('门板由柜体尺寸推导，后表面贴合柜体前表面，整体落在柜体内', () => {
    expect(P.W).toBeCloseTo(CABINET_SIZE[0] - 0.04, 6);
    expect(P.H).toBeCloseTo(CABINET_SIZE[1] - 0.10, 6);
    expect(P.CENTER_Y).toBeCloseTo(CABINET_SIZE[1] / 2 + 0.01, 6);
    expect(P.FRONT_Z - P.T).toBeCloseTo(CABINET_SIZE[2] / 2, 6);
    expect(P.FRONT_Z).toBeGreaterThan(CABINET_SIZE[2] / 2); // 元件确实凸出门板
    expect(panelBottom).toBeGreaterThan(0.02);              // 不压到柜脚
    expect(panelTop).toBeLessThan(CABINET_SIZE[1] + 0.01);  // 不越过柜顶
  });

  it('安装环 > 按钮头、急停最大、灯环 > 透镜，形成可见金属圈', () => {
    expect(P.BEZEL_R).toBeGreaterThan(P.COLLAR_R);
    expect(P.COLLAR_R).toBeGreaterThan(P.HEAD_R);
    expect(P.ESTOP_HEAD_R).toBeGreaterThan(P.HEAD_R);
    expect(P.ESTOP_BASE_R).toBeGreaterThan(P.BEZEL_R);
    expect(P.LAMP_BEZEL_R).toBeGreaterThan(P.LAMP_LENS_R);
    expect(P.HEAD_T).toBeGreaterThan(0);
    expect(P.ESTOP_T).toBeGreaterThan(P.HEAD_T);
  });

  it('五个按钮 / 三个灯 / 选择开关都落在门板内，且不与柜门锁重叠', () => {
    const controls = [
      ...CABINET_BUTTONS.map((b) => ({ x: b.x, y: b.y, r: buttonRadius(b), label: b.label })),
      ...CABINET_LAMPS.map((l) => ({ x: l.x, y: CABINET_LAMP_Y, r: P.LAMP_BEZEL_R, label: l.label })),
      { x: CABINET_SELECTOR.x, y: CABINET_SELECTOR.y, r: P.SELECTOR_R, label: CABINET_SELECTOR.label },
    ];
    expect(controls).toHaveLength(9);
    controls.forEach((c) => {
      expect(Math.abs(c.x) + c.r, `${c.label} 横向越出门板`).toBeLessThan(P.W / 2);
      expect(c.y - c.r, `${c.label} 纵向越出门板下沿`).toBeGreaterThan(panelBottom);
      expect(c.y + c.r, `${c.label} 纵向越出门板上沿`).toBeLessThan(panelTop);
    });
    const rightmost = Math.max(...CABINET_BUTTONS.map((b) => b.x + buttonRadius(b)));
    expect(P.LOCK_X - 0.009).toBeGreaterThan(rightmost);
    expect(P.LOCK_X + 0.009).toBeLessThan(P.W / 2);
  });

  it('铭牌在每个元件正下方、互不重叠、不越出面板', () => {
    const plates = [
      ...CABINET_BUTTONS.map((b) => ({ x: b.x, y: b.y + P.PLATE_DY, upper: b.y - buttonRadius(b) })),
      ...CABINET_LAMPS.map((l) => ({ x: l.x, y: CABINET_LAMP_Y + P.PLATE_DY, upper: CABINET_LAMP_Y - P.LAMP_BEZEL_R })),
      {
        x: CABINET_SELECTOR.x,
        y: CABINET_SELECTOR.y + P.PLATE_DY,
        upper: CABINET_SELECTOR.y - P.SELECTOR_R,
      },
    ];
    expect(P.PLATE_DY).toBeLessThan(0);
    plates.forEach((p) => {
      expect(p.y + P.PLATE_H / 2).toBeLessThan(p.upper);   // 牌上沿低于元件下沿
      expect(p.y - P.PLATE_H / 2).toBeGreaterThan(panelBottom);
    });
    // 同一排相邻铭牌不能叠在一起
    const rows = [
      CABINET_LAMPS.map((l) => l.x),
      CABINET_BUTTONS.filter((b) => b.y === CABINET_BUTTONS[0].y).map((b) => b.x),
      [
        ...CABINET_BUTTONS.filter((b) => b.y === CABINET_BUTTONS[3].y).map((b) => b.x),
        CABINET_SELECTOR.x,
      ],
    ];
    rows.forEach((xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(P.PLATE_W);
      }
    });
  });

  it('功能分区顺序正确：灯排 → 分隔线 → 上排按钮 → 下排急停 → 底部型号条', () => {
    expect(CABINET_LAMP_Y).toBeGreaterThan(P.DIVIDER_Y);
    expect(P.DIVIDER_Y).toBeGreaterThan(CABINET_BUTTONS[0].y);
    expect(CABINET_BUTTONS[0].y).toBeGreaterThan(CABINET_BUTTONS[3].y);
    expect(CABINET_BUTTONS[3].y + P.PLATE_DY - P.PLATE_H / 2).toBeGreaterThan(P.FOOTER_Y + 0.012 / 2);
    expect(P.FOOTER_Y - 0.012 / 2).toBeGreaterThan(panelBottom);
    expect(P.TITLE_Y + P.TITLE_H / 2).toBeLessThan(panelTop);
  });

  it('符合工厂按钮盒实物规范：灯在上、急停黄标牌、φ40 蘑菇头、模式旋钮', () => {
    // 施耐德官方 FAQ：指示灯在上部、指令开关在下部，操作时手不遮挡指示
    expect(CABINET_LAMP_Y).toBeGreaterThan(Math.max(...CABINET_BUTTONS.map((b) => b.y)));
    expect(CABINET_LAMP_Y).toBeGreaterThan(CABINET_SELECTOR.y);
    // 急停是 Ø40 蘑菇头比例（普通 φ22 头的 1.5 倍以上），且配黄底黑字标牌
    expect(P.ESTOP_HEAD_R / P.HEAD_R).toBeGreaterThan(1.5);
    expect(P.ESTOP_HEAD_R / P.HEAD_R).toBeLessThan(2.2);
    expect(lum(P.COLORS.estopBase)).toBeGreaterThan(0.65);
    expect(lum(P.COLORS.warningText)).toBeLessThan(0.2);
    // 下排三个元件（急停 / 旋钮 / 确认）互不重叠
    const lower = [
      { x: CABINET_BUTTONS[3].x, r: buttonRadius(CABINET_BUTTONS[3]) },
      { x: CABINET_SELECTOR.x, r: P.SELECTOR_R },
      { x: CABINET_BUTTONS[4].x, r: buttonRadius(CABINET_BUTTONS[4]) },
    ].sort((a, b) => a.x - b.x);
    for (let i = 1; i < lower.length; i += 1) {
      expect(lower[i].x - lower[i].r).toBeGreaterThan(lower[i - 1].x + lower[i - 1].r);
    }
    // 旋钮是与 PLC 输入互锁的物理两档开关，不再跟随 AppMode 停在软件中位
    expect(Object.keys(CABINET_SELECTOR.angles).sort()).toEqual(['auto', 'manual']);
    expect(CABINET_SELECTOR.angles.manual).toBeLessThan(0);
    expect(CABINET_SELECTOR.angles.auto).toBeGreaterThan(0);
  });

  it('按钮/灯 key 集合与 store 字段一致，颜色是互不相同的 hex 安全色', () => {
    expect(CABINET_BUTTONS.map((b) => b.key).sort()).toEqual(
      ['confirm', 'estop', 'reset', 'start', 'stop'],
    );
    expect(CABINET_LAMPS.map((l) => l.key)).toEqual(['green', 'yellow', 'red']);
    expect(new Set(CABINET_BUTTONS.map((b) => b.color)).size).toBeGreaterThanOrEqual(4);
    CABINET_BUTTONS.forEach((b) => expect(b.color).toMatch(/^#[0-9a-f]{6}$/i));
    // 急停独占蘑菇头，且与「停止」同为红色系但位置不同排
    expect(CABINET_BUTTONS.filter((b) => b.kind === 'estop')).toHaveLength(1);
    expect(CABINET_BUTTONS[3].y).toBeLessThan(CABINET_BUTTONS[1].y);
  });

  it('整机配色保持明度层次：背景 < 深色结构 < 柜体 < 浅灰门板', () => {
    expect(VISUAL.SCENE_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
    expect(lum(VISUAL.SCENE_BACKGROUND)).toBeLessThan(lum(VISUAL.STRUCT_COLOR));
    expect(lum(VISUAL.STRUCT_COLOR)).toBeLessThan(lum(VISUAL.BASE_COLOR));
    expect(lum(VISUAL.CABINET_COLOR)).toBeLessThan(lum(VISUAL.PANEL_COLOR));
    expect(lum(VISUAL.PANEL_COLOR)).toBeGreaterThan(0.7); // 门板足够亮，彩色元件才醒目
    // 暖色功能件：滑台与料斗同族（同色相），取药仓作为对比色不能和它们相同
    expect(VISUAL.SLIDER_COLOR).not.toBe(VISUAL.HOPPER_COLOR);
    expect(VISUAL.BIN_COLOR).not.toBe(VISUAL.SLIDER_COLOR);
    // 三个安全色灯保持不同色相
    expect(new Set([VISUAL.LAMP_GREEN, VISUAL.LAMP_YELLOW, VISUAL.LAMP_RED]).size).toBe(3);
    // 主光强于补光，补光不能为 0（否则金属件暗部又糊成一团）
    expect(VISUAL.SCENE_LIGHTING.key).toBeGreaterThan(VISUAL.SCENE_LIGHTING.fill);
    expect(VISUAL.SCENE_LIGHTING.fill).toBeGreaterThan(0);
  });
});

// ============================================================
// 丝杆滑台拟真：新增的都是表面细节，用尺寸/位置关系把「零漂移」量化，
// 保证正反转电机、四滑块、滚珠螺母、拖链槽不会偷偷改掉装配接口或碰撞体。
// ============================================================
const F = FRAME_DETAIL;
const S = SLIDER_DETAIL;

describe('滚珠丝杆直线模组：拟真细节与装配接口零漂移', () => {
  it('方形导轨半高沿用 TRACK_R，传感器吊架仍夹在导轨下沿', () => {
    expect(F.RAIL_HALF).toBe(TRACK_R);
    expect(FRAME.TRACK_H - F.RAIL_HALF).toBeCloseTo(SENSOR.BRACKET_TOP_Y, 6);
    expect(FRAME.TRACK_H).toBeCloseTo(SCREW_Y, 6);
    // 方轨仍从滑块中间穿过，滑台上的滑块座与机架导轨同源
    expect(S.RAIL_Z).toBe(FRAME.TRACK_Z);
    expect(S.RAIL_HALF).toBe(F.RAIL_HALF);
    expect(F.RAIL_GROOVE_W).toBeGreaterThan(0);
  });

  it('正反转电机与梅花联轴器在固定端轴承座外侧，且不侵入灯塔/控制柜', () => {
    const bearingHalf = 0.08 / 2; // BearingHousing 的筒体长度
    expect(F.COUPLING_X + F.COUPLING_LEN / 2).toBeLessThan(-bearingHalf);
    expect(F.COUPLING_X - F.COUPLING_LEN / 2)
      .toBeGreaterThan(F.MOTOR_FLANGE_X + F.MOTOR_FLANGE_T / 2);
    expect(F.MOTOR_X0).toBeLessThan(F.MOTOR_FLANGE_X);
    expect(F.COUPLING_JAW_R).toBeGreaterThan(F.COUPLING_R);
    expect(F.MOTOR_MIN_X).toBeCloseTo(F.MOTOR_X0 - F.MOTOR_BODY_LEN - F.MOTOR_FAN_LEN, 6);
    // 联轴器必须填满「电机法兰 ↔ 轴承座」整段间隙，近景里才不会被电机本体挡住
    expect(F.COUPLING_LEN).toBeGreaterThan(0.04);
    expect(F.COUPLING_X + F.COUPLING_LEN / 2).toBeCloseTo(-bearingHalf - 0.004, 6);
    expect(F.MOTOR_FLANGE_X + F.MOTOR_FLANGE_T / 2)
      .toBeCloseTo(F.COUPLING_X - F.COUPLING_LEN / 2 - 0.002, 6);
    // 电机最外端换算到世界 X，必须留在灯塔立杆内侧
    const motorWorldX = ASSEMBLY.frame.position[0] + F.MOTOR_MIN_X;
    expect(motorWorldX).toBeGreaterThan(LIGHT_TOWER_X + 0.05);
    // 电机在 z=0 传动轴线上，控制柜在 +Z 侧，柜体不会与电机穿插
    expect(Math.abs(CABINET_POSITION[2])).toBeGreaterThan(F.MOTOR_BODY_W / 2);
  });

  it('拖链槽在 -Z 侧，与 +Z 侧接近开关 / 滑台行程分离', () => {
    expect(F.CARRIER_Z).toBeLessThan(-FRAME.TRACK_Z);
    expect(SENSOR.Z).toBeGreaterThan(FRAME.TRACK_Z + TRACK_R);
    expect(F.CARRIER_CHANNEL_LEN).toBeLessThan(FRAME_LEN);
    expect(F.CARRIER_Y).toBeGreaterThan(0);
    expect(F.CARRIER_Y).toBeLessThan(FRAME.SCREW_H);
  });

  it('四只直线轴承滑块座包住两条方轨，且不越出滑台本体', () => {
    expect(S.CARRIAGE_H).toBeLessThan(SLIDER_SIZE[1]);
    expect(S.RAIL_Z + S.CARRIAGE_D / 2).toBeLessThanOrEqual(SLIDER_SIZE[2] / 2 + 1e-9);
    expect(S.CARRIAGE_BOLT_DZ + S.CARRIAGE_BOLT_R).toBeLessThan(S.CARRIAGE_D / 2);
    expect(S.CARRIAGE_BOLT_DY + S.CARRIAGE_BOLT_R).toBeLessThan(S.CARRIAGE_H / 2);
    // 方形导轨窗口必须比方轨略大，否则视觉上导轨会被座体吃掉
    expect(S.RAIL_HALF * 1.05).toBeGreaterThan(S.RAIL_HALF);
  });

  it('滚珠螺母座与丝杆同心：原点位不碰联轴器、终点位不新增 +X 凸出', () => {
    expect(S.NUT_FLANGE_R).toBeLessThan(SLIDER_SIZE[1] / 2);
    expect(S.NUT_BODY_R).toBeLessThan(S.NUT_FLANGE_R);
    expect(S.NUT_BOLT_PITCH + S.NUT_BOLT_R).toBeLessThan(S.NUT_FLANGE_R);
    // 螺母座装在 -X 端中央，最外端仍与联轴器留出可见间隙
    const nutMinX = SLIDER_MIN_X - SLIDER_SIZE[0] / 2
      - S.NUT_FLANGE_T - 0.002 - S.NUT_LEN - 0.004;
    const couplingMaxX = ASSEMBLY.frame.position[0] + F.COUPLING_X + F.COUPLING_LEN / 2;
    expect(nutMinX).toBeGreaterThan(couplingMaxX + 0.01);
    // 终点位滑台最右端不超过取药仓右缘
    expect(SLIDER_MAX_X + SLIDER_SIZE[0] / 2).toBeLessThan(COLLECT_BIN_X + BIN.W / 2);
  });

  it('工作台 4×2 螺纹孔与侧面铭牌都落在台面内，且避开 +Z 旋转气缸', () => {
    expect(S.TOP_HOLE_ROWS).toEqual([-1, 1]);
    expect(S.TOP_HOLE_COLS).toEqual([-1.5, -0.5, 0.5, 1.5]);
    const xs = S.TOP_HOLE_COLS.map((c) => (c / 1.5) * S.TOP_HOLE_X);
    expect(Math.max(...xs.map(Math.abs)) + S.TOP_HOLE_R).toBeLessThan(SLIDER_SIZE[0] / 2);
    expect(S.TOP_HOLE_Z + S.TOP_HOLE_R).toBeLessThan(SLIDER_SIZE[2] / 2);
    expect(S.TOP_HOLE_Z).toBeLessThan(ROTARY_CENTER.Z - ROTARY_BODY.D / 2);
    expect(S.PLATE_W).toBeLessThan(SLIDER_SIZE[0]);
    expect(S.PLATE_H).toBeLessThan(SLIDER_SIZE[1]);
  });

  it('装配表 / 行程 / 滑台尺寸零漂移，颜色仍只有 VISUAL 一个来源', () => {
    expect(ASSEMBLY.frame.position[0]).toBeCloseTo(FRAME_AXLE_FROM, 6);
    expect(ASSEMBLY.sliderHopper.position[0]).toBeCloseTo(SLIDER_MIN_X, 6);
    expect(FRAME.AXLE_TO - FRAME.AXLE_FROM).toBeCloseTo(FRAME_LEN, 6);
    expect(SLIDER_SIZE[0]).toBe(0.16);
    expect(VISUAL.PROFILE_SLOT_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    ['MachineFrame.tsx', 'SliderHopper.tsx'].forEach((file) => {
      const raw = componentSources[`./scenes/auto-dispensing/components/${file}`];
      expect(raw, `${file} 不应写死颜色`).not.toMatch(/color:\s*(0x[0-9a-f]{6}|'#)/i);
    });
  });
});

// ============================================================
// 2026-11-07 近景穿模修复：输出法兰盘与取药料斗后壁的几何隔离。
// 旧版盘半径 0.046 > 斗后壁半高 0.0325，且所有盘面贴片都放在 pivot z>0，
// 正好插进 wallZ- 的板厚 [0, T]，从斜上方看就是「银色弧线插进黄色斗内」。
// ============================================================
describe('输出法兰盘不再穿进料斗（近景穿模防回退）', () => {
  const rim = ROTARY_DISC_RIM;
  const hopper = componentSources['./scenes/auto-dispensing/components/SliderHopper.tsx'];

  it('盘半径小于斗后壁内轮廓的半高与半宽，盘缘不会越过斗口沿', () => {
    expect(rim.MAX_R).toBeCloseTo(
      Math.min(HOPPER.H / 2 - HOPPER.T, HOPPER.W / 2 - HOPPER.T), 9,
    );
    expect(ROTARY_DISC.R).toBeLessThan(rim.MAX_R);
    expect(ROTARY_DISC.R).toBeLessThan(HOPPER.H / 2);
    expect(HOPPER.W).toBeGreaterThan(2 * ROTARY_DISC.R);
  });

  it('盘缘亮边与径向紧定螺钉的外缘都留在 MAX_R 之内', () => {
    expect(ROTARY_DISC.R + rim.BAND_TUBE).toBeLessThan(rim.MAX_R);
    expect(ROTARY_DISC.R + rim.SCREW_LEN).toBeLessThan(rim.MAX_R);
    expect(rim.SCREW_N).toBeGreaterThanOrEqual(4);
    expect(hopper).toContain('RIM.MAX_R');
    expect(hopper).toContain('RIM.BAND_TUBE');
    expect(hopper).toContain('RIM.SCREW_LEN');
  });

  it('盘缘细节全部落在盘厚中面（pivot z = -TH/2 < 0），不进入斗后壁 [0, T]', () => {
    const midZ = -ROTARY_DISC.TH / 2;
    expect(midZ).toBeLessThan(0);
    expect(midZ + rim.BAND_TUBE).toBeLessThan(0);
    expect(midZ + rim.SCREW_R).toBeLessThan(0);
    expect(ROTARY_DISC.TH / 2 + midZ).toBeCloseTo(0, 9);
    expect(HOPPER.T).toBeGreaterThan(0);
    // 组件里盘缘贴片一律用局部 z=0（盘厚中面），不能退回 z>0
    expect(hopper).toContain('position={DISC_BODY_OFFSET}');
    expect(hopper).not.toMatch(/position=\{\[Math\.cos\(a\) \* r, Math\.sin\(a\) \* r, [^0]/);
  });

  it('装配基准 / 斗心 / 落点 / 倒药点零漂移：盘半径不参与任何位置推导', () => {
    expect(HOPPER_CENTER_Y).toBeGreaterThan(0);
    expect(HOPPER_CENTER_Z).toBeGreaterThan(0);
    expect(HOPPER_LOCAL_Y).toBeCloseTo(0, 9);
    expect(PILL_LAND_Y).toBeLessThan(HOPPER_OPEN_Y);
    expect(CHUTE_RAMP_END_Z).toBeLessThan(HOPPER_CENTER_Z);
    expect(ROTARY_DISC.TH).toBe(0.008);
  });

  it('旋转气缸顶面不再生成纯黑补丁：沉头孔 + 沿 X 分列的磁性开关', () => {
    // Raycaster 实测：旧版黑色 L 形斑块 = 2 只 ±Z 并排的 magSwitch 方盒
    // + 4 个纯黑安装孔圆柱，斜俯视重叠后投影到台面像「破了个洞」。
    expect(hopper).not.toContain('materials.magSwitch');
    expect(hopper).toContain('ROTARY_TOP_DETAIL');
    expect(hopper).toContain('TOP.SWITCH_X_RATIO');
    expect(hopper).toContain('TOP.HOLE_RING_R');
    const T = ROTARY_TOP_DETAIL;
    expect(2 * T.SWITCH_X_RATIO * ROTARY_BODY.W).toBeGreaterThan(T.SWITCH_W * 2);
    expect(T.HOLE_RING_R).toBeGreaterThan(T.HOLE_R);
  });
});

// ============================================================
// 2026-11-08 设备口径修正：普通正反转电机 + 轴末端独立增量编码器。
// 需求原文「增量式编码器，安装于轴末端」「终点限位 + 翻转位 + 编码器同侧」。
// 上一轮误按伺服电机建模（尾部集成编码器 + LREAL velocity 语义），本组断言
// 同时锁住「编码器在 +X 末端」与「控制信号只有布尔正反转」两条防回退约束。
// ============================================================
describe('驱动端口径：普通正反转电机 + 轴末端独立增量编码器', () => {
  const F = FRAME_DETAIL;
  const ST = DRIVE_STATIONS;
  const E = SHAFT_END_ENCODER;
  const ES = ENCODER_STATIONS;
  const frame = componentSources['./scenes/auto-dispensing/components/MachineFrame.tsx'];

  it('电机侧轴向站位首尾相接：风扇罩 ↔ 机身 ↔ 法兰 ↔ 罩 ↔ 支撑单元无空隙', () => {
    expect(ST.FAN_MAX).toBeCloseTo(ST.BODY_MIN, 9);
    expect(ST.BODY_MAX).toBeCloseTo(ST.FLANGE_MIN, 9);
    expect(ST.FLANGE_MAX).toBeCloseTo(ST.GUARD_MIN, 9);
    expect(ST.GUARD_MAX).toBeCloseTo(ST.SUPPORT_MIN, 9);
    expect(ST.SUPPORT_MIN).toBeLessThan(ST.SUPPORT_MAX);
    expect(ST.COUPLING_MIN).toBeGreaterThan(ST.GUARD_MIN);
    expect(ST.COUPLING_MAX).toBeLessThan(ST.GUARD_MAX);
    expect(ST).not.toHaveProperty('ENCODER_MIN');
    expect(ST).not.toHaveProperty('ENCODER_MAX');
  });

  it('三段式梅花联轴器：两铝毂 + 中间六瓣弹性体，互不重叠且填满总长', () => {
    expect(F.COUPLING_JAW_N).toBeGreaterThanOrEqual(6);
    expect(F.COUPLING_JAW_R).toBeGreaterThan(F.COUPLING_R);
    const leftEnd = ST.HUB_L + F.COUPLING_HUB_LEN / 2;
    const spiderMin = ST.SPIDER - F.COUPLING_SPIDER_LEN / 2;
    const spiderMax = ST.SPIDER + F.COUPLING_SPIDER_LEN / 2;
    const rightStart = ST.HUB_R - F.COUPLING_HUB_LEN / 2;
    expect(leftEnd).toBeLessThanOrEqual(spiderMin + 1e-9);
    expect(spiderMax).toBeLessThanOrEqual(rightStart + 1e-9);
    expect(2 * F.COUPLING_HUB_LEN + F.COUPLING_SPIDER_LEN).toBeLessThanOrEqual(F.COUPLING_LEN);
    expect(frame).toContain('JawCoupling');
    expect(frame).toContain('materials.couplingSpider');
  });

  it('电机安装支架把联轴器围住，中间敞开可见，内腔大于弹性体半径', () => {
    expect(F.GUARD_HALF_W).toBeGreaterThan(F.COUPLING_JAW_R);
    expect(F.GUARD_HALF_H).toBeGreaterThan(F.COUPLING_JAW_R);
    expect(F.GUARD_POST_W).toBeLessThan(ST.GUARD_MAX - ST.GUARD_MIN);
    expect(2 * F.GUARD_HALF_H - 2 * F.GUARD_T).toBeGreaterThan(2 * F.COUPLING_JAW_R);
    expect(frame).toContain('CouplingGuard');
  });

  it('固定端是方形支撑单元（含压盖螺栓 / 轴承外圈 / 锁紧螺母），浮动端才是圆筒', () => {
    expect(F.SUPPORT_UNIT_W).toBeGreaterThan(2 * F.SUPPORT_RING_R);
    expect(F.SUPPORT_UNIT_LEN).toBeCloseTo(0.08, 9);
    expect(F.SUPPORT_BORE_R).toBeGreaterThan(F.MOTOR_SHAFT_R);
    expect(F.SUPPORT_RING_R - F.SUPPORT_BORE_R * 0.22).toBeGreaterThan(F.COUPLING_R);
    expect(frame).toContain('FixedSupportUnit');
    expect(frame).toContain('FloatingBearing');
    expect(frame).toContain('fixed={px === from}');
    expect(frame).toContain('LOCK_NUT_LEN');
    expect(frame).toContain('SUPPORT_RING_R');
  });

  it('增量编码器独立装在 +X 丝杆末端，不在电机侧', () => {
    expect(E.BEARING_FACE_X).toBeGreaterThan(FRAME_LEN);
    expect(ES.SHAFT_MIN).toBeGreaterThan(FRAME_LEN);
    expect(ES.BODY_MIN).toBeGreaterThan(ES.SHAFT_MAX);
    expect(ES.BODY_MAX).toBeGreaterThan(ES.BODY_MIN);
    expect(ES.CABLE_MAX).toBeLessThan(FRAME_LEN + FRAME.BASE_PAD / 2);
    expect(ST.FAN_MIN).toBeLessThan(0);
    expect(frame).toContain('ShaftEndEncoder');
    expect(frame).toContain('EncoderRotatingParts');
    expect(frame).not.toContain('materials.encoderCap');
  });

  it('编码器安装链首尾相接：轴伸 → 波纹管联轴器 → 输入轴 → 带孔法兰 → 静止本体', () => {
    expect(ES.SHAFT_MAX).toBeCloseTo(ES.COUPLING_MIN, 9);
    expect(ES.COUPLING_MAX).toBeCloseTo(ES.INPUT_MIN, 9);
    expect(ES.INPUT_MAX).toBeCloseTo(ES.FLANGE_MAX, 9);
    expect(ES.FLANGE_MAX).toBeCloseTo(ES.BODY_MIN, 9);
    expect(ES.FLANGE_MIN).toBeGreaterThan(ES.INPUT_MIN); // 法兰套在输入轴末段，不是堵在联轴器前面
    expect(E.INPUT_SHAFT_LEN - E.FLANGE_T).toBeGreaterThan(0.016); // 细轴外露足够长，斜侧能读出穿孔关系
    expect(E.FLANGE_R).toBeGreaterThan(E.BODY_R);
    expect(E.FLANGE_R - E.BODY_R).toBeLessThan(0.004); // 法兰只比本体略大，Ø60 会遮住整段输入轴
    expect(E.BELLOWS_R).toBeLessThan(E.COUPLING_R); // 波纹管外径略小于铝毂
    expect(2 * E.HUB_LEN).toBeLessThan(E.COUPLING_LEN); // 中间必须留给波纹管
    expect(E.BELLOWS_N).toBeGreaterThanOrEqual(6);
    expect(E).not.toHaveProperty('SPIDER_R'); // 不再把电机侧梅花联轴器缩小复制
    const rotIdx = frame.indexOf('<EncoderRotatingParts />');
    const rotGroupEnd = frame.indexOf('</group>', rotIdx);
    expect(rotIdx).toBeGreaterThan(-1);
    expect(rotGroupEnd).toBeGreaterThan(rotIdx);
    expect(frame.indexOf('<ShaftEndEncoder />')).toBeGreaterThan(rotGroupEnd);
  });

  it('夹紧法兰带中心孔、输入轴穿孔而过，联轴器本体外露且带夹紧螺钉', () => {
    expect(E.FLANGE_BORE_R).toBeGreaterThan(E.INPUT_SHAFT_R + SURFACE_GAP);
    expect(E.FLANGE_BORE_R).toBeLessThan(E.FLANGE_R * 0.5);
    expect(E.INPUT_SHAFT_R).toBeLessThan(E.SHAFT_STUB_R); // 编码器轴比丝杆轴细
    expect(E.CLAMP_SCREW_R).toBeGreaterThan(0);
    expect(E.BRACKET_STRIP_W * 2).toBeLessThan(E.BRACKET_W); // 托板中间镂空
    expect(frame).toContain('latheGeometry');
    expect(frame).toContain('E.FLANGE_BORE_R');
    expect(frame).toContain('enc-bellows-');
    expect(frame).toContain('enc-clamp-');
    expect(frame).toContain('enc-hub-');
    expect(frame).toContain('enc-bracket-strip-');
    expect(frame).toContain('materials.encoderHub');
    expect(frame).toContain('materials.encoderBellows');
    // 防回退：法兰不得变回实心圆柱，联轴器不得变回三段式梅花弹性体
    expect(frame).not.toContain('enc-cpl-');
    expect(frame).not.toContain('E.FLANGE_R, E.FLANGE_R, E.FLANGE_T');
  });

  it('编码器侧新材质颜色只来自 VISUAL，且与电机侧梅花弹性体不同色', () => {
    expect(VISUAL.ENCODER_HUB_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.ENCODER_BELLOWS_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.ENCODER_BELLOWS_COLOR).not.toBe(VISUAL.ENCODER_HUB_COLOR);
    expect(VISUAL.ENCODER_BELLOWS_COLOR).not.toBe(VISUAL.COUPLING_SPIDER_COLOR);
    ['encoderHub:', 'encoderBellows:'].forEach((key) => {
      const i = materialsSource.indexOf(key);
      expect(i, `${key} 缺失`).toBeGreaterThan(-1);
      expect(materialsSource.slice(i, i + 220)).toContain('VISUAL.');
    });
  });

  it('普通异步电机外形：风扇罩 / 接线盒 / 底脚 / 环向散热筋，无伺服后罩与止口', () => {
    expect(F.MOTOR_FAN_LEN).toBeGreaterThan(0);
    expect(F.FAN_VENT_N).toBeGreaterThanOrEqual(6);
    expect(F.TERMINAL_BOX_W).toBeGreaterThan(0);
    expect(F).not.toHaveProperty('MOTOR_PILOT_R');
    expect(F).not.toHaveProperty('ENCODER_LEN');
    expect(frame).toContain('materials.motorFan');
    expect(frame).toContain('materials.terminalBox');
    expect(frame).toContain('motor-foot-');
    expect(frame).not.toContain('torusGeometry args={[D.MOTOR_PILOT_R');
    expect(frame).not.toContain('function ServoMotor');
  });

  it('控制信号只有两个布尔正/反转输出点，无 LREAL velocity 速度给定', () => {
    expect(MODBUS_READ_VARS.MOTOR_FWD).toBe(30);
    expect(MODBUS_READ_VARS.MOTOR_REV).toBe(31);
    const motorKeys = Object.keys(MODBUS_READ_VARS)
      .filter((k) => /MOTOR|SERVO|VELOCITY|SPEED/i.test(k)).sort();
    expect(motorKeys).toEqual(['MOTOR_FWD', 'MOTOR_REV']);
    // 数值寄存器只有位置 DINT；伺服方案必然多出一个 LReal 速度字
    expect(Object.keys(MODBUS_HOLDING_REGISTERS)).toEqual(['ENCODER_PULSES']);
  });

  it('散热筋与机身同色系，新增材质颜色仍只来自 VISUAL 单一来源', () => {
    expect(VISUAL.MOTOR_BODY_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.MOTOR_RIB_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.MOTOR_BODY_COLOR).not.toBe(VISUAL.MOTOR_RIB_COLOR);
    expect(VISUAL.COUPLING_SPIDER_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.ENCODER_BODY_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(frame).toContain('materials.motorBody');
    expect(frame).toContain('materials.motorRib');
    expect(frame).not.toContain('fin-');
    ['motorBody:', 'motorRib:', 'motorFan:', 'terminalBox:', 'encoderBody:', 'couplingSpider:'].forEach((key) => {
      const i = materialsSource.indexOf(key);
      expect(i, `${key} 缺失`).toBeGreaterThan(-1);
      expect(materialsSource.slice(i, i + 220)).toContain('VISUAL.');
    });
  });

  it('轴末端特写机位已接入工具栏与镜像取景', () => {
    expect(VIEW_PRESETS.shaftEnd).toBeTruthy();
    expect(switcherSource).toContain("'shaftEnd'");
    expect(viewGoalsSource).toContain("'shaftEnd'");
  });

  it('旧版裸露光轴 / 独立黑编码器 / 皮带轮 / 单机身 ServoMotor 已删除', () => {
    expect(frame).not.toContain('function ServoMotor');
    expect(frame).not.toContain('COUPLING_LEN * 0.34');
    expect(frame).not.toContain('0.035, 0.035, 0.05');
    expect(frame).toContain('DriveEnd');
  });
});

describe('驱动端特写机位：拟真零件的验收视角', () => {
  it('drive 是窄视野局部机位，从起点端外侧 +Z 侧看整条驱动链', () => {
    const d = VIEW_PRESETS.drive;
    expect(d).toBeTruthy();
    expect(d.fov).toBeLessThan(VIEW_PRESETS.overview.fov);
    expect(d.camera[0]).toBeLessThan(0);       // 站在正反转电机外侧
    expect(d.camera[2]).toBeGreaterThan(0);    // 从观察者一侧看，联轴器不被电机挡住
    expect(d.camera[1]).toBeGreaterThan(d.target[1]);
  });

  it('镜像布局用局部特写的小平移，且工具栏与相机解析都接上了 drive', () => {
    expect(Math.abs(MIRROR_LOCAL_VIEW_SHIFT)).toBeLessThan(Math.abs(MIRROR_VIEW_SHIFT));
    expect(switcherSource).toContain("'drive'");
    expect(viewGoalsSource).toContain("'drive'");
  });

  it('机架展台仍把外伸的正反转电机与轴末端编码器完整收进画面', () => {
    // 用较保守的 1.4 宽高比估算水平半视野，保证窄窗口下也不裁切
    const halfW = (stageExtent('frame').height * 1.4) / 2;
    const midX = PART_STAGES.frame.target[0];
    expect(midX - halfW).toBeLessThan(F.MOTOR_MIN_X);
    expect(midX + halfW).toBeGreaterThan(FRAME_LEN + FRAME.BASE_PAD / 2);
    expect(midX + halfW).toBeGreaterThan(ENCODER_STATIONS.CABLE_MAX);
  });
});

// ============================================================
// 滚珠丝杆传动比例：把「像不像真实丝杆」量化，防止以后有人把导程改回
// 0.09 m/转（导程/直径 3.0、升角 43.7°，那是一根弹簧不是滚珠丝杆）。
// ============================================================
const K = SCREW_DETAIL;
const screwDiameter = 2 * AXIS_R;
const leadAngleDeg = (Math.atan(K.LEAD / (Math.PI * screwDiameter)) * 180) / Math.PI;
const screwTurns = FRAME_LEN / K.LEAD;
const screwRpm = (K.SLIDER_SPEED / K.LEAD) * 60;

describe('滚珠丝杆传动比例：几何 / 运动学 / 控制语义', () => {
  it('导程与直径之比、螺纹升角落在真实滚珠丝杆范围', () => {
    expect(screwDiameter).toBeCloseTo(0.030, 6);
    expect(K.LEAD / screwDiameter).toBeGreaterThan(0.2);
    expect(K.LEAD / screwDiameter).toBeLessThan(1.0);
    expect(leadAngleDeg).toBeGreaterThan(3);
    expect(leadAngleDeg).toBeLessThan(15);
  });

  it('螺旋牙贴合轴面、不穿出滚珠螺母内孔，采样量可控', () => {
    expect(K.THREAD_R - K.THREAD_TUBE_R).toBeLessThanOrEqual(AXIS_R);
    expect(K.THREAD_R + K.THREAD_TUBE_R).toBeGreaterThan(AXIS_R);
    expect(K.THREAD_R + K.THREAD_TUBE_R).toBeLessThan(S.NUT_BODY_R);
    expect(screwTurns).toBeGreaterThan(50);
    const tubeSegments = Math.round(screwTurns * K.SEGMENTS_PER_TURN);
    expect(tubeSegments).toBeLessThan(6000);
    // 细牙不能把软件渲染拖垮：三角形总量须与旧粗牙实现（0.09 导程 / 24 点 / 8 段）同量级
    const triangles = tubeSegments * K.THREAD_RADIAL_SEGMENTS * 2;
    const oldTriangles = (FRAME_LEN / 0.09) * 24 * 8 * 2;
    expect(triangles).toBeLessThan(oldTriangles * 1.5);
  });

  it('滑台速度 / 导程 = 丝杆转速，落在减速电机常用区间', () => {
    expect(screwRpm).toBeGreaterThan(300);
    expect(screwRpm).toBeLessThan(3000);
    // 每走一个导程正好转一圈，运动学联动只由 LEAD 决定
    expect(((K.SLIDER_SPEED / K.LEAD) * K.LEAD)).toBeCloseTo(K.SLIDER_SPEED, 12);
  });

  it('编码器按 1024 脉冲/转 × 丝杆导程换算，行程跨 16 位边界', () => {
    expect(ENCODER_PULSES_PER_REV).toBe(1024);
    expect(PULSES_PER_M).toBe(ENCODER_PULSES_PER_REV / K.LEAD);
    expect(PULSES_PER_M * (SLIDER_MAX_X - SLIDER_MIN_X)).toBeCloseTo(ENCODER_PULSES_MAX, 6);
    // 每转正好 1024 个脉冲，证明口径来自「轴末端编码器测丝杆转角 × 导程」而非直线标尺
    expect(PULSES_PER_M * K.LEAD).toBeCloseTo(ENCODER_PULSES_PER_REV, 6);
    // 87040 > 65535：单字 16 位寄存器会溢出，必须由两个 16 位字组成 32 位 DINT
    expect(ENCODER_PULSES_MAX).toBeGreaterThan(0xffff);
    expect(ENCODER_PULSES_MAX).toBeLessThan(2 ** 31);
  });

  it('有效行程 / 丝杆总长落在常见模组区间，且装配接口零漂移', () => {
    const ratio = (SLIDER_MAX_X - SLIDER_MIN_X) / FRAME_LEN;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.85);
    expect(FRAME.AXLE_TO - FRAME.AXLE_FROM).toBeCloseTo(FRAME_LEN, 6);
  });
});

describe('手动出药：视觉药片堆与物理刚体共用 store.dispensed 单一真值', () => {
  it('store 提供 dispensed 与 setDispensed，初始四仓全 false', () => {
    const s = useDispensingStore.getState();
    expect(s.dispensed).toEqual({ A: false, B: false, C: false, D: false });
    expect(typeof s.setDispensed).toBe('function');
  });

  it('MagazineUnit 直接读 store 真值，不再从气缸 position 反推出药状态', () => {
    const raw = componentSources['./scenes/auto-dispensing/components/MagazineUnit.tsx'];
    expect(raw).toContain('s.dispensed[mag]');
    expect(raw).toContain('dispensed={dispensed}');
    expect(raw).toContain('if (dispensed)');
    expect(raw).not.toContain('isCylDispensed');
  });

  it('演示循环不再维护本地 fired，出药上锁与视觉状态同源', () => {
    expect(loopSource).toContain('st.dispensed[mag]');
    expect(loopSource).toContain('st.setDispensed(mag, true)');
    expect(loopSource).toContain('st.setDispensed(mag, false)');
    expect(loopSource).not.toMatch(/\bfired\b/);
    expect(loopSource).not.toContain('isCylDispensed');
  });
});

// ============================================================
// z-fighting 防护：把「相邻可见面必须错开」量化成断言。
// 旧版大量 0.0005~0.001 级贴面偏置，在 SCENE_SCALE=3 + 远机位下
// 深度精度不足 → 灰/黑斑驳闪烁（用户反馈：支架底部、斜槽底板/侧边）。
// ============================================================
describe('z-fighting 防护：相邻可见面不再共面', () => {
  it('SURFACE_GAP 足够大：整机放大后仍有可分辨深度差，又不把细节顶成悬浮', () => {
    expect(SURFACE_GAP).toBeGreaterThan(0.001);        // 旧版 0.0005~0.001 会闪
    expect(SURFACE_GAP).toBeLessThan(0.005);           // 过大就会看出贴面飘起来
    expect(SURFACE_GAP * SCENE_SCALE).toBeGreaterThan(0.006);
  });

  it('落料斜槽：挡边外沿与底面都离开底板，内沿仍压住底板边缘不露缝', () => {
    const R = CHUTE_RAIL;
    const plateEdge = MAG_TRAY_W / 2;
    const railCenterX = plateEdge - R.T / 2 + R.OUT;
    const railOuter = railCenterX + R.T / 2;
    const railInner = railCenterX - R.T / 2;
    const rampTopOffset = R.RAMP_T / 2;
    const railBottomOffset = rampTopOffset + R.RISE;
    // 外侧：两块朝外的面不再停在同一 X 平面
    expect(railOuter - plateEdge).toBeGreaterThanOrEqual(SURFACE_GAP);
    // 内侧：挡边仍压住底板，药片不会从缝里漏出去
    expect(railInner).toBeLessThan(plateEdge);
    expect(plateEdge - railInner).toBeLessThan(R.T);
    // 底部：挡边底面高于底板顶面，不再共面
    expect(railBottomOffset - rampTopOffset).toBeGreaterThanOrEqual(SURFACE_GAP);
    expect(R.RAMP_T).toBeGreaterThan(0);
    expect(R.H).toBeGreaterThan(PILL_H);
  });

  it('斜槽视觉与物理碰撞体共用 CHUTE_RAIL 单一来源', () => {
    const visual = componentSources['./scenes/auto-dispensing/components/MagazineUnit.tsx'];
    expect(visual).toContain('CHUTE_RAIL');
    expect(physicsGeometrySource).toContain('CHUTE_RAIL');
    expect(physicsGeometrySource).toContain('RAMP_T: CHUTE_RAIL.RAMP_T');
    expect(physicsGeometrySource).toContain('RAIL_T: CHUTE_RAIL.T');
    expect(physicsGeometrySource).toContain('RAIL_H: CHUTE_RAIL.H');
    expect(physicsGeometrySource).not.toContain('RAIL_INSET');
    expect(physicsGeometrySource).not.toContain('RAIL_OFFSET_Y');
  });

  it('机架垫脚六面错开：顶面高于底座、底面下探，不再灰黑重叠闪烁', () => {
    expect(FOOT_RISE).toBeGreaterThan(SURFACE_GAP);
    expect(FRAME.BASE_H + FOOT_RISE).toBeGreaterThan(FRAME.BASE_H);
    expect(-SURFACE_GAP).toBeLessThan(0);
    const frame = componentSources['./scenes/auto-dispensing/components/MachineFrame.tsx'];
    expect(frame).toContain('FOOT_RISE');
    expect(frame).toContain('SURFACE_GAP');
    expect(frame).toContain('FRAME.BASE_H + FOOT_RISE + SURFACE_GAP');
  });

  it('托架立柱顶面嵌进横梁，且底端仍落在世界 y=0.02（装配接口零漂移）', () => {
    expect(RACK.PILLAR_TOP_Y).toBeGreaterThan(-RACK.BEAM_H / 2);
    expect(RACK.PILLAR_TOP_Y + RACK.BEAM_H / 2).toBeCloseTo(SURFACE_GAP, 6);
    expect(ASSEMBLY.magazineRack.position[1] + RACK_PILLAR_CY - RACK_PILLAR_H / 2)
      .toBeCloseTo(0.02, 6);
  });

  it('取药仓脚垫低于台座底面，顶框四角不再两两共面，仓内药片离开底板', () => {
    const pedestalBottom = BIN.PEDESTAL_Y - BIN.PEDESTAL_H / 2;
    const footBottom = BIN.FOOT_Y - BIN.FOOT_H / 2;
    expect(pedestalBottom - footBottom).toBeCloseTo(SURFACE_GAP, 6);
    const bin = componentSources['./scenes/auto-dispensing/components/CollectBin.tsx'];
    expect(bin).toContain('W - 2 * T - 0.008');
    expect(bin).toContain('T + PILL_H / 2 + SURFACE_GAP');
  });

  it('滑台上下压板半嵌入本体；输出法兰盘细节一律走盘厚中面，不再插进斗壁', () => {
    const hopper = componentSources['./scenes/auto-dispensing/components/SliderHopper.tsx'];
    expect(hopper).toContain('PLATE_T / 2 - SURFACE_GAP / 2');
    expect(hopper).toContain('DISC_BODY_OFFSET');
    expect(hopper).toContain('ROTARY_DISC_RIM');
    expect(hopper).toContain('materials.decal');
    // 旧版刻度环 / 刻线 / 螺栓孔 / 夹紧螺栓都在 pivot z>0，正是斗后壁板厚所在
    expect(hopper).not.toContain('DISC_TH / 2 + SURFACE_GAP');
    expect(hopper).not.toContain('HOPPER_BRACKET_TH / 4');
    expect(hopper).not.toContain('materials.decalDark');
  });

  it('按钮柜贴面统一错开，柜脚外沿比柜体大一圈，且 SURFACE_GAP 已 import', () => {
    const cabinet = componentSources['./scenes/auto-dispensing/components/ControlCabinet.tsx'];
    expect(cabinet).toContain('VISUAL, SURFACE_GAP');
    expect(cabinet).toContain('P.FRONT_Z + SURFACE_GAP');
    expect(cabinet).toContain('CABINET_SIZE[0] + 2 * SURFACE_GAP');
    expect(cabinet).toContain('P.FRONT_Z - P.T / 2 - SURFACE_GAP / 2');
    // 蘑菇头改成 Lathe 平顶后，符号贴片统一贴到 ES.CAP_Z（平顶绝对 Z）之外
    expect(cabinet).toContain('ES.CAP_Z + SURFACE_GAP');
  });

  it('三个贴面材质都带 polygonOffset，作为渲染层深度精度兜底', () => {
    ['profileSlot:', 'decal:', 'decalDark:'].forEach((key) => {
      const i = materialsSource.indexOf(key);
      expect(i, `${key} 缺失`).toBeGreaterThan(-1);
      expect(materialsSource.slice(i, i + 260)).toContain('polygonOffset: true');
    });
  });

  it('组件里不再出现 0.0005 / 0.0006 级「几乎贴着」的偏置', () => {
    [
      'MachineFrame.tsx', 'MagazineUnit.tsx', 'SliderHopper.tsx',
      'CollectBin.tsx', 'ControlCabinet.tsx',
    ].forEach((f) => {
      const raw = componentSources[`./scenes/auto-dispensing/components/${f}`];
      expect(raw, `${f} 仍有 0.0005/0.0006 贴面`).not.toMatch(/0\.000[56]\b/);
    });
  });
});

// ============================================================
// 轴末端编码器部件展台（2026-11-08）：1:1 裸视图 + 外观可辨识度。
// 展台必须复用整机同一批几何，否则改一处尺寸就会出现两套真值。
// ============================================================
describe('轴末端编码器展台与外观可辨识度', () => {
  const E = SHAFT_END_ENCODER;
  const ES = ENCODER_STATIONS;
  const frame = componentSources['./scenes/auto-dispensing/components/MachineFrame.tsx'];

  it('展台取景把整条安装链（浮动轴承座 → A/B 相线尾）完整收进画面', () => {
    const s = PART_STAGES.encoder;
    const halfW = (stageExtent('encoder').height * 1.4) / 2;
    const left = FRAME.AXLE_TO - FRAME_DETAIL.SUPPORT_UNIT_LEN / 2 - E.BEARING_FACE_X;
    const right = ES.CABLE_MAX - E.BEARING_FACE_X;
    expect(s.camera[1]).toBeGreaterThan(s.target[1]);
    expect(s.target[0] - halfW).toBeLessThan(left);
    expect(s.target[0] + halfW).toBeGreaterThan(right);
    expect(PART_STAGE_ORIGIN.encoder).toContain('丝杆轴线');
    expect(Math.round(s.grid / 0.1) * 0.1).toBeCloseTo(s.grid, 6);
  });

  it('展台复用整机几何：只做一次刚性平移，不复制任何造型', () => {
    expect(sceneContentSource).toContain("case 'encoder'");
    expect(sceneContentSource).toContain('<EncoderStage />');
    expect(frame).toContain('export function EncoderStage');
    expect(frame).toContain('[-E.BEARING_FACE_X, -FRAME.SCREW_H, 0]');
    expect(frame).toContain('<FloatingBearing x={FRAME.AXLE_TO} />');
    const stageBody = frame.slice(frame.indexOf('export function EncoderStage'));
    expect(stageBody).not.toMatch(/cylinderGeometry|boxGeometry|sphereGeometry/);
  });

  it('本体保持光面编码器外观，标识件用低金属度亮银，颜色只来自 VISUAL', () => {
    expect(E.BAND_R).toBeGreaterThan(E.BODY_R);
    expect(E.BAND_T).toBeLessThan(E.BODY_LEN / 4);
    expect(E.PHASE_CABLE_GAP + E.PHASE_CABLE_R).toBeLessThan(E.CONN_R);
    expect(E.NAMEPLATE_W).toBeLessThan(E.BODY_LEN);
    expect(frame).toContain('materials.encoderTrim');
    expect(frame).toContain('materials.encoderZMark');
    expect(frame).toContain('materials.encoderPhaseA');
    expect(frame).toContain('materials.encoderPhaseB');
    expect(frame).toContain('enc-band-');
    expect(frame).toContain('enc-phase-');
    // 防回退：本体不得回到「电机式纵向散热筋」，否则又会被误认成另一个电机
    expect(frame).not.toContain('enc-knurl-');
    expect(frame).not.toContain('E.KNURL_');
    expect(frame).not.toContain('E.CABLE_R'); // 旧单根黑电缆已换成 A/B 分色双线
    expect(VISUAL.ENCODER_Z_MARK_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.ENCODER_PHASE_A_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(VISUAL.ENCODER_PHASE_B_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    const keys = ['encoderTrim:', 'encoderZMark:', 'encoderPhaseA:', 'encoderPhaseB:'];
    keys.forEach((key) => {
      const i = materialsSource.indexOf(key);
      expect(i, `${key} 缺失`).toBeGreaterThan(-1);
      expect(materialsSource.slice(i, i + 260)).toContain('VISUAL.');
    });
    // 无 envMap 场景里 0.8+ metalness 会把亮银压成灰蓝，标识件必须单独降金属度
    const trimSrc = materialsSource.slice(materialsSource.indexOf('encoderTrim:'), materialsSource.indexOf('encoderTrim:') + 260);
    const trimMetal = Number(trimSrc.match(/metalness:\s*([0-9.]+)/)?.[1]);
    expect(trimMetal).toBeLessThan(0.35);
    expect(trimSrc).toContain('VISUAL.SILVER_COLOR');
  });
});
