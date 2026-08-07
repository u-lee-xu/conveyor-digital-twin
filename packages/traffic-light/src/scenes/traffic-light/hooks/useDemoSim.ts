import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useTrafficStore, type LampKey } from '../useTrafficStore';
import { cycleDuration, dirDuration, type DirectionTiming } from '../constants';

/**
 * 交通灯 - 演示模式参考程序（内置，无 PLC）
 *
 * 时序（教师参数可调，两方向独立设定，默认 东西/南北 各 绿稳5/绿闪3/黄2）：
 *   东西：绿稳 → 绿闪(1Hz) → 黄 → 红(自动 = 南北绿稳+绿闪+黄) → 循环
 *   南北：红(自动 = 东西绿稳+绿闪+黄) → 绿稳 → 绿闪 → 黄 → 红 → 循环
 * 停止（语义X）：按停止后完成当前循环（红结束）全部熄灭
 * 急停：立即全部熄灭，复位后再按启动重新开始
 */

type Phase = 'green' | 'flash' | 'yellow' | 'red' | 'off';

function phaseAt(t: number, totalMs: number, offsetMs: number, p: DirectionTiming): Phase {
  const x = (t + offsetMs) % totalMs;
  const gsMs = p.greenSteady * 1000;
  const gfMs = p.greenFlash * 1000;
  const yMs = p.yellow * 1000;
  if (x < gsMs) return 'green';
  if (x < gsMs + gfMs) return 'flash';
  if (x < gsMs + gfMs + yMs) return 'yellow';
  return 'red';
}

function phaseRemaining(t: number, totalMs: number, offsetMs: number, p: DirectionTiming): number {
  const x = (t + offsetMs) % totalMs;
  const gsMs = p.greenSteady * 1000;
  const gfMs = p.greenFlash * 1000;
  const yMs = p.yellow * 1000;
  const bounds = [0, gsMs, gsMs + gfMs, gsMs + gfMs + yMs, totalMs];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (x >= bounds[i] && x < bounds[i + 1]) return bounds[i + 1] - x;
  }
  return 0;
}

export interface DemoSimState {
  running: boolean;
  estop: boolean;
}

const FLASH_PERIOD_MS = 500; // 1Hz 闪烁（亮/灭各 0.5s）

export function useDemoSim() {
  const [state, setState] = useState<DemoSimState>({ running: false, estop: false });
  const cycleStartRef = useRef(0);
  const stopAtCycleRef = useRef(-1);
  const tickRef = useRef(0);

  useEffect(() => {
    const store = useAppStore.getState();
    if (!state.running) {
      store.setDemoRunning(false);
      store.setDemoPhase('待机');
      store.setDemoCountdown(0, 0);
      return;
    }

    store.setDemoRunning(true);
    store.setDemoPhase('运行中');
    const timer = setInterval(() => {
      const traffic = useTrafficStore.getState();
      const timing = traffic.timing;
      // 周期 = 东西(绿+闪+黄) + 南北(绿+闪+黄)；红由对方方向派生
      const totalMs = cycleDuration(timing) * 1000;
      const ewSeqMs = dirDuration(timing.ew) * 1000;
      const elapsed = Date.now() - cycleStartRef.current;
      const cycleIndex = Math.floor(elapsed / totalMs);
      const ewOffset = 0;
      const nsOffset = ewSeqMs;

      // 停止语义：完成当前循环后全灭
      if (stopAtCycleRef.current >= 0 && cycleIndex >= stopAtCycleRef.current) {
        traffic.allLampsOff();
        stopAtCycleRef.current = -1;
        setState((s) => ({ ...s, running: false }));
        return;
      }

      const flashOn = Math.floor(elapsed / FLASH_PERIOD_MS) % 2 === 0;

      const ewPhase = phaseAt(elapsed, totalMs, ewOffset, timing.ew);
      const nsPhase = phaseAt(elapsed, totalMs, nsOffset, timing.ns);

      const lamps: Partial<Record<LampKey, boolean>> = {
        ew_red: ewPhase === 'red',
        ew_yellow: ewPhase === 'yellow',
        ew_green: ewPhase === 'green' || (ewPhase === 'flash' && flashOn),
        ns_red: nsPhase === 'red',
        ns_yellow: nsPhase === 'yellow',
        ns_green: nsPhase === 'green' || (nsPhase === 'flash' && flashOn),
      };
      traffic.setLamps(lamps);

      // 相位文本 + 倒计时（两方向独立计时）
      const ewLeft = phaseRemaining(elapsed, totalMs, ewOffset, timing.ew);
      const nsLeft = phaseRemaining(elapsed, totalMs, nsOffset, timing.ns);
      const ewLabel = ewPhase === 'green' ? '东西绿灯' : ewPhase === 'flash' ? '东西绿闪' : ewPhase === 'yellow' ? '东西黄灯' : '东西红灯';
      const nsLabel = nsPhase === 'green' ? '南北绿灯' : nsPhase === 'flash' ? '南北绿闪' : nsPhase === 'yellow' ? '南北黄灯' : '南北红灯';
      useAppStore.getState().setDemoPhase(`${ewLabel} · ${nsLabel}`);
      useAppStore.getState().setDemoCountdown(Math.max(0, Math.ceil(ewLeft / 1000)), Math.max(0, Math.ceil(nsLeft / 1000)));
      tickRef.current++;
    }, 100);
    return () => clearInterval(timer);
  }, [state.running]);

  const start = useCallback(() => {
    useAppStore.getState().setDemoEStop(false);
    const store = useTrafficStore.getState();
    store.resetAll();
    cycleStartRef.current = Date.now();
    stopAtCycleRef.current = -1;
    setState({ running: true, estop: false });
  }, []);

  const stop = useCallback(() => {
    const traffic = useTrafficStore.getState();
    const totalMs = cycleDuration(traffic.timing) * 1000;
    const elapsed = Date.now() - cycleStartRef.current;
    stopAtCycleRef.current = Math.floor(elapsed / totalMs) + 1;
  }, []);

  const estop = useCallback(() => {
    useTrafficStore.getState().allLampsOff();
    useAppStore.getState().setDemoEStop(true);
    setState({ running: false, estop: true });
  }, []);

  const reset = useCallback(() => {
    useAppStore.getState().setDemoEStop(false);
    setState((s) => ({ ...s, estop: false }));
  }, []);

  return { ...state, start, stop, estop, reset };
}

export default useDemoSim;
