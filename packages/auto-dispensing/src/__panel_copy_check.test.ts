/**
 * 面板文案精简防回退自检（用户 2026-11-09 口径）。
 *
 * 四条硬约束：
 *  1. 手动 / 自动改成一个自锁按钮，并入主令卡片，3 列 × 2 行共 6 键；
 *  2. 输出点不再单独设「直接置位」栏，只在 IO 信号表做只读显示；
 *  3. 选择开关说明、输出点说明、32 位 DINT 说明三段文字全部移除；
 *  4. 四个模式面板的**可见文案**里不出现中文括号及其内容；
 *  5. 用户 2026-11-10 追加「不要再UI里填说明」：电磁阀卡片的原理长说明
 *     与单 / 双电控动态说明一并移除，只留切换按钮、地址浮框与禁止状态告警。
 *
 * 注意：源码注释里仍有大量括号，属于设计说明而非 UI 版面，
 * 因此先剥离注释再断言；地址浮框与「使用说明」文档是完整映射表，不在本自检范围。
 */
import { describe, it, expect } from 'vitest';
import { SIM_COMMAND_KEYS } from './scenes/auto-dispensing/simulationIo';

const read = (rel: string): string =>
  process.getBuiltinModule('fs')!.readFileSync(new URL(rel, import.meta.url), 'utf8');

const simSource = read('./scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
const controlSource = read('./scenes/auto-dispensing/panels/DispenseControlPanel.tsx');
const demoSource = read('./scenes/auto-dispensing/panels/DispenseDemoPanel.tsx');
const statusSource = read('./scenes/auto-dispensing/panels/DispenseStatusPanel.tsx');

/** 去掉 JSDoc / 块注释 / JSX 注释 / 行注释，只留下代码与可见文案 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PANELS = [
  ['仿真面板', simSource],
  ['手动面板', controlSource],
  ['演示面板', demoSource],
  ['状态面板', statusSource],
] as const;

const REMOVED_COPY = [
  '两档互锁，与 3D 控制柜旋钮联动',
  '未连接 PLC 时只切换本地旋钮',
  '点一次置位、再点一次复位',
  '悬停按钮查看三菱 Y',
  '32 位有符号整数，低字在前，一次原子写',
  '寄存器地址悬停上方数值查看',
  '编码器独立装在 +X 丝杆末端',
  '电机为普通正反转布尔控制，非伺服',
  '控制气缸实质是控制电磁阀',
  '悬停下方线圈名查看三协议地址',
  '单电控：缩回线圈不参与驱动',
  '双电控：动作线圈脉冲伸出',
];

describe('四个模式面板的可见文案不再带括号说明', () => {
  PANELS.forEach(([name, src]) => {
    it(`${name} 剥离注释后不含中文全角括号`, () => {
      const visible = stripComments(src);
      expect(visible).not.toContain('（');
      expect(visible).not.toContain('）');
    });
  });

  it('三段被删的说明文字都不再出现在仿真面板', () => {
    REMOVED_COPY.forEach((text) => expect(simSource).not.toContain(text));
  });

  it('电磁阀卡片只删说明，切换控件 / 默认 badge / 地址浮框 / 禁止状态告警都还在', () => {
    expect(simSource).toContain('SOLENOID_TYPES.map');
    expect(simSource).toContain('setSolenoidType(t)');
    expect(simSource).toContain('默认 ');
    expect(simSource).toContain('SOLENOID_OUTPUT_POINTS.map');
    expect(simSource).toContain('<AddressHint');
    expect(simSource).toContain('禁止状态：');
  });

  it('卡片标题只剩信号名，不带括号内的解释', () => {
    ['主令控制', '电磁阀类型', '位置数据寄存器', 'IO 信号'].forEach((title) => {
      expect(simSource).toContain(`>${title}</div>`);
    });
    expect(simSource).not.toContain('主令控制（');
    expect(simSource).not.toContain('电磁阀类型（');
    expect(simSource).not.toContain('位置数据寄存器（');
    expect(simSource).not.toContain('IO 信号（');
  });

  it('演示面板标题与按钮文案去掉括号内容', () => {
    expect(demoSource).toContain('>配方设定</div>');
    expect(demoSource).toContain('⊕ 补满四仓');
    expect(demoSource).toContain('↺ 复位');
    expect(demoSource).not.toContain('启动后锁定');
    expect(demoSource).not.toContain('回起点');
  });
});

describe('主令卡片 3 列 × 2 行，第 6 键是手动 / 自动自锁按钮', () => {
  const card = simSource.slice(
    simSource.indexOf('>主令控制</div>'),
    simSource.indexOf('<div className="divider !my-1.5" />'),
  );

  it('5 个自复位主令 + 1 个自锁按钮恰好铺满两排', () => {
    expect(SIM_COMMAND_KEYS).toHaveLength(5);
    expect(card).toContain('grid grid-cols-3');
    expect(card).toContain('SIM_COMMAND_KEYS.map');
    expect(card).toContain('data-sim-selector=""');
    expect(card).toContain('aria-pressed={autoOn}');
    expect(card).toContain('rows={simSelectorRows()}');
  });

  it('自锁按钮点击切换档位，未连接 PLC 时只改本地旋钮', () => {
    expect(card).toContain('onClick={toggleSelector}');
    expect(simSource).toContain('const autoOn = selectorAuto');
    expect(simSource).toContain('const next = !useDispensingStore.getState().selectorAuto;');
    expect(simSource).toContain('if (!connected) return;');
    expect(simSource).toContain('writeSimSelector(next)');
  });

  it('不再渲染独立的两个档位按钮', () => {
    expect(simSource).not.toContain('SIM_SELECTOR_POINTS.map');
    expect(simSource).not.toContain('● 接通');
    expect(simSource).not.toContain('○ 断开');
  });
});

describe('输出点只在 IO 信号表做只读显示', () => {
  it('仿真面板不再有输出点置位卡片与按钮', () => {
    expect(simSource).not.toContain('输出点直接置位');
    expect(simSource).not.toContain('toggleOutput');
    expect(simSource).not.toContain('输出点按钮');
    expect(simSource).not.toContain('SIM_OUTPUT_ACTION_LABELS');
  });

  it('15 个输出点位仍然由点位表 map 成只读 LED', () => {
    expect(simSource).toContain('输出点 15');
    expect(simSource).toContain('SIM_OUTPUT_POINTS.map');
    expect(simSource).toContain('<IOLed key={p.key}');
    expect(simSource).toContain('active={!!ioSignals[p.key]}');
  });
});
