import { useEffect, useRef } from 'react';
import { useDispensingStore, type PendingPill } from '../../../stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAGAZINE_X, MAG_CAPACITY, HOPPER_OFFSET_X,
  FEED_CYL_TIME, SCREW_DETAIL, type MagazineId,
} from '../constants';
import { isPhysicsActive, PHYSICS } from '../physicsGeometry';

/** 演示滑台速度（m/s）：与丝杆导程共用 SCREW_DETAIL，转速换算才自洽 */
const { SLIDER_SPEED } = SCREW_DETAIL;

/**
 * 自动流程到位窗口（m）：至少覆盖本帧可走的距离。
 * 演示速度提到 0.45 m/s 后，50ms 帧可走 22.5mm，远大于旧的固定 6mm 窗口；
 * 只判「接近」会让滑台在接药位两侧来回振荡、永远进不了 dosing。
 * 因此窗口随 dt 放大，命中后由 setSliderX 精确落位，既不会越过也不会漂移。
 */
const arriveTol = (dt: number) => Math.max(0.006, SLIDER_SPEED * dt);

/**
 * 在途药片计时（id → 生成时刻 / 超时是否按落斗计入）。
 * 放在 hook 模块里而不加进 store 的 PendingPill，是为了不破坏物理层与既有单测的数据形状。
 */
const pillTimers = new Map<string, { born: number; credit: boolean }>();
let pillSeq = 0;

/**
 * 统一的「伸到位出药」入口：扣料筒库存 + 生成一粒物理刚体。
 * 手动面板、演示状态机、PLC/仿真写入、观众端广播都通过气缸 position 走到这里，
 * 因此不会再出现「手动伸缸只推动视觉药片、药停在出药口不掉落」。
 * creditOnTimeout：自动流程为保证状态机闭环，超时按落斗计入；
 * 手动/仿真没有落进斗就只是丢弃（药片真的掉到地上，不该凭空计入料斗）。
 */
function spawnPill(mag: MagazineId, creditOnTimeout: boolean): boolean {
  const st = useDispensingStore.getState();
  if (st.magStock[mag] <= 0) return false;
  const id = `pill_${Date.now()}_${++pillSeq}_${mag}`;
  pillTimers.set(id, { born: performance.now(), credit: creditOnTimeout });
  st.setMagStock(mag, st.magStock[mag] - 1);
  st.setPendingPills([...st.pendingPills, { id, mag, progress: 0 }]);
  return true;
}
/**
 * 无物理世界时（单测 / 纯逻辑环境）接药段的定时结算时间（s）。
 * 挂了真实物理世界则由刚体越过料斗口结算，超时只作安全兜底，见 PHYSICS.PILL_TIMEOUT。
 */
const PILL_FLIGHT = 0.55;
/** 翻转后药片从料斗口抛落到取药仓的时间（s） */
const DUMP_FLIGHT = 0.7;
/** 翻转动画时间（s） */
const TILT_TIME = 0.8;
/** 空仓红灯闪烁提示时长（s） */
const EMPTY_FLASH = 1.2;

const MAG_IDS: MagazineId[] = ['A', 'B', 'C', 'D'];

interface LoopRef {
  prevStart: boolean;
  /** 当前轮次的任务队列（按 A→B→C→D 过滤配方>0） */
  queue: MagazineId[];
  queueIndex: number;
  /** dosing 剩余次数 */
  remain: number;
  /** 本轮演示是否在等待在途药片结算 */
  pillFlying: boolean;
  /** 气缸动画计时（>0 表示运动进行中，1 正向 0 反向） */
  cylDir: 1 | 0;
  cylTimer: number;
  /** 翻转动画计时 */
  tiltTimer: number;
  tiltDir: 1 | 0;
  /** 本轮倒药是否已启动（防止 tilt 阶段重复生成飞行药片） */
  dumpStarted: boolean;
  /** 空仓闪烁计时 */
  flashTimer: number;
}

const initRef = (): LoopRef => ({
  prevStart: false,
  queue: [],
  queueIndex: 0,
  remain: 0,
  pillFlying: false,
  cylDir: 1,
  cylTimer: 0,
  tiltTimer: 0,
  tiltDir: 1,
  dumpStarted: false,
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
      // 手动点动（jogActive）时 Y0/Y1 线圈仍置位，但位移已由面板按 MANUAL_JOG.STEP
      // 发离散脉冲，这里必须让位，否则 rAF 会用演示速度把「点一次」放大成几十毫米。
      // 演示自动流程 / PLC / 观众广播不置 jogActive，速度仍是原来的 SLIDER_SPEED。
      const moving = s.motorFwd || s.motorRev;
      if (moving && !s.buttons.estop && !s.jogActive) {
        const dir = s.motorFwd ? 1 : -1;
        s.setSliderX(s.sliderX + dir * SLIDER_SPEED * dt);
      }

      // 原点/终点传感器与增量式编码器寄存器已在 store.setSliderX 内统一推导，
      // 这里不再重复同步：手动/演示/PLC/广播任一写入路径都会即时触发信号。

      // ========== 气缸动画推进 ==========
      const cyls = useDispensingStore.getState().sendCyl;
      MAG_IDS.forEach((mag) => {
        const c = cyls[mag];
        // 业务驱动：extended 为真 → 向 1 推进；为假 → 向 0 收回
        if (c.extended && c.position < 1) {
          const p = Math.min(1, c.position + dt / FEED_CYL_TIME);
          useDispensingStore.getState().setSendCyl(mag, true, p);
        } else if (!c.extended && c.position > 0) {
          const p = Math.max(0, c.position - dt / FEED_CYL_TIME);
          useDispensingStore.getState().setSendCyl(mag, false, p);
        }
      });

      // ========== 伸到位上升沿：手动 / 演示 / PLC / 广播统一出一片药 ==========
      MAG_IDS.forEach((mag) => {
        const st = useDispensingStore.getState();
        const c = st.sendCyl[mag];
        if (c.extended && c.position >= 0.999 && !st.dispensed[mag]) {
          st.setDispensed(mag, true); // 先上锁：保持伸出期间不会每帧重复出药
          const isAuto = st.autoPhase === 'dosing' && st.dosingMag === mag;
          const spawned = spawnPill(mag, isAuto);
          if (isAuto) {
            if (spawned) r.pillFlying = true;
            st.setDosing(mag, st.dosingRemain - 1);
            // 与飞行并行缩缸，保证每粒都走完整的「伸 → 顶出 → 缩」循环
            st.setSendCyl(mag, false, 1);
          }
          // 手动 / 仿真模式保持伸出，等用户点缩回；完全缩回后才解锁下一轮
        }
        if (!c.extended && c.position <= 0.001 && st.dispensed[mag]) {
          st.setDispensed(mag, false);
        }
      });

      // ========== 翻转缸动画（tilted 标志驱动 angle 平滑过渡，动画段不修改 tilted） ==========
      {
        const t = useDispensingStore.getState().tiltCyl;
        const target = t.tilted ? 1 : 0;
        if (Math.abs(t.angle - target) > 0.001) {
          const dir = target > t.angle ? 1 : -1;
          const newAngle = Math.max(0, Math.min(1, t.angle + dir * dt / TILT_TIME));
          useDispensingStore.getState().setTiltCyl(t.tilted, newAngle);
        }
      }

      // ========== 在途药片：物理层落斗结算 + 逐粒超时清理 ==========
      //
      // 有 PhysicsWorld 时 PillBody 越过料斗口就 landPill(id)；没落进斗（例如手动模式
      // 滑台不在该药仓接药位，药片真的掉到地上）也必须按粒超时移除，否则刚体会无限堆积。
      {
        const st = useDispensingStore.getState();
        const timeout = isPhysicsActive() ? PHYSICS.PILL_TIMEOUT : PILL_FLIGHT;
        const now = performance.now();
        const alive: PendingPill[] = [];
        const expired: PendingPill[] = [];
        st.pendingPills.forEach((p) => {
          let t = pillTimers.get(p.id);
          if (!t) {
            // 外部写入 / 单测直接 setPendingPills：沿用自动流程的兜底语义
            t = { born: now, credit: true };
            pillTimers.set(p.id, t);
          }
          (now - t.born >= timeout * 1000 ? expired : alive).push(p);
        });
        if (expired.length > 0) {
          st.setPendingPills(alive);
          expired.forEach((p) => {
            const t = pillTimers.get(p.id);
            if (t?.credit) st.addPillToHopper(p.mag);
            pillTimers.delete(p.id);
          });
        }
        // 物理层 landPill 移除的药片：同步回收计时项
        if (pillTimers.size > 0) {
          const ids = new Set(useDispensingStore.getState().pendingPills.map((p) => p.id));
          pillTimers.forEach((_t, id) => { if (!ids.has(id)) pillTimers.delete(id); });
        }
      }
      // 在途清空（物理结算或超时清理）即解除演示状态机的等待
      if (r.pillFlying && useDispensingStore.getState().pendingPills.length === 0) {
        r.pillFlying = false;
      }

      // ========== 倒药飞行：料斗翻转后药片抛向取药仓 ==========
      {
        const dumpState = useDispensingStore.getState();
        const dumps = dumpState.dumpingPills;
        if (dumps.length > 0) {
          const next = dumps.map((p) => ({ ...p, progress: Math.min(1, p.progress + dt / DUMP_FLIGHT) }));
          if (next.every((p) => p.progress >= 1)) {
            const counts: Record<MagazineId, number> = { A: 0, B: 0, C: 0, D: 0 };
            next.forEach((p) => { counts[p.mag] += 1; });
            MAG_IDS.forEach((m) => {
              if (counts[m] > 0) {
                const cur = useDispensingStore.getState();
                cur.setBinPills(m, cur.binPills[m] + counts[m]);
              }
            });
            useDispensingStore.getState().setDumpingPills([]);
          } else {
            useDispensingStore.getState().setDumpingPills(next);
          }
        } else if (r.dumpStarted) {
          // 药片全部落入取药仓（或本轮无药）：收尾并回位
          r.dumpStarted = false;
          const cur = useDispensingStore.getState();
          cur.setLamp('green', false);
          cur.setLamp('yellow', true); // 请取药
          cur.setTiltCyl(false, cur.tiltCyl.angle); // 驱动 angle 回到 0
          useDispensingStore.setState({ autoPhase: 'returning' });
        }
      }

      // ========== 演示（auto）流程状态机 ==========

      // 启动上升沿 → 快照配方生成队列
      const startPressed = s.buttons.start && !r.prevStart;
      r.prevStart = s.buttons.start;

      // 急停在任意阶段立即停止，并清掉所有在途药片
      if (s.buttons.estop) {
        useDispensingStore.setState({
          motorFwd: false,
          motorRev: false,
          targetX: null,
          pendingPills: [],
          dumpingPills: [],
          sendCyl: {
            A: { extended: false, position: 0 }, B: { extended: false, position: 0 },
            C: { extended: false, position: 0 }, D: { extended: false, position: 0 },
          },
          tiltCyl: { tilted: false, angle: s.tiltCyl.angle },
          dispensed: { A: false, B: false, C: false, D: false },
          autoPhase: 'idle',
        });
        r.pillFlying = false;
        r.dumpStarted = false;
        raf = requestAnimationFrame(tick);
        return;
      }

      const st = useDispensingStore.getState();

      // 停止按钮 → 暂停：停电机、清目标（保持位置）
      if (s.buttons.stop && st.autoPhase !== 'idle') {
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
          r.queue = MAG_IDS.filter((m) => recipe[m] > 0);
          r.queueIndex = 0;
          r.dumpStarted = false;
          r.pillFlying = false;
          useDispensingStore.setState({
            dispensed: { A: false, B: false, C: false, D: false },
            autoPhase: 'travel',
          });
        }
      } else if (st.autoPhase === 'travel') {
        // 决定目标（接药位：料斗在滑块 +X 侧，停靠 = 药仓 X - 料斗偏移；取药位 = 行程终点）
        const target = r.queueIndex < r.queue.length
          ? MAGAZINE_X[r.queue[r.queueIndex]] - HOPPER_OFFSET_X
          : SLIDER_MAX_X;
        const cur = st.sliderX;
        const delta = target - cur;
        if (Math.abs(delta) <= arriveTol(dt)) {
          // 到达：精确落到接药位 / 放药位，避免高速度低帧率下越过目标
          useDispensingStore.getState().setSliderX(target);
          useDispensingStore.setState({ motorFwd: false, motorRev: false, targetX: null });
          if (r.queueIndex < r.queue.length) {
            const mag = r.queue[r.queueIndex];
            if (st.magStock[mag] <= 0) {
              // 空仓：红灯闪烁提示 + 自动补药
              r.flashTimer = EMPTY_FLASH;
            }
            useDispensingStore.setState({ autoPhase: 'dosing', dosingMag: mag, dosingRemain: st.recipe[mag] });
          } else {
            // 取完药、跑到放药位 → 翻转倒药（设 tilted=true 让动画段驱动 angle → 1）
            useDispensingStore.getState().setTiltCyl(true, st.tiltCyl.angle);
            useDispensingStore.setState({ autoPhase: 'tilt' });
          }
        } else {
          const fwd = delta > 0;
          useDispensingStore.setState({ motorFwd: fwd, motorRev: !fwd });
        }
      } else if (st.autoPhase === 'dosing') {
        const mag = st.dosingMag;
        if (!mag) { useDispensingStore.setState({ autoPhase: 'travel' }); raf = requestAnimationFrame(tick); return; }

        // 空仓闪烁 + 自动补药（闪烁期间不动作）
        if (r.flashTimer > 0) {
          r.flashTimer -= dt;
          const on = Math.floor(r.flashTimer * 6) % 2 === 0;
          st.setLamp('red', on);
          if (r.flashTimer <= 0) {
            st.setLamp('red', false);
            useDispensingStore.getState().setMagStock(mag, MAG_CAPACITY);
          }
          raf = requestAnimationFrame(tick);
          return;
        }

        const cyl = st.sendCyl[mag];
        /**
         * 每份药必须走完整的「伸缸 → 顶出最底一片 → 缩缸」循环。
         * 「伸到位出药 / 扣库存 / 递减份数 / 立即缩缸」统一在气缸动画后的上升沿事件里，
         * 这里只负责发起伸缸与份数完成后切换目标，避免手动与自动各写一套。
         */
        if (st.dosingRemain <= 0 && !r.pillFlying && cyl.position <= 0.001) {
          r.queueIndex += 1;
          useDispensingStore.setState({ dosingMag: null, dosingRemain: 0, autoPhase: 'travel' });
        } else if (
          st.dosingRemain > 0 && !r.pillFlying
          && !cyl.extended && cyl.position <= 0.001
        ) {
          useDispensingStore.getState().setSendCyl(mag, true, 0);
        }
        // 其余帧：等待伸缸/缩缸动画到位
      } else if (st.autoPhase === 'tilt') {
        // 翻转到位：把斗内药片按来源转成抛落动画（上方动画段负责推进 progress 与收尾）
        if (st.tiltCyl.angle >= 0.999 && !r.dumpStarted) {
          r.dumpStarted = true;
          const pills: PendingPill[] = [];
          MAG_IDS.forEach((m) => {
            const n = Math.min(st.hopperStock[m], 12);
            for (let i = 0; i < n; i += 1) {
              pills.push({ id: `dump_${Date.now()}_${m}_${i}`, mag: m, progress: 0 });
            }
          });
          // 兜底：料斗计数有值但来源缺失时（例如外部写入状态）按 A 色补齐
          if (pills.length === 0 && st.hopperPills > 0) {
            for (let i = 0; i < Math.min(st.hopperPills, 12); i += 1) {
              pills.push({ id: `dump_${Date.now()}_A_${i}`, mag: 'A', progress: 0 });
            }
          }
          const shown = pills.slice(0, 12);
          if (shown.length > 0) useDispensingStore.getState().setDumpingPills(shown);
          useDispensingStore.getState().clearHopper();
        }
      } else if (st.autoPhase === 'returning') {
        // 归位翻转 + 回程：手动动画段驱动 angle → 0，此处检测回位后启动回程电机
        const t = st.tiltCyl;
        if (t.angle > 0.001) {
          // 翻转缸尚未回位，等待动画
          raf = requestAnimationFrame(tick);
          return;
        }
        const delta = SLIDER_MIN_X - st.sliderX;
        if (Math.abs(delta) <= arriveTol(dt)) {
          useDispensingStore.getState().setSliderX(SLIDER_MIN_X);
          // 进入等待前先清掉上一轮残留的确认电平，否则会立刻自动开跑下一轮
          useDispensingStore.getState().setButton('confirm', false);
          useDispensingStore.setState({ motorFwd: false, motorRev: false, targetX: null, autoPhase: 'wait_confirm' });
        } else {
          // 与 travel 段保持同一符号约定：delta>0 → 正转(+X)，delta<0 → 反转(-X)
          useDispensingStore.setState({ motorFwd: delta > 0, motorRev: delta < 0 });
        }
      } else if (st.autoPhase === 'wait_confirm') {
        /**
         * 取药确认是「一次性脉冲」而不是锁存电平。
         * 旧版用 prevConfirm 上升沿判断，但演示面板 / 3D 按钮箱按下后 buttons.confirm
         * 永远保持 true，且 prevConfirm 只在本分支更新：第一次确认后再无上升沿，
         * 于是第二遍倒药结束后永远卡在 wait_confirm（用户反馈「第二次取药确认没反应」）。
         * 现在由状态机消费后立即复位按钮，每轮都能重新按键触发；进入本阶段时
         * 已在 returning 段清掉残留电平，不会自动连跑。
         */
        if (st.buttons.confirm) {
          const cur = useDispensingStore.getState();
          cur.setButton('confirm', false); // 先消费，避免同帧重复进入
          cur.clearBin();
          cur.setLamp('yellow', false);
          cur.setLamp('green', true);
          cur.bumpCycle();
          // 下一轮：与首次启动一致地重置队列 / 出药锁 / 倒药标志，同一配方重跑
          r.queue = MAG_IDS.filter((m) => st.recipe[m] > 0);
          r.queueIndex = 0;
          r.dumpStarted = false;
          r.pillFlying = false;
          useDispensingStore.setState({
            dispensed: { A: false, B: false, C: false, D: false },
            autoPhase: 'travel',
          });
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
