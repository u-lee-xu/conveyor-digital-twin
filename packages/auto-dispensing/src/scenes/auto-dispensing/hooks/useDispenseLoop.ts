import { useEffect, useRef } from 'react';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAGAZINE_X, MAG_CAPACITY, HOPPER_OFFSET_X, type MagazineId,
} from '../constants';

/** 滑台演示移动速度（m/s） */
const SLIDER_SPEED = 0.32;
/** 气缸伸/缩动画时间（s） */
const CYL_TIME = 0.35;
/** 药片推出后飞入料斗时间（s） */
const PILL_FLIGHT = 0.4;
/** 翻转动画时间（s） */
const TILT_TIME = 0.8;
/** 空仓红灯闪烁提示时长（s） */
const EMPTY_FLASH = 1.2;

interface LoopRef {
  prevStart: boolean;
  prevConfirm: boolean;
  /** 当前轮次的任务队列（按 A→B→C 过滤配方>0） */
  queue: MagazineId[];
  queueIndex: number;
  /** dosing 剩余次数 */
  remain: number;
  /** 当前药片飞行计时 */
  pillTimer: number;
  pillFlying: boolean;
  /** 气缸动画计时（>0 表示运动进行中，1 正向 0 反向） */
  cylDir: 1 | 0;
  cylTimer: number;
  /** 翻转动画计时 */
  tiltTimer: number;
  tiltDir: 1 | 0;
  /** 空仓闪烁计时 */
  flashTimer: number;
}

const initRef = (): LoopRef => ({
  prevStart: false,
  prevConfirm: false,
  queue: [],
  queueIndex: 0,
  remain: 0,
  pillTimer: 0,
  pillFlying: false,
  cylDir: 1,
  cylTimer: 0,
  tiltTimer: 0,
  tiltDir: 1,
  flashTimer: 0,
});

export function useDispenseLoop() {
  const ref = useRef<LoopRef>(initRef());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = useDispensingStore.getState();
      const r = ref.current;

      // ========== 电机运动（手动/仿真共用：motorFwd/Rev 驱动滑台） ==========
      const moving = s.motorFwd || s.motorRev;
      if (moving && !s.buttons.estop) {
        const dir = s.motorFwd ? 1 : -1;
        s.setSliderX(s.sliderX + dir * SLIDER_SPEED * dt);
      }

      // ========== 传感器实时同步 ==========
      const x = useDispensingStore.getState().sliderX;
      const sensors = useDispensingStore.getState().sensors;
      const limStart = x <= SLIDER_MIN_X + 0.005;
      const limEnd = x >= SLIDER_MAX_X - 0.005;
      if (sensors.limitStart !== limStart || sensors.limitEnd !== limEnd) {
        useDispensingStore.setState({
          sensors: { ...useDispensingStore.getState().sensors, limitStart: limStart, limitEnd: limEnd },
        });
      }

      // ========== 气缸动画推进 ==========
      const cyls = useDispensingStore.getState().sendCyl;
      (Object.keys(cyls) as MagazineId[]).forEach((mag) => {
        const c = cyls[mag];
        // 业务驱动：extended 为真 → 向 1 推进；为假 → 向 0 收回
        if (c.extended && c.position < 1) {
          const p = Math.min(1, c.position + dt / CYL_TIME);
          useDispensingStore.getState().setSendCyl(mag, true, p);
        } else if (!c.extended && c.position > 0) {
          const p = Math.max(0, c.position - dt / CYL_TIME);
          useDispensingStore.getState().setSendCyl(mag, false, p);
        }
      });

      // ========== 药片飞行 ==========
      if (r.pillFlying) {
        r.pillTimer += dt;
        const st = useDispensingStore.getState();
        const progress = Math.min(1, r.pillTimer / PILL_FLIGHT);
        st.setPendingPills(st.pendingPills.map((p) => ({ ...p, progress })));
        if (progress >= 1) {
          r.pillFlying = false;
          // 落入料斗
          useDispensingStore.getState().setPendingPills([]);
          useDispensingStore.getState().addPillToHopper();
        }
      }

      // ========== 演示（auto）流程状态机 ==========

      // 启动上升沿 → 快照配方生成队列
      const startPressed = s.buttons.start && !r.prevStart;
      r.prevStart = s.buttons.start;

      // 急停在任意阶段立即停止
      if (s.buttons.estop) {
        useDispensingStore.setState({
          motorFwd: false,
          motorRev: false,
          targetX: null,
          sendCyl: {
            A: { extended: false, position: 0 }, B: { extended: false, position: 0 }, C: { extended: false, position: 0 },
          },
          autoPhase: 'idle',
        });
        raf = requestAnimationFrame(tick);
        return;
      }

      const st = useDispensingStore.getState();

      // 停止按钮 → 暂停：停电机、清目标（保持位置）
      if (s.buttons.stop && s.autoPhase !== 'idle') {
        useDispensingStore.setState({ motorFwd: false, motorRev: false, targetX: null });
        raf = requestAnimationFrame(tick);
        return;
      }

      if (st.autoPhase === 'idle') {
        // 复位按钮 → 归零
        if (s.buttons.reset) {
          useDispensingStore.getState().resetAll();
        }
        if (startPressed) {
          const recipe = st.recipe;
          r.queue = (['A', 'B', 'C'] as MagazineId[]).filter((m) => recipe[m] > 0);
          r.queueIndex = 0;
          useDispensingStore.setState({ autoPhase: 'travel' });
        }
      } else if (st.autoPhase === 'travel') {
        // 决定目标（接药位：料斗在滑块 +X 侧，停靠 = 药仓 X - 料斗偏移；取药位 = 行程终点）
        const target = r.queueIndex < r.queue.length
          ? MAGAZINE_X[r.queue[r.queueIndex]] - HOPPER_OFFSET_X
          : SLIDER_MAX_X;
        const cur = st.sliderX;
        const delta = target - cur;
        if (Math.abs(delta) < 0.006) {
          // 到达
          useDispensingStore.setState({ motorFwd: false, motorRev: false, targetX: null });
          if (r.queueIndex < r.queue.length) {
            const mag = r.queue[r.queueIndex];
            if (st.magStock[mag] <= 0) {
              // 空仓：红灯闪烁提示 + 自动补药
              r.flashTimer = EMPTY_FLASH;
              useDispensingStore.setState({ autoPhase: 'dosing', dosingMag: mag, dosingRemain: st.recipe[mag] });
            } else {
              useDispensingStore.setState({ autoPhase: 'dosing', dosingMag: mag, dosingRemain: st.recipe[mag] });
            }
          } else {
            useDispensingStore.setState({ autoPhase: 'tilt' });
          }
        } else {
          const fwd = delta > 0;
          useDispensingStore.setState({ motorFwd: fwd, motorRev: !fwd });
        }
      } else if (st.autoPhase === 'dosing') {
        const mag = st.dosingMag;
        if (!mag) { useDispensingStore.setState({ autoPhase: 'travel' }); raf = requestAnimationFrame(tick); return; }

        // 空仓闪烁
        if (r.flashTimer > 0) {
          r.flashTimer -= dt;
          const on = Math.floor(r.flashTimer * 6) % 2 === 0;
          st.setLamp('red', on);
          if (r.flashTimer <= 0) {
            st.setLamp('red', false);
            // 自动补药
            useDispensingStore.getState().setMagStock(mag, MAG_CAPACITY);
          }
          raf = requestAnimationFrame(tick);
          return;
        }

        const cyl = st.sendCyl[mag];
        if (!cyl.extended && !r.pillFlying) {
          if (st.dosingRemain > 0) {
            // 伸出
            useDispensingStore.getState().setSendCyl(mag, true, cyl.position);
          } else {
            // 本仓完成 → 下一目标
            r.queueIndex += 1;
            useDispensingStore.setState({ dosingMag: null, dosingRemain: 0, autoPhase: 'travel' });
          }
        } else if (cyl.extended && cyl.position >= 1 && !r.pillFlying && st.dosingRemain > 0) {
          // 伸到位：推出一粒（减去库存、生成飞行药片）
          if (st.magStock[mag] > 0) {
            useDispensingStore.getState().setMagStock(mag, st.magStock[mag] - 1);
            r.pillTimer = 0;
            r.pillFlying = true;
            const pid = `pill_${Date.now()}`;
            useDispensingStore.getState().setPendingPills([{ id: pid, mag, progress: 0 }]);
            useDispensingStore.getState().setDosing(mag, st.dosingRemain - 1);
          }
        } else if (r.pillFlying) {
          // 等飞行完成
        } else if (st.dosingRemain <= 0) {
          // 缩缸
          useDispensingStore.getState().setSendCyl(mag, false, cyl.position);
        }
      } else if (st.autoPhase === 'tilt') {
        const t = st.tiltCyl;
        if (!t.tilted) {
          useDispensingStore.getState().setTiltCyl(true, t.angle + dt / TILT_TIME);
          if (t.angle + dt / TILT_TIME >= 1) {
            // 翻转到位：药片倒入取药仓
            const pills = st.hopperPills;
            if (pills > 0) {
              // 按配方比例无法精确回源仓，累计到 A 便于取药显示（简化）
              useDispensingStore.getState().setBinPills('A', st.binPills.A + pills);
              useDispensingStore.getState().setHopperPills(0);
            }
            st.setLamp('green', false);
            st.setLamp('yellow', true); // 请取药
            useDispensingStore.setState({ autoPhase: 'returning' });
          }
        }
      } else if (st.autoPhase === 'returning') {
        // 归位翻转 + 回程
        const t = st.tiltCyl;
        if (t.tilted) {
          useDispensingStore.getState().setTiltCyl(false, Math.max(0, t.angle - dt / TILT_TIME));
          if (t.angle - dt / TILT_TIME > 0) { raf = requestAnimationFrame(tick); return; }
        }
        const delta = SLIDER_MIN_X - st.sliderX;
        if (Math.abs(delta) < 0.006) {
          useDispensingStore.setState({ motorFwd: false, motorRev: false, targetX: null, autoPhase: 'wait_confirm' });
        } else {
          useDispensingStore.setState({ motorFwd: delta < 0, motorRev: delta > 0 });
        }
      } else if (st.autoPhase === 'wait_confirm') {
        // 等待人工取药确认（黄灯亮）
        const confirmPressed = st.buttons.confirm && !r.prevConfirm;
        r.prevConfirm = st.buttons.confirm;
        if (confirmPressed) {
          useDispensingStore.getState().clearBin();
          st.setLamp('yellow', false);
          st.setLamp('green', true);
          useDispensingStore.getState().bumpCycle();
          // 下一轮：重新开始（同一配方）
          r.queue = (['A', 'B', 'C'] as MagazineId[]).filter((m) => st.recipe[m] > 0);
          r.queueIndex = 0;
          useDispensingStore.setState({ autoPhase: 'travel' });
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}