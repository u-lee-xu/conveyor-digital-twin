import { describe, it, expect, beforeEach } from 'vitest';
import { useDispensingStore } from './stores/useDispensingStore';
import {
  SCENE_SCALE, PILL_R, PILL_H, PILL_BASE_Y,
  CHUTE_EXIT_Z, CHUTE_RAMP_Y0, CHUTE_RAMP_END_Z, CHUTE_RAMP_END_Y,
  CHUTE_RAMP_MID_Y, CHUTE_RAMP_MID_Z, CHUTE_RAMP_LEN, CHUTE_RAMP_ANGLE,
  CHUTE_RAMP_DY, CHUTE_RAMP_DZ,
  HOPPER, HOPPER_CENTER_Y, HOPPER_CENTER_Z, HOPPER_OPEN_Y,
  MAG_TRAY_W, MAG_TRAY_Y, MAG_TRAY_Z0, MAG_TRAY_Z1,
  MAGAZINE_X, CYL_FEED_STROKE, FEED_CYL_TIME,
  type MagazineId,
} from './scenes/auto-dispensing/constants';
import {
  PHYSICS, RAMP_GEOMETRY,
  toPhysicsWorld, pillSpawnWorld,
  trayColliderWorld, rampColliderWorld, railCollidersWorld, allStaticColliders,
  hopperCenterWorld, hopperColliderParts, crossedHopperMouth,
  isPhysicsActive, setPhysicsActive, getPhysicsStats,
  notePillFrame, getPillTrace,
  type WorldPoint,
} from './scenes/auto-dispensing/physicsGeometry';

const S = SCENE_SCALE;
const MAGS: MagazineId[] = ['A', 'B', 'C', 'D'];

const point = (x: number, y: number, z: number): WorldPoint => ({ x, y, z });

describe('物理世界：尺度与坐标映射', () => {
  it('长度与重力同比例放大，运动时间尺度不变', () => {
    expect(PHYSICS.SCALE).toBe(S);
    expect(PHYSICS.GRAVITY).toBeCloseTo(-9.8 * S, 6);
    // d = ½gt²：d 与 g 同时 ×S，t 不变，物理过程与 1:1 真实设备一致
    const d = 0.15;
    const tReal = Math.sqrt(2 * d / 9.8);
    const tWorld = Math.sqrt(2 * d * S / -PHYSICS.GRAVITY);
    expect(tWorld).toBeCloseTo(tReal, 6);
  });

  it('推出初速度 = 退药气缸行程 / 伸缸时间，再按尺度换算', () => {
    expect(CYL_FEED_STROKE).toBeGreaterThan(0);
    expect(PHYSICS.PUSH_SPEED).toBeCloseTo(CYL_FEED_STROKE / FEED_CYL_TIME * S, 6);
    // 视觉推杆与刚体同源：0.35s 内走完整个行程
    expect(CYL_FEED_STROKE / FEED_CYL_TIME * FEED_CYL_TIME).toBeCloseTo(CYL_FEED_STROKE, 6);
  });

  it('镜像只翻 X，Y/Z 与尺度不变', () => {
    const a = toPhysicsWorld(0.55, 1.34, 0.06, false);
    const b = toPhysicsWorld(0.55, 1.34, 0.06, true);
    expect(a[0]).toBeCloseTo(0.55 * S, 6);
    expect(b[0]).toBeCloseTo(-0.55 * S, 6);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
    expect(a[1]).toBeCloseTo(1.34 * S, 6);
  });

  it('能力标记默认关闭（无 Canvas 的纯逻辑环境走定时兜底）', () => {
    setPhysicsActive(false);
    expect(isPhysicsActive()).toBe(false);
    setPhysicsActive(true);
    expect(getPhysicsStats().active).toBe(true);
    setPhysicsActive(false);
  });
});

describe('物理世界：药片生成点与静态碰撞体', () => {
  it('生成点与斜槽起点共点，且药片底面不穿进槽面', () => {
    expect(RAMP_GEOMETRY.pillRadius).toBe(PILL_R);
    expect(RAMP_GEOMETRY.pillHeight).toBe(PILL_H);
    // 料斗内腔必须容得下药片直径
    expect(HOPPER.W - 2 * HOPPER.T).toBeGreaterThan(2 * PILL_R);
    MAGS.forEach((m) => {
      const p = pillSpawnWorld(m, false);
      expect(p[0]).toBeCloseTo(MAGAZINE_X[m] * S, 6);
      expect(p[2]).toBeCloseTo(CHUTE_EXIT_Z * S, 6);
      // 药片中心在槽面之上：槽面 Y0 + 半片厚 + 生成间隙
      expect(p[1] / S).toBeCloseTo(CHUTE_RAMP_Y0 + PILL_H / 2 + PHYSICS.SPAWN_CLEARANCE, 6);
      expect(p[1] / S - PILL_H / 2).toBeGreaterThan(CHUTE_RAMP_Y0);
      expect(p[1] / S).toBeGreaterThan(HOPPER_OPEN_Y); // 起点高于料斗口，才有下落空间
    });
  });

  it('斜槽碰撞体两端精确落在「托板出口」与「料斗口后缘上方」', () => {
    MAGS.forEach((m) => {
      const ramp = rampColliderWorld(m, false);
      expect(ramp.rotation[0]).toBeCloseTo(CHUTE_RAMP_ANGLE, 6);
      expect(ramp.position[0]).toBeCloseTo(MAGAZINE_X[m] * S, 6);
      expect(ramp.position[1]).toBeCloseTo(CHUTE_RAMP_MID_Y * S, 6);
      expect(ramp.position[2]).toBeCloseTo(CHUTE_RAMP_MID_Z * S, 6);
      expect(ramp.half[2]).toBeCloseTo(CHUTE_RAMP_LEN / 2 * S, 6);

      // 绕 X 轴旋转后，局部 +Z 方向 = (0, -sinθ, cosθ)
      const half = ramp.half[2] / S;
      const startY = ramp.position[1] / S + half * Math.sin(CHUTE_RAMP_ANGLE);
      const startZ = ramp.position[2] / S - half * Math.cos(CHUTE_RAMP_ANGLE);
      const endY = ramp.position[1] / S - half * Math.sin(CHUTE_RAMP_ANGLE);
      const endZ = ramp.position[2] / S + half * Math.cos(CHUTE_RAMP_ANGLE);
      expect(startZ).toBeCloseTo(CHUTE_EXIT_Z, 6);
      expect(startY).toBeCloseTo(CHUTE_RAMP_Y0, 6);
      expect(endZ).toBeCloseTo(CHUTE_RAMP_END_Z, 6);
      expect(endY).toBeCloseTo(CHUTE_RAMP_END_Y, 6);
      // 斜槽确向 +Z 下降，药片靠重力滑向料斗
      expect(endY).toBeLessThan(startY);
      expect(CHUTE_RAMP_DY).toBeGreaterThan(0);
      expect(CHUTE_RAMP_DZ).toBeGreaterThan(0);
      expect(RAMP_GEOMETRY.angle).toBeCloseTo(Math.atan2(CHUTE_RAMP_DY, CHUTE_RAMP_DZ), 6);
    });
  });

  it('托板碰撞体与可见托板同尺寸，顶面刚好托住最底药片', () => {
    MAGS.forEach((m) => {
      const tray = trayColliderWorld(m, false);
      expect(tray.half[0]).toBeCloseTo(MAG_TRAY_W / 2 * S, 6);
      expect(tray.half[2]).toBeCloseTo((MAG_TRAY_Z1 - MAG_TRAY_Z0) / 2 * S, 6);
      expect(tray.position[1]).toBeCloseTo(MAG_TRAY_Y * S, 6);
      const top = tray.position[1] + tray.half[1];
      // 托板顶面不高于药片底面（否则会初始穿透），差值小于 1 片厚
      expect(top / S).toBeLessThanOrEqual(PILL_BASE_Y - PILL_H / 2 + 1e-6);
      expect((PILL_BASE_Y - PILL_H / 2 - top / S)).toBeLessThan(PILL_H);
    });
  });

  it('侧导轨把药片约束在料斗内腔 X 范围内', () => {
    MAGS.forEach((m) => {
      const rails = railCollidersWorld(m, false);
      expect(rails).toHaveLength(2);
      expect(rails[0].position[0]).toBeLessThan(rails[1].position[0]);
      const innerFace = MAG_TRAY_W / 2 - PHYSICS.RAIL_X - PHYSICS.RAIL_T / 2;
      const maxPillCenterX = innerFace - RAMP_GEOMETRY.pillRadius;
      expect(maxPillCenterX).toBeGreaterThan(0);
      expect(maxPillCenterX).toBeLessThan((HOPPER.W / 2 - HOPPER.T));
      rails.forEach((r) => expect(r.rotation[0]).toBeCloseTo(CHUTE_RAMP_ANGLE, 6));
    });
    // 每个单元 1 托板 + 1 斜槽 + 2 导轨
    expect(allStaticColliders('A', false)).toHaveLength(4);
  });

  it('料斗内腔碰撞体：底板 + 四壁，内腔尺寸容得下药片且跟随滑块', () => {
    const parts = hopperColliderParts();
    expect(parts).toHaveLength(5);
    // 底板位于斗心下方，顶面 = 斗口 - H + T
    expect(parts[0].center[1]).toBeCloseTo((-HOPPER.H / 2 + HOPPER.T / 2) * S, 6);
    expect(parts[0].center[1] + parts[0].half[1]).toBeCloseTo((-HOPPER.H / 2 + HOPPER.T) * S, 6);
    // X/Z 壁内表面围出的内腔
    const innerHalfW = (HOPPER.W / 2 - HOPPER.T) * S;
    const innerHalfD = (HOPPER.D / 2 - HOPPER.T) * S;
    expect(Math.abs(parts[1].center[0]) + parts[1].half[0]).toBeCloseTo(HOPPER.W / 2 * S, 6);
    expect(Math.abs(parts[3].center[2]) + parts[3].half[2]).toBeCloseTo(HOPPER.D / 2 * S, 6);
    expect(innerHalfW).toBeGreaterThan(PILL_R * S);
    expect(innerHalfD).toBeGreaterThan(PILL_R * S);

    const c = hopperCenterWorld(MAGAZINE_X.B, false);
    expect(c[0]).toBeCloseTo(MAGAZINE_X.B * S, 6);
    expect(c[1]).toBeCloseTo(HOPPER_CENTER_Y * S, 6);
    expect(c[2]).toBeCloseTo(HOPPER_CENTER_Z * S, 6);
    expect(hopperCenterWorld(MAGAZINE_X.B, true)[0]).toBeCloseTo(-c[0], 6);

    // 斜槽末端高于斗口，药片从 -Z 壁上方飞入而不是撞壁
    expect(CHUTE_RAMP_END_Y).toBeGreaterThan(HOPPER_OPEN_Y);
    expect(CHUTE_RAMP_END_Z).toBeGreaterThan(HOPPER_CENTER_Z - HOPPER.D / 2);
  });

  it('镜像后碰撞体 X 全部取负，Z/Y/尺寸不变', () => {
    const normal = allStaticColliders('C', false);
    const mirrored = allStaticColliders('C', true);
    normal.forEach((b, i) => {
      expect(mirrored[i].position[0]).toBeCloseTo(-b.position[0], 6);
      expect(mirrored[i].position[1]).toBeCloseTo(b.position[1], 6);
      expect(mirrored[i].position[2]).toBeCloseTo(b.position[2], 6);
      expect(mirrored[i].half).toEqual(b.half);
      expect(mirrored[i].rotation).toEqual(b.rotation);
    });
  });
});

describe('物理世界：落斗判定', () => {
  const rimY = HOPPER_OPEN_Y * S;
  const hz = HOPPER_CENTER_Z * S;

  it('药片越过料斗口平面且落在内腔 → 判定落斗', () => {
    const hopperX = MAGAZINE_X.B;
    const prev = point(hopperX * S, rimY + 0.02, hz);
    const cur = point(hopperX * S, rimY - 0.01, hz);
    expect(crossedHopperMouth(prev, cur, hopperX, false)).toBe(true);
  });

  it('已在斗口以下、斗底以上 → 低帧率下也能补判', () => {
    const hopperX = MAGAZINE_X.C;
    const prev = point(hopperX * S, rimY - 0.004, hz);
    const cur = point(hopperX * S, rimY - 0.01, hz);
    expect(crossedHopperMouth(prev, cur, hopperX, false)).toBe(true);
  });

  it('X 或 Z 偏出内腔、尚未越过斗口、已穿出斗底 → 都不算落斗', () => {
    const hx = MAGAZINE_X.A * S;
    const halfW = (HOPPER.W / 2 - HOPPER.T) * S;
    const halfD = (HOPPER.D / 2 - HOPPER.T) * S;
    const above = (x: number, z = hz) => point(x, rimY + 0.02, z);
    const below = (x: number, z = hz) => point(x, rimY - 0.01, z);
    expect(crossedHopperMouth(above(hx + halfW * 2), below(hx + halfW * 2), MAGAZINE_X.A, false)).toBe(false);
    expect(crossedHopperMouth(above(hx, hz + halfD * 2), below(hx, hz + halfD * 2), MAGAZINE_X.A, false)).toBe(false);
    expect(crossedHopperMouth(above(hx), point(hx, rimY + 0.01, hz), MAGAZINE_X.A, false)).toBe(false);
    const bottomY = (HOPPER_OPEN_Y - HOPPER.H) * S;
    expect(crossedHopperMouth(point(hx, bottomY - 0.02, hz), point(hx, bottomY - 0.03, hz), MAGAZINE_X.A, false)).toBe(false);
  });

  it('低帧率：用线段与斗口平面的交点判定，终点飞出斗腔也不漏判', () => {
    const hx = MAGAZINE_X.A * S;
    // 模拟软件渲染的一整帧：药片从斗口上方一路飞到斗口下方且 Z 已超出内腔，
    // 但穿越平面那一刻仍在斗口内 → 必须判定为落入料斗。
    const prev = point(hx, rimY + 0.18, hz - 0.10);
    const cur = point(hx, rimY - 0.42, hz + 0.25);
    expect(crossedHopperMouth(prev, cur, MAGAZINE_X.A, false)).toBe(true);
    // 交点本身就在斗口外 → 不能算落入
    const missed = point(hx + (HOPPER.W / 2 - HOPPER.T) * S * 4, rimY - 0.42, hz + 0.25);
    expect(crossedHopperMouth(prev, missed, MAGAZINE_X.A, false)).toBe(false);
  });

  it('轨迹采样有上限，不会无限增长', () => {
    for (let i = 0; i < 900; i += 1) notePillFrame('trace-test', point(i, i, i));
    expect(getPillTrace().length).toBeLessThanOrEqual(800);
  });

  it('镜像布局下按 -hopperX 判定', () => {
    const hopperX = MAGAZINE_X.D;
    const prev = point(-hopperX * S, rimY + 0.02, hz);
    const cur = point(-hopperX * S, rimY - 0.01, hz);
    expect(crossedHopperMouth(prev, cur, hopperX, true)).toBe(true);
    expect(crossedHopperMouth(prev, cur, hopperX, false)).toBe(false);
  });
});

describe('物理世界：落斗结算不重复计数', () => {
  beforeEach(() => { useDispensingStore.getState().resetAll(); });

  it('landPill 只移除指定药片、只加一次，重复/未知 id 无效', () => {
    const s = () => useDispensingStore.getState();
    s().setPendingPills([
      { id: 'p1', mag: 'A', progress: 0 },
      { id: 'p2', mag: 'C', progress: 0 },
    ]);

    s().landPill('p1');
    expect(s().pendingPills.map((p) => p.id)).toEqual(['p2']);
    expect(s().hopperPills).toBe(1);
    expect(s().hopperStock.A).toBe(1);
    expect(s().hopperStock.C).toBe(0);

    s().landPill('p1');
    s().landPill('never-existed');
    expect(s().hopperPills).toBe(1);
    expect(s().pendingPills).toHaveLength(1);
  });

  it('物理已结算的药片不会在兜底超时里被二次计入', () => {
    const s = () => useDispensingStore.getState();
    s().setPendingPills([
      { id: 'p1', mag: 'B', progress: 0 },
      { id: 'p2', mag: 'D', progress: 0 },
    ]);
    s().landPill('p1');

    // 模拟 useDispenseLoop 的兜底：清空在途数组，只为仍在数组里的药片补计数
    const inFlight = [...s().pendingPills];
    s().setPendingPills([]);
    inFlight.forEach((p) => s().addPillToHopper(p.mag));

    expect(s().hopperPills).toBe(2);
    expect(s().hopperStock.B).toBe(1);
    expect(s().hopperStock.D).toBe(1);
  });

  it('无物理世界时兜底仍能按来源全部计入', () => {
    expect(isPhysicsActive()).toBe(false);
    const s = () => useDispensingStore.getState();
    const inFlight = [
      { id: 'q1', mag: 'A' as MagazineId, progress: 0 },
      { id: 'q2', mag: 'A' as MagazineId, progress: 0 },
      { id: 'q3', mag: 'D' as MagazineId, progress: 0 },
    ];
    s().setPendingPills(inFlight);
    s().setPendingPills([]);
    inFlight.forEach((p) => s().addPillToHopper(p.mag));
    expect(s().hopperPills).toBe(3);
    expect(s().hopperStock.A).toBe(2);
    expect(s().hopperStock.D).toBe(1);
  });
});
