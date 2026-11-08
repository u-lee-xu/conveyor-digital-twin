/**
 * 控制柜元件外形自检：两位选择开关 + Ø40 蘑菇头急停。
 *
 * 这两件以前「不像实物」不是配色问题，而是几何口径问题：
 *   · 拨柄长度只比 φ22 环半径多 2.8mm，且高 metalness 银材质在无 envMap 下发黑；
 *   · 急停头是压扁的完整球，没有细颈 / 外扩伞底 / 圆角伞缘 / 宽平顶的蘑菇剖面。
 * 这里把「外形是否成立」量化成尺寸链断言，防止以后改常量又退回旧样子。
 */
import { describe, it, expect } from 'vitest';
import {
  CABINET_PANEL, CABINET_SELECTOR, CABINET_SELECTOR_SHAPE, CABINET_ESTOP_SHAPE,
  SURFACE_GAP,
} from './scenes/auto-dispensing/constants';

const P = CABINET_PANEL;
const SW = CABINET_SELECTOR_SHAPE;
const ES = CABINET_ESTOP_SHAPE;

const cabinetSource = import.meta.glob<string>(
  './scenes/auto-dispensing/components/ControlCabinet.tsx',
  { query: '?raw', import: 'default', eager: true },
)['./scenes/auto-dispensing/components/ControlCabinet.tsx'];

describe('两位选择开关：短粗梯形拨柄与档位标记', () => {
  it('拨柄明显伸出安装环，不再是被黑圈吞掉的一小块', () => {
    const tip = SW.HANDLE_ROOT_Y + SW.HANDLE_L;
    expect(tip).toBeGreaterThan(P.SELECTOR_R * 1.2);
    expect(tip).toBeLessThan(P.SELECTOR_R * 2.0);      // 也不至于变成一根长指针
    expect(SW.HANDLE_L).toBeGreaterThan(P.SELECTOR_HANDLE_L);
  });

  it('拨柄是修长梯形：宽长比合理，前端略收而不是尖针', () => {
    const ratio = SW.HANDLE_W / SW.HANDLE_L;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.70);
    // 按反馈从 11.6mm 收细到 9.6mm：仍比旧 8mm 宽，也不能再退回「细长指针」
    expect(SW.HANDLE_W).toBeGreaterThan(P.SELECTOR_HANDLE_W);
    expect(SW.HANDLE_W).toBeLessThan(P.SELECTOR_HANDLE_W * 1.35);
    expect(SW.HANDLE_TIP_W).toBeLessThan(SW.HANDLE_W);
    expect(SW.HANDLE_TIP_W).toBeGreaterThan(SW.HANDLE_W * 0.6);
    expect(SW.HANDLE_SHOULDER).toBeGreaterThan(0.6);
    expect(SW.HANDLE_SHOULDER).toBeLessThan(0.9);
  });

  it('指示线是细长条，不是方孔', () => {
    expect(SW.MARK_L / SW.MARK_W).toBeGreaterThan(4);
    expect(SW.MARK_W).toBeLessThan(SW.HANDLE_W);
    expect(SW.MARK_L).toBeLessThan(SW.HANDLE_L * SW.HANDLE_SHOULDER);
  });

  it('两个档位圆点落在拨柄尖端之外，且方向取同一份角度真值', () => {
    const tip = SW.HANDLE_ROOT_Y + SW.HANDLE_L;
    expect(SW.NOTCH_R - SW.NOTCH_DOT_R).toBeGreaterThan(tip);
    expect(SW.NOTCH_DOT_R).toBeLessThan(P.SELECTOR_HANDLE_W * 0.3);
    // 档位标记与拨柄共用 CABINET_SELECTOR.angles，不允许各写一套角度
    expect(cabinetSource).toContain("(['manual', 'auto'] as const).map((key)");
    expect(cabinetSource).toContain('CABINET_SELECTOR.angles[key]');
    expect(cabinetSource).toContain('Math.sin(a) * SW.NOTCH_R');
  });

  it('两位偏角左右对称、接近实物 ±60°，只有物理两档无软件中位', () => {
    const a = CABINET_SELECTOR.angles;
    // 选择开关是两路互锁 PLC 输入（X5/X6），不是 AppMode 显示器：
    // 表里只能有 manual / auto 两档，禁止再出现 sim / scoring 中位。
    expect(Object.keys(a).sort()).toEqual(['auto', 'manual']);
    expect(a.manual).toBeLessThan(-0.9);
    expect(a.auto).toBeGreaterThan(0.9);
    expect(a.manual).toBeCloseTo(-a.auto, 8);
  });

  it('旋钮座嵌进安装环、拨柄嵌进旋钮座，贴面净空统一是 SURFACE_GAP', () => {
    const bezelTop = P.FRONT_Z + P.BEZEL_T;
    expect(SW.KNOB_Z - SW.KNOB_T / 2).toBeLessThan(bezelTop);
    expect(SW.KNOB_TOP).toBeGreaterThan(bezelTop);
    expect(SW.HANDLE_Z).toBeLessThan(SW.KNOB_TOP);
    expect(SW.HANDLE_TOP).toBeGreaterThan(SW.KNOB_TOP);
    expect(SW.HANDLE_TOP - (SW.HANDLE_Z + SW.HANDLE_T)).toBeCloseTo(0, 9);
    expect(SW.KNOB_TOP - (SW.HANDLE_Z + SURFACE_GAP / 2)).toBeLessThan(1e-9);
    expect(SW.SCALE_R0).toBeGreaterThan(SW.HANDLE_W / 2);   // 刻度环不被拨柄盖住
  });

  it('新增档位标记不越出门板，也不压到相邻元件铭牌', () => {
    const reach = SW.NOTCH_R + SW.NOTCH_DOT_R;
    expect(Math.abs(CABINET_SELECTOR.x) + reach).toBeLessThan(P.W / 2);
    expect(CABINET_SELECTOR.y + reach).toBeLessThan(P.CENTER_Y + P.H / 2);
    expect(CABINET_SELECTOR.y - reach).toBeGreaterThan(P.CENTER_Y - P.H / 2);
  });
});

describe('Ø40 蘑菇头急停：Lathe 剖面与四级直径', () => {
  it('黄盘 > 红伞 > 银环 > 收颈，形成「头大杆细」的实物层级', () => {
    expect(P.ESTOP_BASE_R).toBeGreaterThan(ES.HEAD_R);
    expect(ES.HEAD_R).toBeGreaterThan(ES.RING_R);
    expect(ES.RING_R).toBeGreaterThan(ES.NECK_R);
    expect(ES.NECK_R / ES.HEAD_R).toBeLessThan(0.6);
    expect(ES.NECK_H).toBeGreaterThan(SURFACE_GAP);
  });

  it('Lathe 剖面 Z 单调不回落、首尾封口、最大半径就是红伞半径', () => {
    const zs = ES.PROFILE.map(([, z]) => z);
    for (let i = 1; i < zs.length; i += 1) {
      expect(zs[i], `剖面第 ${i} 点 Z 回落`).toBeGreaterThanOrEqual(zs[i - 1]);
    }
    expect(ES.PROFILE[0][0]).toBe(0);
    expect(ES.PROFILE[ES.PROFILE.length - 1][0]).toBe(0);
    const maxR = Math.max(...ES.PROFILE.map(([r]) => r));
    expect(maxR).toBeCloseTo(ES.HEAD_R, 9);
    expect(ES.PROFILE[1][0]).toBeCloseTo(ES.NECK_R, 9);  // 伞底内圈接住收颈柱
  });

  it('伞底嵌进收颈柱，柱顶不与伞底精确共面', () => {
    const neckTopRel = ES.NECK_Z + ES.NECK_H / 2 - P.FRONT_Z;
    expect(ES.PROFILE[0][1]).toBeLessThan(neckTopRel);
    expect(neckTopRel - ES.PROFILE[0][1]).toBeCloseTo(SURFACE_GAP, 9);
  });

  it('末两点同 Z 形成宽平顶，符号完全落在平顶内且只高一个 SURFACE_GAP', () => {
    const n = ES.PROFILE.length;
    expect(ES.PROFILE[n - 1][1]).toBeCloseTo(ES.PROFILE[n - 2][1], 9);
    const flatR = ES.PROFILE[n - 2][0];
    expect(flatR).toBeGreaterThan(ES.SYMBOL_R);
    expect(ES.CAP_Z).toBeCloseTo(P.FRONT_Z + ES.PROFILE[n - 1][1], 9);
    expect(ES.CAP_Z + SURFACE_GAP - (P.FRONT_Z + ES.PROFILE[n - 1][1]))
      .toBeCloseTo(SURFACE_GAP, 9);
    expect(cabinetSource).toContain('ES.CAP_Z + SURFACE_GAP');
  });

  it('按压只让头部下沉，且不把蘑菇头压进面板', () => {
    expect(ES.PRESS_DEPTH).toBeGreaterThan(0);
    expect(ES.PRESS_DEPTH).toBeLessThan(ES.NECK_H);
    expect(cabinetSource).toContain('-(pressed ? ES.PRESS_DEPTH : 0)');
  });

  it('黄盘与固定环留在面板上，交互挂在头部 group 而不是单个网格', () => {
    expect(cabinetSource).toContain('depth={ES.BASE_T}');
    expect(cabinetSource).toContain('depth={ES.RING_T}');
    expect(cabinetSource).toContain('onPointerDown={(e) => { e.stopPropagation(); onDown(); }}');
    expect(cabinetSource).toContain('depth={ES.NECK_H}');
  });
});

describe('外形改造的源码级口径', () => {
  it('急停头用 LatheGeometry 车削、拨柄用 ExtrudeGeometry 挤出', () => {
    expect(cabinetSource).toContain('<latheGeometry args={[profile, 32]} />');
    expect(cabinetSource).toContain('<extrudeGeometry args={[handleShape');
    expect(cabinetSource).toContain('CABINET_SELECTOR_SHAPE');
    expect(cabinetSource).toContain('CABINET_ESTOP_SHAPE');
    // 旧实现：圆柱 + 压扁球拼出一颗红珠，不能回来
    expect(cabinetSource).not.toContain('sphereGeometry args={[P.ESTOP_HEAD_R');
    expect(cabinetSource).not.toContain('cylinderGeometry args={[P.ESTOP_HEAD_R');
  });

  it('旋转释放符号改成两段对称细弧，不再是单条粗弧的「字母 C」', () => {
    expect(cabinetSource).toContain('const arcs: [number, number][]');
    expect(cabinetSource).toContain('ctx.lineWidth = 7');
    expect(cabinetSource).not.toContain('ctx.lineWidth = 11');
    expect(cabinetSource).toContain('circleGeometry args={[ES.SYMBOL_R, 32]}');
  });

  it('亮银拨柄/固定环用低金属度材质，避免无 envMap 时渲染成深灰', () => {
    expect(cabinetSource).toContain('color: P.COLORS.handle, metalness: 0.18');
    expect(cabinetSource).toContain('color: P.COLORS.neck');
    expect(P.COLORS.handle).not.toBe(P.COLORS.bezel);
  });

  it('两件外形仍统一走 SURFACE_GAP，没有引入 0.0005 / 0.0006 级贴面', () => {
    expect(cabinetSource).toContain('VISUAL, SURFACE_GAP');
    expect(cabinetSource).toContain('P.FRONT_Z + SURFACE_GAP');
    expect(cabinetSource).not.toMatch(/0\.000[56]\b/);
  });
});
