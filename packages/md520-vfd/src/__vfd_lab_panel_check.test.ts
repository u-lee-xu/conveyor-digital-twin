/**
 * 场景内实验指导抽屉防回退自检：默认折叠、同源数据、观众零上行、打印版可访问。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABS, LAB_GROUPS, LAB_GROUP_ORDER, LAB_DEFAULTS,
  KEY_GUIDE, MODE_GUIDE, MENU_GUIDE,
} from './constants/labGuide.generated';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const wrapper = read('packages/md520-vfd/src/platform/VfdSceneWrapper.tsx');
const panel = read('packages/md520-vfd/src/platform/VfdLabGuide.tsx');
const generated = read('packages/md520-vfd/src/constants/labGuide.generated.ts');
const generator = read('packages/md520-vfd/docs/generate-lab-guide.cjs');
const docsHtml = read('packages/md520-vfd/docs/MD520实验指导书.html');
const webHtml = read('packages/platform/public/docs/MD520实验指导书.html');

describe('场景内实验指导抽屉', () => {
  it('挂在变频器自己的场景容器里，不改平台壳、不占真机面板', () => {
    expect(wrapper).toContain("import { VfdLabGuide } from './VfdLabGuide'");
    expect(wrapper).toContain('<VfdLabGuide />');
    // 抽屉在 Canvas 之外，是普通 DOM 浮层
    const canvasAt = wrapper.indexOf('<Canvas');
    const guideAt = wrapper.indexOf('<VfdLabGuide />');
    expect(canvasAt).toBeGreaterThan(-1);
    expect(guideAt).toBeGreaterThan(canvasAt);
    expect(wrapper).toContain('position: \'absolute\', inset: 0');
  });

  it('默认折叠、可展开收起，带完整的 CDP 锚点', () => {
    expect(panel).toContain('useState(false)');
    for (const token of [
      'data-dt-vfd-lab', 'data-dt-vfd-lab-open', 'data-dt-vfd-lab-current',
      'data-dt-vfd-lab-progress', 'data-dt-vfd-lab-panel', 'data-dt-vfd-lab-toggle',
      'data-dt-vfd-lab-select', 'data-dt-vfd-lab-search', 'data-dt-vfd-lab-step',
      'data-dt-vfd-lab-expect', 'data-dt-vfd-lab-next',
    ]) expect(panel).toContain(token);
    expect(panel).toContain('aria-label="实验指导"');
    expect(panel).toContain('aria-label="收起实验指导"');
  });

  it('实验数据与打印版手册同源，30 个实验 / 6 类', () => {
    expect(LABS).toHaveLength(30);
    expect(LAB_GROUP_ORDER).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(Object.keys(LAB_GROUPS)).toHaveLength(6);
    expect(LAB_DEFAULTS['F0-08']).toBe(50);
    expect(LAB_DEFAULTS['F4-01']).toBe(2);
    expect(generated).toContain('自动生成，请勿手改');
    expect(generator).toContain('labGuide.generated.ts');
    expect(generator).toContain("platform/public/docs");
    expect(existsSync(join(root, 'packages/platform/public/docs/MD520实验指导书.html'))).toBe(true);
    expect(webHtml).toBe(docsHtml);
  });

  it('新手按键对照与模式说明三处同源，实验1白话化', () => {
    expect(KEY_GUIDE).toHaveLength(10);
    expect(KEY_GUIDE.map((k) => k.code)).toEqual([
      'PRG', 'MENU', 'OK', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'RUN', 'STOP', 'MF.K',
    ]);
    expect(KEY_GUIDE.find((k) => k.code === 'PRG')).toMatchObject({ face: '↩', name: '编程/返回键' });
    expect(MODE_GUIDE.map((m) => m.mode)).toEqual(['手动', '仿真']);
    expect(MENU_GUIDE).toHaveLength(3);
    expect(MENU_GUIDE.map((m) => m.level)).toEqual(['L1 参数组', 'L2 参数', 'L3 设定值']);
    // 抽屉与打印版都带入门对照，数据来自同一份生成文件
    expect(panel).toContain('KEY_GUIDE');
    expect(panel).toContain('data-dt-vfd-lab-guide');
    expect(panel).toContain('PRG 是哪个键？按键对照');
    for (const f of [docsHtml, webHtml]) {
      expect(f).toContain('id="start"');
      expect(f).toContain('开始之前：先认清面板和模式');
      expect(f).toContain('PRG ↩ · 编程/返回键');
      expect(f).toContain('🎮 手动');
      expect(f).toContain('🔌 仿真');
    }
    expect(LABS[0].steps[0]).toContain('MD520 变频器');
    expect(LABS[0].steps[0]).toContain('🎮 手动');
    expect(LABS[0].steps[0]).toContain('已默认选中');
    expect(LABS[0].steps[1]).toContain('PRG');
    expect(LABS[0].trap).toContain('MENU');
  });

  it('五段结构与步骤勾选、进度持久化齐全', () => {
    expect(docsHtml).toContain('48.75');
    expect(panel).toContain('<b>目的</b>');
    expect(panel).toContain('<b>步骤</b>');
    expect(panel).toContain('<b>预期现象</b>');
    expect(panel).toContain('<b>观察窗口</b>');
    expect(panel).toContain('<b>易错点</b>');
    expect(panel).toContain('localStorage');
    expect(panel).toContain('打印版');
    expect(panel).toContain('/docs/MD520实验指导书.html');
  });

  it('纯本地 UI：只读 store、不写不广播，观众零上行', () => {
    // 混合勾选只读订阅真值做自动判定，但不调用任何 setter / 链路服务
    expect(panel).toContain('useVfdStore((s) => s.keypad.level)');
    expect(panel).toContain('isViewerRuntime()');
    expect(panel).not.toContain('applyBroadcast');
    expect(panel).not.toContain('modbusService');
    expect(panel).not.toContain('exportSnapshot');
    expect(panel).not.toContain('setParam(');
    expect(panel).not.toContain('dispatchKey(');
    // 求值器是纯函数，不 import 任何 store 或链路
    const autoCheck = read('packages/md520-vfd/src/platform/labAutoCheck.ts');
    expect(autoCheck).not.toContain("from '../stores/useVfdStore'");
    expect(autoCheck).not.toContain('applyBroadcast');
    expect(autoCheck).not.toContain('modbusService');
  });

  it('混合勾选：自动开关、自动步骤标记与规则同源', () => {
    expect(panel).toContain('data-dt-vfd-lab-auto');
    expect(panel).toContain('data-dt-vfd-lab-auto-step');
    expect(panel).toContain('autoHits.includes(i)');
    expect(panel).toContain('⚡自动');
    expect(generated).toContain('export type AutoRule');
    expect(LABS[0].auto).toHaveLength(5);
    expect(LABS[0].steps).toHaveLength(5);
    expect(LABS.find((l) => l.n === 2)?.auto).toBeUndefined();
  });
});
