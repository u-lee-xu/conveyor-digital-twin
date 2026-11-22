/**
 * S3 行为自检：硬件互锁 / 无自锁 / 单一真值 / 过载跳闸 / 演示循环 / 快照键成对。
 * 全部 mutate store 并推进 tick，不靠源码字符串猜测行为。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveContactors, MOTOR_PROCESS, MOTOR_PHASE } from './constants/motorConstants';
import { useMotorStore, exportMotorSnapshot, MOTOR_DEMO_STEPS } from './stores/useMotorStore';

function advance(seconds: number, step = 0.05) {
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n; i += 1) useMotorStore.getState().tick(step);
}

beforeEach(() => {
  useMotorStore.getState().resetAll();
  useMotorStore.getState().setControlSource('local');
  // 默认分断（推杆在下方），行为用例需要先上电才能驱动 KM / 皮带 / 位移
  useMotorStore.getState().setQf(true);
});

describe('硬件互锁纯函数', () => {
  it('两线圈同时有效属禁止态，保持上次吸合状态', () => {
    expect(resolveContactors(true, true, false, false)).toMatchObject({
      km1On: false, km2On: false, forbidden: true,
    });
    expect(resolveContactors(true, true, true, false)).toMatchObject({
      km1On: true, km2On: false, forbidden: true,
    });
  });

  it('反向命令撞上仍吸合的接触器，被常闭辅助触点挡住', () => {
    expect(resolveContactors(false, true, true, false)).toMatchObject({
      km1On: true, km2On: false, interlocked: true,
    });
    expect(resolveContactors(true, false, false, true)).toMatchObject({
      km1On: false, km2On: true, interlocked: true,
    });
  });

  it('任意时刻最多一只吸合', () => {
    const cases = [
      [true, false, false, false], [false, true, false, false],
      [true, true, false, false], [false, true, true, false],
    ] as const;
    for (const [a, b, c, d] of cases) {
      const r = resolveContactors(a, b, c, d);
      expect(r.km1On && r.km2On).toBe(false);
    }
  });
});

describe('手动模式：按钮 → 线圈 → 电机 → 皮带', () => {
  it('正点动吸合 KM1、正转、位移累加，松开即停', () => {
    const s = useMotorStore.getState();
    s.setButton('fwdJog', true);
    advance(1.2);
    let st = useMotorStore.getState();
    expect(st.km1On).toBe(true);
    expect(st.direction).toBe(1);
    expect(st.speedRpm).toBeGreaterThan(0);
    expect(st.beltDisplacement).toBeGreaterThan(0);
    expect(st.phase).toBe(MOTOR_PHASE.FWD_JOG);
    const moved = st.beltDisplacement;
    st.setButton('fwdJog', false);
    advance(0.6);
    st = useMotorStore.getState();
    expect(st.km1On).toBe(false);
    expect(st.direction).toBe(0);
    expect(st.speedRpm).toBeLessThan(MOTOR_PROCESS.RATED_RPM);
    expect(st.beltDisplacement).toBeGreaterThan(moved);
  });

  it('反点动吸合 KM2、反转、位移向负方向', () => {
    useMotorStore.getState().setButton('revJog', true);
    advance(1.2);
    const st = useMotorStore.getState();
    expect(st.km2On).toBe(true);
    expect(st.direction).toBe(-1);
    expect(st.beltDisplacement).toBeLessThan(0);
  });

  it('Q13 临时口径：启动为本地运行锁存，停止解除，不是 KM 自锁接线', () => {
    const s = useMotorStore.getState();
    s.setButton('fwdStart', true);
    s.setButton('fwdStart', false);
    advance(0.5);
    expect(useMotorStore.getState().runLatch).toBe('fwd');
    expect(useMotorStore.getState().km1On).toBe(true);
    useMotorStore.getState().setButton('stop', true);
    useMotorStore.getState().setButton('stop', false);
    advance(0.5);
    expect(useMotorStore.getState().runLatch).toBeNull();
    expect(useMotorStore.getState().km1Cmd).toBe(false);
  });

  it('空气开关分断后线圈全部失电', () => {
    useMotorStore.getState().setButton('fwdJog', true);
    advance(0.5);
    useMotorStore.getState().setQf(false);
    advance(0.2);
    const st = useMotorStore.getState();
    expect(st.km1Cmd).toBe(false);
    expect(st.km1On).toBe(false);
    expect(st.phase).toBe(MOTOR_PHASE.POWER_OFF);
  });
});

describe('换向 / 禁止态 / 过载', () => {
  it('硬件互锁下换向先释放再吸合，中间有灭弧间隙', () => {
    const s = useMotorStore.getState();
    s.setDirectCoil('km1', true);
    advance(0.4);
    expect(useMotorStore.getState().km1On).toBe(true);
    useMotorStore.getState().setDirectCoil('km1', false);
    useMotorStore.getState().setDirectCoil('km2', true);
    useMotorStore.getState().tick(0.05);
    expect(useMotorStore.getState().km1On).toBe(false);
    expect(useMotorStore.getState().arcTimer).toBeGreaterThan(0);
    advance(0.4);
    expect(useMotorStore.getState().km2On).toBe(true);
  });

  it('两接触器同时直控属禁止态，不允许同时吸合', () => {
    const s = useMotorStore.getState();
    s.setDirectCoil('km1', true);
    s.setDirectCoil('km2', true);
    advance(0.3);
    const st = useMotorStore.getState();
    expect(st.forbidden).toBe(true);
    expect(st.km1On && st.km2On).toBe(false);
  });

  it('负载升高 → 电流越阈值 → 热累积 → FR 跳闸，复位后才能再启动', () => {
    const s = useMotorStore.getState();
    s.setLoad(100);
    s.setButton('fwdJog', true);
    advance(3);
    const st = useMotorStore.getState();
    expect(st.currentA).toBeGreaterThan(MOTOR_PROCESS.TRIP_CURRENT_A);
    expect(st.frTripped).toBe(true);
    expect(st.phase).toBe(MOTOR_PHASE.OVERLOAD);
    expect(st.km1Cmd).toBe(false);
    st.setButton('fwdJog', false);
    st.setButton('fwdStart', true);
    st.setButton('fwdStart', false);
    advance(0.3);
    expect(useMotorStore.getState().km1On).toBe(false);
    useMotorStore.getState().resetFr();
    advance(0.3);
    expect(useMotorStore.getState().km1On).toBe(true);
  });

  it('一键过载把热累积推到阈值，下一帧跳闸', () => {
    useMotorStore.getState().triggerOverload();
    useMotorStore.getState().tick(0.05);
    expect(useMotorStore.getState().frTripped).toBe(true);
  });
});

describe('演示状态机', () => {
  it('循环推进并在停止请求后跑完当前轮才停', () => {
    useMotorStore.getState().startDemo();
    useMotorStore.getState().requestStopDemo();
    /** 每轮总时长上界：固定步时长之和 + 跳闸等待余量 */
    const fixed = MOTOR_DEMO_STEPS.reduce((a, s) => a + s.sec, 0);
    for (let i = 0; i < Math.ceil((fixed + 6) / 0.05); i += 1) {
      useMotorStore.getState().tick(0.05);
      if (!useMotorStore.getState().demoRunning) break;
    }
    const st = useMotorStore.getState();
    expect(st.demoRunning).toBe(false);
    expect(st.round).toBeGreaterThanOrEqual(1);
    expect(st.stopRequested).toBe(false);
  });

  it('暂停期间计时冻结，恢复后不跳步', () => {
    useMotorStore.getState().startDemo();
    advance(0.5);
    const before = useMotorStore.getState().demoElapsed;
    useMotorStore.getState().toggleDemoPause();
    advance(1);
    expect(useMotorStore.getState().demoElapsed).toBeCloseTo(before, 5);
    useMotorStore.getState().toggleDemoPause();
    advance(0.2);
    expect(useMotorStore.getState().demoElapsed).toBeGreaterThan(before);
  });
});

describe('PLC RUN / STOP 门控（第三十七轮）', () => {
  it('RUN 时按钮可启动，STOP 后线圈释放，回 RUN 后锁存仍在继续运行', () => {
    const s = useMotorStore.getState();
    s.setButton('fwdStart', true);
    s.setButton('fwdStart', false);
    advance(1);
    expect(useMotorStore.getState().km1On).toBe(true);
    // STOP：程序不执行，线圈命令归零、接触器释放
    useMotorStore.getState().togglePlcRun();
    advance(0.5);
    let st = useMotorStore.getState();
    expect(st.plcRun).toBe(false);
    expect(st.km1On).toBe(false);
    // 回 RUN：程序继续扫描，原有运行锁存仍在
    useMotorStore.getState().togglePlcRun();
    advance(1);
    st = useMotorStore.getState();
    expect(st.plcRun).toBe(true);
    expect(st.km1On).toBe(true);
  });

  it('STOP 期间演示状态机冻结，回 RUN 从原步继续', () => {
    useMotorStore.getState().startDemo();
    advance(0.4);
    const before = useMotorStore.getState().demoElapsed;
    useMotorStore.getState().togglePlcRun();
    advance(1);
    expect(useMotorStore.getState().demoElapsed).toBeCloseTo(before, 5);
    useMotorStore.getState().togglePlcRun();
    advance(0.3);
    expect(useMotorStore.getState().demoElapsed).toBeGreaterThan(before);
  });

  it('STOP 不等于断开电源：合闸与 PLC RUN 是两级开关', () => {
    useMotorStore.getState().togglePlcRun();
    advance(0.1);
    const st = useMotorStore.getState();
    expect(st.qfClosed).toBe(true);      // 主电源仍闭合
    expect(st.plcRun).toBe(false);       // 只是程序停
    expect(st.phase).toBe(MOTOR_PHASE.IDLE);
  });
});

describe('快照与观众镜像', () => {
  it('导出键与应用键成对，应用后同名键仍全部存在', () => {
    useMotorStore.getState().setButton('fwdJog', true);
    advance(0.8);
    const snap = exportMotorSnapshot();
    useMotorStore.getState().applyBroadcast(snap);
    const after = exportMotorSnapshot();
    expect(Object.keys(after).sort()).toEqual(Object.keys(snap).sort());
    expect(after.MOTOR_DIRECTION).toBe(snap.MOTOR_DIRECTION);
    expect(after.MOTOR_FR_TRIPPED).toBe(snap.MOTOR_FR_TRIPPED);
  });

  it('NaN / Infinity 不进入真值', () => {
    const before = useMotorStore.getState();
    useMotorStore.getState().applyBroadcast({
      MOTOR_SPEED: Number.NaN,
      MOTOR_DISPLACEMENT: Number.POSITIVE_INFINITY,
      MOTOR_THERMAL: Number.NaN,
    });
    const after = useMotorStore.getState();
    expect(after.speedRpm).toBe(before.speedRpm);
    expect(after.beltDisplacement).toBe(before.beltDisplacement);
    expect(after.thermal).toBe(before.thermal);
  });

  it('缺字段保留上次值而不是清零', () => {
    useMotorStore.getState().setQf(false);
    const before = useMotorStore.getState();
    useMotorStore.getState().applyBroadcast({ MOTOR_SPEED: 100 });
    expect(useMotorStore.getState().qfClosed).toBe(before.qfClosed);
    expect(useMotorStore.getState().frTripped).toBe(before.frTripped);
  });
});
