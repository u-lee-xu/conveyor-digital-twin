/**
 * 两场景风格一致性自检。
 *
 * 目标：自动配药 / 传送带分拣必须共用同一套工业视觉令牌、灯光、标签 chip、
 * 贴面间隙与 UI 组件语言；传送带侧不得再出现写死的数字色值、霓虹发光、
 * 玻璃拟态或半球发光球这类「特效」建模。
 *
 * 用 Vite 的 ?raw / import.meta.glob 读源码（本包 vite.config 挂了
 * electron-renderer，node:fs 在 vitest 的 ESM 环境里不可用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CSS 用文件读取而不是 ?raw：Vitest 默认会 stub CSS 模块，
 * ?raw 拿到的是空串；源码级断言必须读到真实文本。
 */
const cssSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
);
import {
  INDUSTRIAL_VISUAL, INDUSTRIAL_LIGHTING, INDUSTRIAL_DETAIL, LABEL_COLORS,
} from '../../shared/src/styles/industrialVisual';
import {
  VISUAL, SURFACE_GAP, VIEW_PRESETS, VIEW_BUTTONS,
  BELT_DETAIL, CYLINDER_DETAIL, SCENE_CAMERA, SCENE_TARGET, SCENE_FOV,
} from './scenes/conveyor-sorting/constants';

// import.meta.glob 只接受字面量，统一用一条数组字面量收集全部源码
const rawSources = import.meta.glob<string>(
  [
    './index.ts',
    './App.tsx',
    './components/scene/shared/materials.ts',
    './components/panels/*.tsx',
    './platform/ConveyorSceneWrapper.tsx',
    './scenes/conveyor-sorting/CameraRig.tsx',
    './scenes/conveyor-sorting/cameraGoals.ts',
    './scenes/conveyor-sorting/components/*.tsx',
    '../../shared/src/components/PhysicsScene.tsx',
    '../../auto-dispensing/src/scenes/auto-dispensing/constants.ts',
    '../../auto-dispensing/src/components/scene/shared/labelColors.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

/** 按路径后缀取源码，避免依赖 Vite 对跨包路径的 key 归一化方式 */
const rawOne = (suffix: string): string => {
  const hit = Object.entries(rawSources).find(([key]) => key.endsWith(suffix));
  return hit ? hit[1] : '';
};

const materialsSource = rawOne('components/scene/shared/materials.ts');
const dispensingConstantsSource = rawOne('auto-dispensing/src/scenes/auto-dispensing/constants.ts');
const dispensingLabelSource = rawOne('auto-dispensing/src/components/scene/shared/labelColors.ts');
const physicsSceneSource = rawOne('shared/src/components/PhysicsScene.tsx');
const wrapperSource = rawOne('platform/ConveyorSceneWrapper.tsx');
const deviceSource = rawOne('/index.ts');
const appSource = rawOne('/App.tsx');
const panelSources = Object.entries(rawSources).filter(([key]) => key.includes('/components/panels/'));
const sceneSource = (name: string) => rawOne(`components/${name}`);

describe('共享工业视觉令牌：两个场景只能有一个颜色来源', () => {
  it('传送带 VISUAL 完整展开共享令牌，值零漂移', () => {
    Object.entries(INDUSTRIAL_VISUAL).forEach(([key, value]) => {
      expect((VISUAL as unknown as Record<string, unknown>)[key], `${key} 与共享令牌不一致`).toBe(value);
    });
    expect(VISUAL.SCENE_BACKGROUND).toBe(INDUSTRIAL_VISUAL.SCENE_BACKGROUND);
    expect(VISUAL.SCENE_LIGHTING).toBe(INDUSTRIAL_LIGHTING);
  });

  it('自动配药 constants / labelColors 也引用同一份共享令牌', () => {
    expect(dispensingConstantsSource).toContain('shared/src/styles/industrialVisual');
    expect(dispensingConstantsSource).toContain('...INDUSTRIAL_VISUAL');
    expect(dispensingConstantsSource).toContain('SCENE_LIGHTING: INDUSTRIAL_LIGHTING');
    expect(dispensingConstantsSource).toContain('INDUSTRIAL_DETAIL.SURFACE_GAP');
    expect(dispensingLabelSource).toContain('shared/src/styles/industrialVisual');
  });

  it('贴面间隙与标签 chip 是同一份对象，不再各自维护', () => {
    expect(SURFACE_GAP).toBe(INDUSTRIAL_DETAIL.SURFACE_GAP);
    expect(SURFACE_GAP).toBeGreaterThan(0.001);
    expect(SURFACE_GAP).toBeLessThan(0.005);
    expect(VISUAL.LABEL_COLORS).toBe(LABEL_COLORS);
    expect(LABEL_COLORS.red).toBeTruthy();
  });

  it('布光三点齐全，主光强于补光且补光为冷色', () => {
    expect(INDUSTRIAL_LIGHTING.key).toBeGreaterThan(INDUSTRIAL_LIGHTING.fill);
    expect(INDUSTRIAL_LIGHTING.fill).toBeGreaterThan(0);
    expect(INDUSTRIAL_LIGHTING.fillColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(INDUSTRIAL_LIGHTING.keyPosition).toHaveLength(3);
    expect(INDUSTRIAL_LIGHTING.fillPosition).toHaveLength(3);
  });
});

describe('3D 风格：材质与模型都走工业实物语言', () => {
  it('materials.ts 不写死任何十六进制颜色，只引用 VISUAL', () => {
    expect(materialsSource).toContain("from '../../../scenes/conveyor-sorting/constants'");
    expect(materialsSource).not.toMatch(/color:\s*(0x[0-9a-fA-F]{6}|'#[0-9a-fA-F]{3,8}')/);
    expect(materialsSource).not.toMatch(/emissive:\s*0x[0-9a-fA-F]{6}/);
  });

  it('贴面材质保留 polygonOffset 渲染层兜底', () => {
    expect(materialsSource).toContain('polygonOffset: true');
    ['profileSlot:', 'decal:', 'decalDark:'].forEach((key) => {
      const i = materialsSource.indexOf(key);
      expect(i, `${key} 缺失`).toBeGreaterThan(-1);
      expect(materialsSource.slice(i, i + 240)).toContain('decalOptions');
    });
  });

  it('输送线补了铝挤型材 / 端盖 / 地脚 / 驱动端，碰撞体尺寸不改写', () => {
    const belt = sceneSource('PhysicsConveyorBelt.tsx');
    ['BELT_DETAIL', 'ProfileRail', 'SupportLegs', 'DriveMotor', 'RollerEnds', 'SURFACE_GAP'].forEach((k) => {
      expect(belt, `${k} 缺失`).toContain(k);
    });
    expect(belt).toContain('CuboidCollider');
    expect(belt).toContain('PHYSICS.CONVEYOR_BELT_HALF_Y');
    expect(BELT_DETAIL.SLOT_INSET).toBe(SURFACE_GAP);
    expect(BELT_DETAIL.RAIL_OUT).toBeGreaterThanOrEqual(SURFACE_GAP);
  });

  it('信号灯塔改为分层圆柱灯罩，不再有半球灯罩与悬浮发光球', () => {
    const tower = sceneSource('PhysicsSignalTower.tsx');
    expect(tower).toContain('cylinderGeometry');
    expect(tower).toContain('VISUAL.LAMP_RED');
    expect(tower).toContain('VISUAL.LAMP_GREEN');
    expect(tower).not.toContain('sphereGeometry');
    expect(tower).not.toContain('TOWER_GLOW_RADIUS');
    expect(tower).not.toContain('TOWER_DOME_RADIUS');
  });

  it('气缸与传感器用共享材质 + 拟真细节常量', () => {
    const cyl = sceneSource('PhysicsCylinder.tsx');
    expect(cyl).toContain('CYLINDER_DETAIL');
    expect(cyl).toContain('materials.brass');
    expect(cyl).toContain('VISUAL.LAMP_GREEN');
    expect(cyl).toContain('VISUAL.LAMP_DARK');
    expect(CYLINDER_DETAIL.TIE_ROD_R).toBeGreaterThan(0);

    const sensor = sceneSource('PhysicsSensor.tsx');
    expect(sensor).toContain('materials.lampDark');
    expect(sensor).toContain('materials.brass');
    expect(sensor).not.toContain('SENSOR_ACTIVE_COLOR');
  });

  it('物料台从木质改成铝板台面', () => {
    const table = sceneSource('PhysicsMaterialTable.tsx');
    expect(table).toContain('materials.panel');
    expect(table).not.toContain('materials.wood');
  });
});

describe('UI 风格：扁平工业深色，与配药面板同一套组件类', () => {
  it('全局 CSS 不再含赛博特效', () => {
    [
      'body::before', 'gradient-border', 'neon-glow', 'text-gradient',
      'scanline', 'data-flow', 'glass-enhanced', 'borderGlow', 'dataScroll',
      'hud-scanline', 'backdrop-filter: blur(24px)',
    ].forEach((k) => expect(cssSource, `残留赛博样式 ${k}`).not.toContain(k));
  });

  it('全局 CSS 提供与配药一致的组件类', () => {
    ['.card', '.card-accent', '.section-title', '.mode-tabs', '.mode-tab', '.btn',
      '.badge', '.badge-green', '.device-card', '.status-badge', '.progress-bar',
      '.io-led', '.addr-tag', '.step-list', '.scrollbar-thin'].forEach((k) => {
      expect(cssSource, `${k} 缺失`).toContain(k);
    });
  });

  it('面板不再使用共享 Button / glow 霓虹属性', () => {
    panelSources.forEach(([file, source]) => {
      expect(source, `${file} 仍引用共享 Button`).not.toMatch(/import\s*\{[^}]*Button[^}]*\}\s*from\s*'@digital-twin\/shared'/);
      expect(source, `${file} 仍有 glow 属性`).not.toMatch(/\bglow\b/);
    });
  });

  it('独立 App 与平台壳共用同一场景容器，不再套玻璃大卡片', () => {
    expect(appSource).toContain('ConveyorSceneWrapper');
    expect(appSource).toContain('mode-tabs');
    expect(appSource).not.toContain('PhysicsScene');
    expect(appSource).not.toContain('backdrop-blur-xl');
    expect(deviceSource).toContain('SceneWrapper: ConveyorSceneWrapper');
    expect(deviceSource).toContain('cameraPosition: SCENE_CAMERA');
  });
});

describe('场景容器与机位：两个入口渲染一致', () => {
  it('共享 PhysicsScene 以可选参数支持工业布光，旧设备默认值不变', () => {
    expect(physicsSceneSource).toContain('lighting?: IndustrialLighting');
    expect(physicsSceneSource).toContain('background?: string');
    expect(physicsSceneSource).toContain('LEGACY_BACKGROUND');
    expect(physicsSceneSource).toContain('makeDefault');
    expect(physicsSceneSource).toContain('ambientLight');
  });

  it('传送带容器把背景和三点布光接到共享令牌上', () => {
    expect(wrapperSource).toContain('background={VISUAL.SCENE_BACKGROUND}');
    expect(wrapperSource).toContain('lighting={VISUAL.SCENE_LIGHTING}');
    expect(wrapperSource).toContain('orbitTarget={SCENE_TARGET}');
    expect(wrapperSource).toContain('ConveyorViewSwitcher');
  });

  it('五个机位全部有相机 / 观察点 / FOV，首屏与总览一致', () => {
    expect(VIEW_BUTTONS).toHaveLength(5);
    VIEW_BUTTONS.forEach((key) => {
      const v = VIEW_PRESETS[key];
      expect(v, `${key} 缺失`).toBeTruthy();
      expect(v.camera).toHaveLength(3);
      expect(v.target).toHaveLength(3);
      expect(v.fov).toBeGreaterThanOrEqual(30);
      expect(v.fov).toBeLessThanOrEqual(60);
      expect(v.camera[1]).toBeGreaterThan(v.target[1]);
    });
    expect(VIEW_PRESETS.overview.camera).toBe(SCENE_CAMERA);
    expect(VIEW_PRESETS.overview.target).toBe(SCENE_TARGET);
    expect(VIEW_PRESETS.overview.fov).toBe(SCENE_FOV);
  });

  it('默认总览收紧视角并把设备推到左侧面板右边，与配药画面占比对齐', () => {
    // 传送带本体世界尺寸小于放大 3 倍的配药整机，45° 会让设备只占半屏。
    expect(SCENE_FOV).toBe(36);
    expect(SCENE_FOV).toBeLessThan(VIEW_PRESETS.top.fov);
    expect(VIEW_PRESETS.overview.fov).toBe(SCENE_FOV);
    expect(VIEW_PRESETS.overview.target).toBe(SCENE_TARGET);
  });

  it('总览从传送带侧（-Z）看气缸前脸，不是从气缸后端看', () => {
    // 气缸全部在 +Z 侧（0.8 / 1.2），相机必须落在 -Z 才能看到推板正面。
    expect(SCENE_CAMERA[2]).toBeLessThan(0);
    expect(VIEW_PRESETS.feed.camera[2]).toBeLessThan(0);
    expect(VIEW_PRESETS.sorting.camera[2]).toBeLessThan(0);
    // 屏幕右方向变为 (-X, -Z)，所以观察点要向 +X 偏才能把设备推离左侧面板。
    expect(SCENE_TARGET[0]).toBeGreaterThan(0);
  });

  it('阻尼计算拆成纯函数模块，组件里不直接改 hook 返回值', () => {
    const rig = rawOne('/CameraRig.tsx');
    const goals = rawOne('/cameraGoals.ts');
    expect(rig).toContain('dampCameraToward(camera, controls, goal, alpha)');
    expect(rig).not.toContain('camera.fov +=');
    expect(goals).toContain('export function resolveViewGoal');
    expect(goals).toContain('export function dampCameraToward');
  });
});
