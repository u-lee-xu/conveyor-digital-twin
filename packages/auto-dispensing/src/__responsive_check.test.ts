/**
 * 跨设备画面适配自检（2026-11-08）。
 *
 * 真实 Chrome 六组视口诊断（before）暴露三类问题：
 *   · 手机竖屏 390×844 的观众端只看到设备中段，左右两端全被裁掉（相机 FOV 按桌面 16:10 标定）；
 *   · 设备选择页 h-screen overflow-hidden，标题被挤出视口且最后一张卡不可达；
 *   · useMobile 断点 640 把 768/844/1024 宽的平板误判成桌面，320px 左栏挡住半台设备。
 *
 * 这里把「桌面零回退 + 窄屏补偿倍数 + 各入口接线」量化成防回退断言。
 */
import { describe, it, expect } from 'vitest';
import {
  DESIGN_ASPECT, MAX_ASPECT_FIT,
  aspectFitScale, fitCameraPosition, fitMaxDistance, renderPixelRatio,
} from '../../shared/src/styles/aspectFit';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const useMobileSrc = read('../../shared/src/hooks/useMobile.ts');
const physicsSceneSrc = read('../../shared/src/components/PhysicsScene.tsx');
const launcherSrc = read('../../platform/src/LauncherPage.tsx');
const viewerSrc = read('../../platform/src/ViewerWorkspace.tsx');
const shellSrc = read('../../platform/src/WorkspaceShell.tsx');
const cameraRigSrc = read('./scenes/auto-dispensing/CameraRig.tsx');
const wrapperSrc = read('./platform/DispensingSceneWrapper.tsx');
const switcherSrc = read('./platform/ViewSwitcher.tsx');
const labelSrc = read('./scenes/auto-dispensing/components/PhysicsLabel.tsx');
const platformCss = read('../../platform/src/index.css');
const dispensingCss = read('./index.css');

describe('相机宽高比补偿：桌面不动，窄屏拉远', () => {
  it('桌面 16:10 / 16:9 及更宽一律不补偿，观感零回退', () => {
    expect(aspectFitScale(1440, 900)).toBe(1);
    expect(aspectFitScale(1920, 1080)).toBe(1);
    expect(aspectFitScale(1600, 900)).toBe(1);
    expect(DESIGN_ASPECT).toBe(1.6);
  });

  it('手机竖屏按基准比例拉远，平板竖屏 / 横屏也补偿', () => {
    const phone = aspectFitScale(390, 844);
    // 竖屏夹到「刚好完整入画」的倍数：再拉远只会让设备更小、上下留白更多
    expect(phone).toBeGreaterThan(2.8);
    expect(phone).toBeLessThanOrEqual(MAX_ASPECT_FIT);
    expect(MAX_ASPECT_FIT).toBe(2.9);
    expect(aspectFitScale(768, 1024)).toBeCloseTo(DESIGN_ASPECT / 0.75, 5);
    expect(aspectFitScale(1024, 768)).toBeCloseTo(DESIGN_ASPECT / (4 / 3), 5);
  });

  it('极窄视口夹到上限，且非法尺寸不产生 NaN', () => {
    expect(aspectFitScale(320, 900)).toBe(MAX_ASPECT_FIT);
    expect(aspectFitScale(0, 800)).toBe(1);
    expect(aspectFitScale(800, 0)).toBe(1);
    expect(aspectFitScale(Number.NaN, 800)).toBe(1);
  });

  it('拉远只改变距离，不改变机位方向与目标点', () => {
    const pos: [number, number, number] = [0.2, 5.0, 9.8];
    const target: [number, number, number] = [2.4, 2.3, 0.3];
    expect(fitCameraPosition(pos, target, 1440, 900)).toEqual(pos);

    const k = aspectFitScale(390, 844);
    const fitted = fitCameraPosition(pos, target, 390, 844);
    for (let i = 0; i < 3; i += 1) {
      expect(fitted[i]).toBeCloseTo(target[i] + (pos[i] - target[i]) * k, 6);
    }
    // 方向向量保持同向（只有长度变了）
    const base = pos.map((v, i) => v - target[i]);
    const out = fitted.map((v, i) => v - target[i]);
    for (let i = 0; i < 3; i += 1) expect(Math.sign(out[i])).toBe(Math.sign(base[i]));
  });

  it('OrbitControls 距离上限同步放宽，否则拉远会被拽回', () => {
    expect(fitMaxDistance(25, 1440, 900)).toBe(25);
    expect(fitMaxDistance(25, 390, 844)).toBeGreaterThan(25 * 3);
  });

  it('观众端固定 dpr=1，主控高 DPR 设备最多 1.5', () => {
    expect(renderPixelRatio(true)).toBe(1);
    expect(renderPixelRatio(false)).toBeLessThanOrEqual(1.5);
  });
});

describe('各入口接线与防回退', () => {
  it('紧凑布局断点包含平板宽度与手机横屏高度', () => {
    expect(useMobileSrc).toContain('breakpoint = 1024');
    expect(useMobileSrc).toContain('window.innerHeight < 620');
    expect(useMobileSrc).not.toContain('breakpoint = 640');
  });

  it('配药相机：初始机位与阻尼目标都走同一个补偿函数', () => {
    expect(wrapperSrc).toContain('fitCameraPosition(');
    expect(wrapperSrc).toContain('fitMaxDistance(');
    expect(cameraRigSrc).toContain('aspectFitScale(');
    expect(wrapperSrc).toContain('renderPixelRatio(');
  });

  it('默认场景也挂宽高比补偿，工具栏支持紧凑排布', () => {
    expect(physicsSceneSrc).toContain('<AspectFitCamera');
    expect(switcherSrc).toContain('compact');
    expect(wrapperSrc).toContain('compact={compact}');
  });

  it('设备选择页可滚动，不再 overflow-hidden 裁掉标题与卡片', () => {
    expect(launcherSrc).toContain('overflow-y-auto');
    expect(launcherSrc).toContain('min-h-full');
    expect(launcherSrc).toContain('sm:grid-cols-2');
    expect(launcherSrc).not.toContain('overflow-hidden');
  });

  it('观众端角标 / 状态条适配安全区、响应式字号与单行截断', () => {
    expect(viewerSrc).toContain('env(safe-area-inset-top)');
    expect(viewerSrc).toContain('env(safe-area-inset-bottom)');
    expect(viewerSrc).toContain('whitespace-nowrap');
    expect(viewerSrc).toContain('sm:hidden');
  });

  it('紧凑布局把观众地址收进抽屉，底部地址条与版权不再重叠', () => {
    expect(shellSrc).toContain('viewerUrl && !isMobile');
    expect(shellSrc).toContain('!isMobile && (');
    expect(shellSrc).toContain('env(safe-area-inset-bottom)');
  });

  it('观众端竖屏隐藏 3D 标签，避免相机拉远后标签挤成一团', () => {
    expect(labelSrc).toContain('isViewerRuntime()');
    expect(labelSrc).toContain('dt-viewer-label');
    expect(platformCss).toContain('max-aspect-ratio: 1/1');
    expect(dispensingCss).toContain('dt-viewer-label');
    // 智能电视 / 大屏横屏仍保留标签，但字号要放大，否则 1920 宽下 10px 几乎看不清
    expect(platformCss).toContain('min-width: 1600px');
    expect(dispensingCss).toContain('min-width: 1600px');
  });
});
