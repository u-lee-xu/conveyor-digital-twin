/**
 * 几何层距自检：把「相邻可见面不得精确共面 / 实体不得穿插」变成可计算的断言。
 * 旧版接触器上方闪烁的根因是：灭弧罩顶面与壳体顶面共面，且 KM/FR 顶部插进横向线槽。
 */
import { describe, expect, it } from 'vitest';
import {
  GAP, MOTOR_GEOM as G, MOTOR_ASSEMBLY, MOTOR_CABINET_LAYOUT, DUCT_INNER_SPAN,
  KM_SCREW_RECESS, KM_TERMINAL_ROWS, KM_TERMINAL_ROW_UPPER,
} from './constants/motorConstants';

const railBase = (y: number) => y + G.DIN.height / 2;
const ductTop = (row: number) => row + G.DUCT.height / 2;
const ductBottom = (row: number) => row - G.DUCT.height / 2;

/** 装配表里每种元件在 x 方向的实际占宽（继电器插座比透明罩略宽） */
const cabinetWidth = (kind: string): number => {
  switch (kind) {
    case 'breaker': return G.QF.w;
    case 'fuse': return G.FU.spacing * (G.FU.count - 1) + G.FU.baseW;
    case 'contactor': return G.KM.w;
    case 'thermal': return G.FR.w;
    case 'psu': return G.PSU.w;
    case 'plc': return G.PLC.w;
    case 'relay': return G.RELAY.w * 1.16;
    default: return 0;
  }
};
const railSpans = (level: string) => MOTOR_CABINET_LAYOUT
  .filter((p) => p.level === level)
  .map((p) => ({ label: p.label, left: p.x - cabinetWidth(p.kind) / 2, right: p.x + cabinetWidth(p.kind) / 2 }))
  .sort((a, b) => a.left - b.left);
const assertNoOverlap = (spans: ReturnType<typeof railSpans>) => {
  const inner = G.DUCT.verticalX - G.DUCT.height / 2;
  for (const p of spans) {
    expect(p.left).toBeGreaterThanOrEqual(-inner);
    expect(p.right).toBeLessThanOrEqual(inner);
  }
  for (let i = 1; i < spans.length; i += 1) {
    expect(spans[i].left - spans[i - 1].right).toBeGreaterThanOrEqual(GAP);
  }
};

describe('柜内三层布局的层距（防 z-fighting 回归）', () => {
  it('上层 QF / FU / PSU 顶部（含顶面端子）与柜顶线槽下沿留足 GAP', () => {
    const highest = railBase(G.DIN.upperY) + Math.max(G.QF.h, G.FU.baseH, G.PSU.h) + GAP * 3;
    expect(ductBottom(G.DUCT.rows[0]) - highest).toBeGreaterThanOrEqual(GAP);
  });

  it('中层 KM 顶部与层间线槽下沿留足 GAP', () => {
    const kmTop = railBase(G.DIN.middleY) + G.KM.h + GAP;
    expect(ductBottom(G.DUCT.rows[1]) - kmTop).toBeGreaterThanOrEqual(GAP);
  });

  it('JR36-63 与 KM1/KM2 同排：顶部与层间线槽下沿留足 GAP', () => {
    const frTop = railBase(G.DIN.middleY) + G.FR.h + GAP;
    expect(ductBottom(G.DUCT.rows[1]) - frTop).toBeGreaterThanOrEqual(GAP);
  });

  it('KM 顶部深灰 DIN 安装背板不插进层间横向线槽', () => {
    const backPlateTop = railBase(G.DIN.middleY) + G.KM.h
      + G.KM.backPlateGap + G.KM.backPlateH + GAP;
    expect(ductBottom(G.DUCT.rows[1]) - backPlateTop).toBeGreaterThanOrEqual(GAP);
  });

  it('KM 去掉前盖后，上下端子块之间留出完整中部空白', () => {
    const upperBlockBottom = G.KM.h * (0.86 - 0.24 / 2);
    const lowerBlockTop = G.KM.h * (0.14 + 0.24 / 2);
    expect(upperBlockBottom - lowerBlockTop).toBeGreaterThan(G.KM.h * 0.4);
  });

  it('KM 衔铁灰色方块吸合下沉、不滑出滑槽，灯在滑槽之上', () => {
    const h = G.KM.h;
    const slotY = h * 0.46, slotH = h * 0.24;
    const blockH = h * 0.09;
    const idleY = h * 0.46, onY = h * 0.4;
    expect(idleY - onY).toBeGreaterThan(GAP * 4);
    for (const y of [idleY, onY]) {
      expect(y - blockH / 2).toBeGreaterThanOrEqual(slotY - slotH / 2);
      expect(y + blockH / 2).toBeLessThanOrEqual(slotY + slotH / 2);
    }
    expect(h * 0.65 - 0.007 - (slotY + slotH / 2)).toBeGreaterThanOrEqual(GAP);
  });

  it('QF 合闸行程相对原来翻倍，且不碰上端子与上方印字窄条', () => {
    const h = G.QF.h;
    const off = h * 0.3;
    const on = h * 0.58;
    const oldTravel = h * (0.44 - 0.3);
    expect(on - off).toBeCloseTo(oldTravel * 2, 9);
    expect(h - 0.017 - on).toBeGreaterThan(0.013 + GAP);
    expect(h * 0.76 - h * 0.09 / 2 - on).toBeGreaterThan(0.014 + GAP);
  });

  it('第四十六轮：FR 矮身 + 俯视压扁——前脸高 0.095、进深 0.05', () => {
    expect(G.FR.h).toBe(0.095);
    expect(G.FR.d).toBe(0.05);                     // 第四十六轮从 0.079 压到 0.05
    expect(G.FR.d).toBeGreaterThan(G.FR.terminalPortR * 0.82 * 2 + GAP); // 仍略宽于两颗螺钉
    expect(G.FR.w).toBe(0.185);                    // 行宽约束保持不变
    expect(G.FR.h / G.FR.w).toBeLessThan(0.6);     // 明显宽扁：宽高比 > 1.6
  });

  it('第四十八轮螺钉放大并拉开：步距/头径 ≈ 1.65，边缘留空 > 10*GAP', () => {
    const pitch = G.FR.poleRegionW / 3;
    const headD = G.FR.terminalPortR * 2;          // 螺钉半径不再 ×0.82
    expect(pitch - headD).toBeGreaterThan(GAP * 2);
    expect(pitch / headD).toBeGreaterThan(1.5);
    expect(pitch / headD).toBeLessThan(2.0);       // 不稀到像三个独立元件
  });

  it('第三十轮：FR 三端子块 / 操作面板 / 顶铜带 x 向互不重叠且不超壳体', () => {
    const padHalf = G.FR.padW / 2;
    const leftMost = G.FR.poleRegionX - G.FR.poleRegionW / 3 - padHalf;  // 最左块左缘
    const rightPad = G.FR.poleRegionX + G.FR.poleRegionW / 3 + padHalf;  // 最右块右缘
    const panelLeft = G.FR.dialX - G.FR.w * 0.24 / 2;
    const panelRight = G.FR.dialX + G.FR.w * 0.24 / 2;
    expect(leftMost).toBeGreaterThanOrEqual(-G.FR.w / 2);
    expect(panelLeft - rightPad).toBeGreaterThanOrEqual(GAP);
    expect(panelRight).toBeLessThanOrEqual(G.FR.w / 2);
  });

  it('第三十三轮：FR 前脸布局——竖直两排螺钉相切、红钮 / 观察窗 / 旋钮互不穿插', () => {
    const F = G.FR;
    const screwR = F.terminalPortR;
    // 第四十八轮：螺钉放大、行距 = 半径 + GAP/2，上下仍坐在端子座上
    const padBottom = GAP * 2;
    const padTop = F.h - GAP;   // 第五十一轮：铜带删除，顶到壳顶
    const padCY = (padBottom + padTop) / 2;
    const rowStep = screwR + F.screwRowGap / 2;
    expect(padCY - rowStep - screwR).toBeGreaterThan(padBottom); // 下缘不越座
    expect(padCY + rowStep + screwR).toBeLessThan(padTop);       // 上缘同
    // 第五十一轮：铜带已删，旋钮顶部不越壳顶
    expect(F.h / 2 + F.dialFaceR).toBeLessThan(F.h);
    // 红钮 / 观察窗共用 sideX，靠 y 分开；x 向与端子区 / 旋钮各留足 GAP
    const padRight = F.poleRegionX + F.poleRegionW / 3 + F.frameW / 2;
    const sideX = (padRight + F.dialX - F.dialFaceR) / 2;
    const dialLeft = F.dialX - F.dialFaceR;
    expect(sideX - F.stopW / 2 - padRight).toBeGreaterThanOrEqual(GAP - 1e-9);
    expect(dialLeft - (sideX + F.stopW / 2)).toBeGreaterThanOrEqual(GAP);
    // 观察窗下缘不低于本体底缘、上缘低于红钮下缘
    const windowTop = F.h * 0.36 + 0.018 / 2;
    const stopBottom = F.h - F.capBandH - GAP - F.stopH;
    expect(F.h * 0.36 - 0.018 / 2).toBeGreaterThan(0);
    expect(windowTop).toBeLessThan(stopBottom);
  });

  it('横向线槽两端止于竖向线槽内缘之外，交汇处不共面', () => {
    const horizontalLen = 2 * (G.DUCT.verticalX - G.DUCT.height / 2 - GAP);
    const verticalInner = G.DUCT.verticalX - G.DUCT.height / 2;
    expect(horizontalLen / 2).toBeLessThanOrEqual(verticalInner - 1e-9);
    expect(horizontalLen).toBeGreaterThan(G.DIN.length * 0.8); // 仍覆盖导轨大部分宽度
  });

  it('柜顶线槽不顶到柜体顶板内表面', () => {
    const ceilingInner = G.CABINET.height - G.CABINET.wall;
    expect(ductTop(G.DUCT.rows[0])).toBeLessThan(ceilingInner);
  });

  it('四条横向线槽与三条 DIN 导轨两两不交叠', () => {
    const rails = [G.DIN.upperY, G.DIN.middleY, G.DIN.lowerY];
    for (const row of G.DUCT.rows) {
      for (const rail of rails) {
        const separated = ductTop(row) <= rail - G.DIN.height / 2 + 1e-9
          || ductBottom(row) >= rail + G.DIN.height / 2 - 1e-9;
        expect(separated).toBe(true);
      }
    }
  });

  it('下层端子排顶部与中下层线槽下沿留足 GAP', () => {
    const terminalTop = railBase(G.DIN.lowerY) + 0.02 + G.TERMINAL.h / 2;
    expect(ductBottom(G.DUCT.rows[2]) - terminalTop).toBeGreaterThanOrEqual(GAP);
  });

  it('第三十五轮：第一排 QF/FU/PSU/KA1/KA2、第二排 KM1/KM2/FR/PLC 各自两两不重叠', () => {
    const upper = railSpans('upper');
    const middle = railSpans('middle');
    expect(upper.map((p) => p.label)).toEqual(['QF', 'FU', 'PSU', 'KA1', 'KA2']);
    expect(middle.map((p) => p.label)).toEqual(['KM1', 'KM2', 'FR', 'PLC']);
    assertNoOverlap(upper);
    assertNoOverlap(middle);
    // 下层 XT 端子排不变：装配表里只有 upper / middle 两级元件
    expect([...new Set(MOTOR_CABINET_LAYOUT.map((p) => p.level))]).toEqual(['upper', 'middle']);
  });

  it('第三十五轮：同排等间隙铺开，两侧留白接近对称', () => {
    const inner = G.DUCT.verticalX - G.DUCT.height / 2;
    for (const level of ['upper', 'middle']) {
      const spans = railSpans(level);
      const gaps = spans.slice(1).map((p, i) => p.left - spans[i].right);
      for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThan(0.005);   // 等间隙
      const leftMargin = spans[0].left + inner;
      const rightMargin = inner - spans[spans.length - 1].right;
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(0.01);                 // 居中
    }
  });

  it('第十七轮（第三十五轮跟进）：同排相邻元件都拉开 > 0.02，不再视觉重合', () => {
    for (const level of ['upper', 'middle']) {
      const spans = railSpans(level);
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i].left - spans[i - 1].right).toBeGreaterThan(0.02);
      }
    }
  });

  it('第十五/十六/三十五轮：PSU / QF 不穿柜顶线槽，PLC / KA 不穿线槽与柜门', () => {
    const upperBase = railBase(G.DIN.upperY);
    const upperCeiling = ductBottom(G.DUCT.rows[0]);
    for (const h of [G.PSU.h, G.QF.h, G.FU.baseH]) {
      expect(upperCeiling - (upperBase + h)).toBeGreaterThanOrEqual(GAP);
    }
    const middleBase = railBase(G.DIN.middleY);
    const middleCeiling = ductBottom(G.DUCT.rows[1]);
    // 第三十五轮：KA 移到第一排，第二排最高件是 KM / PLC，逐个核到层间线槽下沿
    for (const h of [G.PLC.h, G.FR.h]) {
      expect(middleCeiling - (middleBase + h)).toBeGreaterThanOrEqual(GAP);
    }
    // 第二十轮 KA 沿 +Z 分层：y 占底座宽（< RELAY.d），z 占 baseT+coverT（< RELAY.h），
    // 沿用旧上界做保守核算，两个方向都不穿线槽 / 柜门
    expect(upperCeiling - (upperBase + G.RELAY.d)).toBeGreaterThanOrEqual(GAP);
    expect(G.CABINET.depth / 2 - G.DIN.z - G.RELAY.h).toBeGreaterThan(GAP * 4);
  });

  it('第十八轮：内背板下沿高于下层导轨与 XT 端子排，FR 下方露出柜体后板', () => {
    const minY = G.DUCT.rows[2] + G.DUCT.height / 2;
    const terminalTop = railBase(G.DIN.lowerY) + 0.02 + G.TERMINAL.h / 2;
    expect(minY).toBeGreaterThan(terminalTop);
    expect(minY).toBeLessThan(railBase(G.DIN.middleY));
  });

  it('第二十四轮：KA 绕 Z 转 90° 后左右窄上下宽，x 占宽仍小于装配表上界', () => {
    const rotatedX = G.RELAY.w * 0.8;   // 局部 bigH 转成 x 方向
    const rotatedY = G.RELAY.w * 1.5;   // 局部 bigW 转成 y 方向
    expect(rotatedX).toBeLessThan(rotatedY);
    expect(rotatedX).toBeLessThan(G.RELAY.w * 1.16); // cabinetWidth('relay') 的保守上界
  });

  it('第二十五/二十七/二十九轮：沿 z 顺序排列、贴合无缝、透明壳罩住、底边落地', () => {
    const R = G.RELAY;
    const smallT = R.baseT * 0.8;
    const bigFront = -GAP * 2 + R.baseT;
    const smallBack = bigFront;                 // 两级底座贴合，消除侧视缝隙
    const smallFront = smallBack + smallT;
    const blockBack = smallFront;               // 方块贴底座，不悬空
    const blockFront = blockBack + R.blockT;
    const shellBack = smallFront - GAP;
    const shellFront = shellBack + R.coverT;
    expect(blockBack).toBe(smallFront);                         // 方块贴底座
    expect(smallBack).toBe(bigFront);                           // 底座贴合
    expect(shellBack).toBeLessThan(blockBack);                  // 壳从方块后方起
    expect(shellFront).toBeGreaterThan(blockFront);             // 壳完全罩住方块
    expect(shellBack).toBeGreaterThan(smallBack);               // 壳不穿回小黑块后表面
  });
});

describe('整机其他部件的可见面间距', () => {
  it('SKID 横撑不与两条纵梁在 z 上重叠', () => {
    const crossHalf = (G.SKID.beamGap - G.SKID.beamWidth - GAP * 2) / 2;
    const beamInner = G.SKID.beamGap / 2 - G.SKID.beamWidth / 2;
    expect(crossHalf).toBeLessThanOrEqual(beamInner - 1e-9);
  });

  it('三相异步电机长径比敦实，不再读成细长减速电机', () => {
    const total = G.MOTOR.plateT + G.MOTOR.gearboxLen + G.MOTOR.bodyLen
      + G.MOTOR.fanCoverLen + GAP * 3;
    const diameter = G.MOTOR.bodyR * 2;
    expect(total / diameter).toBeLessThan(1.8);
    expect(G.MOTOR.bodyLen / diameter).toBeGreaterThan(0.9);
  });

  it('电机扇叶外缘不穿插 Torus 护圈内缘', () => {
    const bladeOuter = G.MOTOR.fanCoverR * 0.5 + G.MOTOR.fanBladeL / 2;
    const ringInner = G.MOTOR.fanCoverR - G.MOTOR.fanRingT;
    expect(bladeOuter).toBeLessThan(ringInner);
  });

  it('纸箱底面高于皮带接头线顶面', () => {
    const jointTop = G.BELT.topY + GAP + 0.0015 / 2;
    const boxBottom = G.BELT.topY + GAP * 2;
    expect(boxBottom).toBeGreaterThan(jointTop);
  });

  it('皮带顶面与大滚筒顶部相切而非穿出', () => {
    const rollerTop = G.BELT.topY - G.BELT.beltThickness - G.BELT.driveRollerR
      + (G.BELT.driveRollerR + G.BELT.beltThickness);
    expect(Math.abs(rollerTop - G.BELT.topY)).toBeLessThan(1e-9);
  });
});

describe('第三十九轮：输送线不得探进柜体', () => {
  it('皮带左端（半长 + 端板）完全落在柜体右侧之外，留出 GAP', () => {
    const beltLeft = MOTOR_ASSEMBLY.BELT_POSITION[0] - (G.BELT.length / 2 + G.BELT.endPlateT);
    const cabinetRight = MOTOR_ASSEMBLY.CABINET_POSITION[0] + G.CABINET.width / 2;
    expect(beltLeft).toBeGreaterThan(cabinetRight + GAP);
    // 旧值 0.42 时左端 -0.736 会插进柜体，正是 PLC 下方那块灰盒（主动滚筒轴承座）的成因
    expect(beltLeft).toBeGreaterThan(-0.56);
    expect(MOTOR_ASSEMBLY.BELT_POSITION[0]).toBe(0.66);
  });

  it('主动滚筒轴承座前伸后仍在柜体右侧，不会从柜内露出', () => {
    /** 轴承座装在侧梁外侧：z 前伸到 RAIL_Z + railT/2 + bearingD/2，x 最左到驱动滚筒 -DRIVE_X 再减半个宽度 */
    const driveX = G.BELT.length / 2 - G.BELT.driveInset;
    const leftBearingEdge = MOTOR_ASSEMBLY.BELT_POSITION[0] - driveX - G.BELT.bearingW / 2;
    const cabinetRight = MOTOR_ASSEMBLY.CABINET_POSITION[0] + G.CABINET.width / 2;
    expect(leftBearingEdge).toBeGreaterThan(cabinetRight + GAP);
  });
});

describe('第四十轮：DIN 导轨两端不得插进竖向线槽', () => {
  const verticalInner = () => G.DUCT.verticalX - G.DUCT.height / 2;

  it('导轨半长止于竖槽内缘之内并留 GAP', () => {
    expect(G.DIN.length).toBeCloseTo(DUCT_INNER_SPAN, 9);
    expect(G.DIN.length / 2).toBeLessThanOrEqual(verticalInner() - GAP + 1e-9);
    // 旧版写死 0.86（半长 0.43）比竖槽内缘 0.39 还长，两端插进槽体 → 屏幕上闪
    expect(G.DIN.length).toBeLessThan(0.86);
  });

  it('导轨仍完整托住两排元件的最外侧占宽', () => {
    const half = G.DIN.length / 2;
    const widest = Math.max(
      ...MOTOR_CABINET_LAYOUT.map((p) => Math.abs(p.x) + cabinetWidth(p.kind) / 2),
    );
    expect(half).toBeGreaterThan(widest);
  });

  it('导轨与竖槽在 z 向虽有重叠，但 x 向已不再相交', () => {
    const railZBack = G.DIN.z - G.DIN.depth / 2;
    const ductZFront = G.DIN.z - 0.01 + G.DUCT.depth / 2;
    expect(ductZFront).toBeGreaterThan(railZBack); // 说明两者 z 确实重叠，只能靠 x 分开
    const railRight = G.DIN.length / 2;
    expect(railRight).toBeLessThan(verticalInner());
  });
});

describe('第四十三轮：KM 六个端子孔是真凹陷，白色底座不再前凸', () => {
  /** 组件里 CrossScrew 的 r 来自 r*0.82，因此这里用同一个派生值 */
  const screwR = G.KM.terminalPortR * 0.82;
  const half = screwR * 0.95;
  const holeW = G.KM.w / 3 - GAP * 2;
  const front = G.KM.d / 2;
  const wellFloor = front - G.KM.recessDepth;

  it('孔底真实退进本体：框与前脸齐平，螺钉与圆孔都在前脸之后', () => {
    expect(G.KM.recessDepth).toBeGreaterThan(KM_SCREW_RECESS.headFront + GAP);
    expect(wellFloor).toBeLessThan(front);
    // 螺钉头前缘 = 孔底 + headFront，必须仍在本体原始前脸之后
    expect(wellFloor + KM_SCREW_RECESS.headFront).toBeLessThan(front - GAP);
    // 圆孔银片前缘 = 孔底 + GAP*3，同样沉在孔内
    expect(wellFloor + GAP * 3).toBeLessThan(front - GAP);
    expect(KM_SCREW_RECESS.headFront / GAP % 1).toBeCloseTo(0, 9);
  });

  it('旧的前凸端子块彻底删除：本体前脸不再伸出 K.d/2', () => {
    // 旧版 blockFront = K.d/2 + GAP + 0.014 = 前脸外 0.0165，现已不存在
    const oldBlockFront = front + GAP + 0.014;
    expect(oldBlockFront).toBeCloseTo(front + 0.0165, 9);
    expect(front).toBeLessThan(oldBlockFront - 0.016);
    expect(G.KM.recessDepth).toBeGreaterThan(0.008);
  });

  it('十字槽是扇形片之间的真缝：槽宽为正，且缝底露出深色孔底', () => {
    const angle = KM_SCREW_RECESS.slotAngle;
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(Math.PI / 2);      // 四块扇形片仍有正面积
    const slotWidth = 2 * half * Math.sin(angle / 2);
    expect(slotWidth).toBeGreaterThan(0);
    expect(slotWidth).toBeLessThan(half);
  });

  it('螺钉头与方孔都落在单极范围内，不压框架', () => {
    expect(half * 2).toBeLessThan(holeW);
    expect(holeW / 2 - half).toBeGreaterThan(GAP);
    expect(G.KM.terminalPortR * 0.8 * 2).toBeLessThan(holeW); // 圆孔也在孔内
  });
});

describe('第四十二轮：KM 上下端子排必须镜像对称', () => {
  it('下排由上排派生：y 互补、半径与槽型同源', () => {
    expect(KM_TERMINAL_ROWS).toHaveLength(4);
    const upper = KM_TERMINAL_ROWS.filter((r) => r.band === 'upper');
    const lower = KM_TERMINAL_ROWS.filter((r) => r.band === 'lower');
    expect(upper).toHaveLength(KM_TERMINAL_ROW_UPPER.length);
    expect(lower).toHaveLength(KM_TERMINAL_ROW_UPPER.length);
    upper.forEach((u, i) => {
      expect(u.y).toBeCloseTo(KM_TERMINAL_ROW_UPPER[i].y, 9);
      const l = lower.find((r) => r.y === 1 - u.y);
      expect(l).toBeDefined();
      expect(l!.rFactor).toBe(u.rFactor);
      expect(l!.cross).toBe(u.cross);
    });
  });

  it('镜像轴是壳体水平中线：螺钉在外、圆孔在内', () => {
    const sorted = [...KM_TERMINAL_ROWS].sort((a, b) => a.y - b.y);
    expect(sorted[0].y + sorted[3].y).toBeCloseTo(1, 9);
    expect(sorted[1].y + sorted[2].y).toBeCloseTo(1, 9);
    expect(sorted[0].cross).toBe(true);   // 最下方沉孔螺钉
    expect(sorted[3].cross).toBe(true);   // 最上方沉孔螺钉
    expect(sorted[1].cross).toBe(false);  // 内侧圆孔
    expect(sorted[2].cross).toBe(false);
  });
});

describe('第四十四轮：端子槽朝外开口，相邻螺钉间竖条做灭弧格栅', () => {
  const slotH = G.KM.h * (G.KM.bandH + G.KM.frameEdgeH);
  const slotCenterY = (f: number) => G.KM.h * (f + (f > 0.5 ? G.KM.frameEdgeH / 2 : -G.KM.frameEdgeH / 2));

  it('上排槽顶到壳体顶、下排槽底到壳体底，开口无白色横带封堵', () => {
    for (const f of G.KM.bandCenters) {
      const center = slotCenterY(f);
      const top = center + slotH / 2;
      const bottom = center - slotH / 2;
      if (f > 0.5) expect(top).toBeCloseTo(G.KM.h, 9);   // 上排开口在顶
      else expect(bottom).toBeCloseTo(0, 9);              // 下排开口在底
    }
    // 中间横带上下沿与两个槽相接、不重叠
    expect(slotCenterY(G.KM.bandCenters[1]) + slotH / 2).toBeCloseTo(G.KM.h * 0.26, 9);
    expect(slotCenterY(G.KM.bandCenters[0]) - slotH / 2).toBeCloseTo(G.KM.h * 0.74, 9);
  });

  it('灭弧格栅（相邻螺钉间竖条）与左右外侧细边都保留', () => {
    const poleW = G.KM.w / 3;
    const holeW = poleW - GAP * 2;
    const strips: Array<[number, number]> = [];
    let cursor = -G.KM.w / 2;
    for (const cx of [-1, 0, 1].map((i) => i * poleW)) {
      const left = cx - holeW / 2;
      if (left - cursor > 1e-9) strips.push([cursor, left]);
      cursor = cx + holeW / 2;
    }
    if (G.KM.w / 2 - cursor > 1e-9) strips.push([cursor, G.KM.w / 2]);
    expect(strips).toHaveLength(4);   // 左右外侧细边 2 条 + 相邻螺钉间格栅 2 条
    expect(strips[0][0]).toBeCloseTo(-G.KM.w / 2, 9);
    expect(strips[3][1]).toBeCloseTo(G.KM.w / 2, 9);
  });
});

describe('第四十五轮：KM 中部方块与圆柱的进出动作指示', () => {
  const front = G.KM.d / 2;
  const faceDetailZ = front + GAP * 2;
  const blockOut = faceDetailZ + G.KM.actionBlockBase;
  const blockIn = blockOut - G.KM.actionTravel;
  const pinOut = faceDetailZ + G.KM.actionPinBase;
  const pinIn = pinOut - G.KM.actionTravel;

  it('两件同步同行程：吸合沿 −Z 缩回，释放沿 +Z 凸出', () => {
    expect(G.KM.actionTravel).toBeCloseTo(GAP * 3, 9);
    expect(blockOut - blockIn).toBeCloseTo(G.KM.actionTravel, 9);
    expect(pinOut - pinIn).toBeCloseTo(G.KM.actionTravel, 9);
    expect(blockIn).toBeLessThan(blockOut);
    expect(pinIn).toBeLessThan(pinOut);
  });

  it('吸合后不穿进本体前脸：方块后缘留 GAP/2，圆柱后缘恰好齐平', () => {
    expect(blockIn - G.KM.actionBlockD / 2).toBeGreaterThan(front);
    expect(blockIn - G.KM.actionBlockD / 2).toBeCloseTo(front + GAP / 2, 9);
    expect(pinIn - G.KM.actionPinD / 2).toBeCloseTo(front, 9);
  });

  it('壳体厚度足够容纳行程，方块不顶穿后段本体', () => {
    expect(G.KM.d).toBeGreaterThan(G.KM.actionBlockBase + G.KM.actionBlockD);
    expect(blockOut + G.KM.actionBlockD / 2).toBeLessThan(G.KM.d);
  });
});

describe('第四十六轮：FR 俯视压扁 + 两排螺钉留空分层', () => {
  const F = G.FR;
  const screwR = F.terminalPortR * 0.82;
  const screwRowStep = screwR + F.screwRowGap / 2;
  const padBottom = GAP * 2;
  const padTop = F.h - F.capBandH - GAP;
  const padCY = (padBottom + padTop) / 2;

  it('两排螺钉头对头之间留出 GAP*11 空隙，不再相切', () => {
    expect(F.screwRowGap).toBeCloseTo(GAP * 11, 9);
    expect(screwRowStep * 2 - screwR * 2).toBeCloseTo(GAP * 11, 9);
    expect(screwRowStep * 2).toBeGreaterThan(screwR * 2);
  });

  it('上排前凸 GAP*6、下排后凹 GAP，两层相差 GAP*7', () => {
    expect(F.screwUpperOut).toBeCloseTo(GAP * 6, 9);
    expect(F.screwLowerIn).toBeCloseTo(GAP, 9);
    expect(F.screwUpperOut + F.screwLowerIn).toBeCloseTo(GAP * 7, 9);
  });

  it('下排螺钉不被埋进端子块：前脸仍在端子块前脸之外', () => {
    const blockFront = F.d / 2 + GAP + 0.014;           // padD
    const screwBase = blockFront + 0.003;                // 原螺钉头中心
    const lowerFront = screwBase - F.screwLowerIn + 0.003; // 头厚 0.006 的一半
    expect(lowerFront).toBeGreaterThan(blockFront);
    expect(lowerFront - blockFront).toBeGreaterThan(GAP);
  });

  it('分层后上下排螺钉仍完整坐在端子块上', () => {
    expect(padCY - screwRowStep - screwR).toBeGreaterThan(padBottom);
    expect(padCY + screwRowStep + screwR).toBeLessThan(padTop);
  });

  it('进深略宽于上下两颗螺钉纵向叠起来的高度（4*半径），俯视才显扁', () => {
    const twoScrewsHigh = screwR * 4;   // 竖直两排各一颗，纵向共占 4 个半径
    expect(F.d).toBeGreaterThan(twoScrewsHigh + GAP);
    expect(F.d - twoScrewsHigh).toBeLessThan(GAP * 5);
  });
});

describe('第四十七轮：FR 照俯视实物照补银框 / 立筋 / 辅助螺钉 / 刻度数字', () => {
  const F = G.FR;
  const screwR = F.terminalPortR;   // 第四十八轮放大
  const screwRowStep = screwR + F.screwRowGap / 2;
  const padCY = (GAP * 2 + F.h - F.capBandH - GAP) / 2;

  it('上下两个银色框不相接，中间留出黑色横带', () => {
    const upperBottom = padCY + screwRowStep - F.frameH / 2;
    const lowerTop = padCY - screwRowStep + F.frameH / 2;
    expect(upperBottom - lowerTop).toBeGreaterThan(GAP);
    expect(F.frameH).toBeGreaterThan(screwR * 2);   // 框能托住螺钉
  });

  it('第四十九轮：灭弧格栅前脸齐银框、仍低于螺钉，宽度由框间净空派生', () => {
    const ribFront = F.d / 2 + GAP + 0.014 + 0.003 + F.screwUpperOut - F.frameD / 2 + F.ribOut;
    const frameFront = F.d / 2 + GAP + 0.014 + 0.003 + F.screwUpperOut + F.frameD / 2;
    const screwFront = frameFront + GAP + 0.003 + 0.003;
    expect(ribFront).toBeCloseTo(frameFront, 9);     // 与银框齐平
    expect(ribFront).toBeLessThan(screwFront);       // 仍低于螺钉，不挡十字槽
    const clear = F.poleRegionW / 3 - F.frameW;      // 框间净空
    expect(clear * F.ribWidthRatio).toBeGreaterThan(0.005);
    expect(clear * F.ribWidthRatio).toBeLessThan(clear);
  });

  it('两组辅助小螺钉在旋钮下方且不超出壳体', () => {
    const auxY = F.h / 2 - F.dialFaceR - F.auxScrewR * 1.6;
    expect(auxY - F.auxScrewR).toBeGreaterThan(0);
    expect(F.dialX + F.auxSpacing / 2 + F.auxScrewR).toBeLessThan(F.w / 2);
    expect(F.auxScrewR).toBeLessThan(screwR / 2);
  });

  it('旋钮刻度数字三项且按圆周排布', () => {
    expect(F.dialNumbers).toHaveLength(3);
    expect(F.dialNumbers).toEqual(['14', '18', '22']);
    expect(F.tickCount).toBe(8);  // 原刻度线仍在，数字叠加其上
  });
});

describe('第四十八轮：FR 螺钉放大、拉开间距、改 KM 同款银白十字', () => {
  const F = G.FR;
  const step = F.poleRegionW / 3;
  const d = F.terminalPortR * 2;

  it('极距与壳宽：放大后仍不越壳、不碰旋钮', () => {
    const left = F.poleRegionX - step - F.frameW / 2;
    const right = F.poleRegionX + step + F.frameW / 2;
    expect(left).toBeGreaterThanOrEqual(-F.w / 2);
    const dialLeft = F.dialX - F.dialFaceR;
    const sideX = (right + dialLeft) / 2;
    expect(sideX + F.stopW / 2).toBeLessThanOrEqual(dialLeft - GAP + 1e-9);
    expect(right).toBeLessThan(sideX - F.stopW / 2 - GAP + 1e-9);
  });

  it('间距/直径落在 1.6 左右，两颗明显分开', () => {
    expect(step / d).toBeGreaterThan(1.5);
    expect(step / d).toBeLessThan(1.8);
    expect(step - d).toBeGreaterThan(GAP * 4);
  });

  it('上下两排框不相接且座内留边', () => {
    const rowStep = F.terminalPortR + F.screwRowGap / 2;
    expect(2 * rowStep - F.frameH).toBeGreaterThan(GAP);
    const padCY = (GAP * 2 + F.h - F.capBandH - GAP) / 2;
    expect(padCY + rowStep + F.frameH / 2).toBeLessThan(F.h - GAP);
  });
});

describe('第五十轮：FR 竖横格栅把六颗螺钉分成 2×3 六格', () => {
  const F = G.FR;
  const GAPv = GAP;
  const rowStep = F.terminalPortR + F.screwRowGap / 2;
  const cellSpace = 2 * rowStep - F.frameH;      // 上下框之间的空档

  it('上下两框之间有正空档，横格栅填进去且上下留 GAP', () => {
    expect(cellSpace).toBeGreaterThan(F.crossRibGap * 2);
    expect(cellSpace - F.crossRibGap * 2).toBeGreaterThan(0);
    // 竖格栅齐上排银框；横格栅取上下两排框前脸中点，不压任一排
    const up = F.d / 2 + GAPv + 0.014 + 0.003 + F.screwUpperOut;
    const low = F.d / 2 + GAPv + 0.014 + 0.003 - F.screwLowerIn;
    const ribFront = up - F.frameD / 2 + F.ribOut;
    expect(ribFront).toBeCloseTo(up + F.frameD / 2, 9);
    const crossFront = up * F.crossRibFrontRatio + low * (1 - F.crossRibFrontRatio) + F.frameD / 2;
    expect(crossFront).toBeGreaterThan(low + F.frameD / 2);
    expect(crossFront).toBeLessThan(up + F.frameD / 2);
  });

  it('横格栅横向覆盖全部三极，竖格栅贯通上下两排', () => {
    expect(F.poleRegionW + F.frameW).toBeGreaterThan(F.poleRegionW);
    expect(F.poleRegionW / 3 - F.frameW).toBeGreaterThan(0);
    expect(2 * rowStep - F.frameH).toBeGreaterThan(0);
  });
});

describe('第五十一轮：FR 两排贴上下边、中间隔离带、删顶部铜带', () => {
  const F = G.FR;
  const GAPv = GAP;
  const padBottom = GAPv * 2;
  const padTop = F.h - GAPv;                       // 铜带删除后顶到壳顶
  const padCY = (padBottom + padTop) / 2;
  const rowStep = F.terminalPortR + F.screwRowGap / 2;
  const frameTop = padCY + rowStep + F.frameH / 2;
  const frameBottom = padCY - rowStep - F.frameH / 2;

  it('上排框贴壳顶、下排框贴底，中间空档约翻倍', () => {
    expect(padTop - frameTop).toBeGreaterThan(GAPv);
    expect(padTop - frameTop).toBeLessThan(GAPv * 2);
    expect(frameBottom - padBottom).toBeGreaterThanOrEqual(GAPv);
    expect(2 * rowStep - F.frameH).toBeGreaterThan(GAPv * 8);
  });

  it('顶部铜带删除，STOP 贴壳顶不与旋钮打架', () => {
    const stopTop = F.h - GAPv;                   // stopY + stopH/2
    expect(stopTop).toBeLessThan(F.h);
    expect(F.h / 2 + F.dialFaceR).toBeLessThan(F.h - F.stopH);
  });
});
