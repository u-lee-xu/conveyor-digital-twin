import { useEffect, useRef, useState } from 'react';
import { useBeltStore, type BeltName } from '../useBeltStore';

/** 演示步骤 */
export type BeltDemoStep =
  | 'IDLE'         // 待机
  | 'START_UP'     // 依次启动 1#~4# 皮带
  | 'FEEDING'      // 自动投料 + 分拣运行
  | 'STOPPING';    // 停止收尾

export const STEP_LABELS: Record<BeltDemoStep, string> = {
  IDLE: '待机',
  START_UP: '皮带启动',
  FEEDING: '投料分拣',
  STOPPING: '停止收尾',
};

const BELT_SEQUENCE: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
const START_UP_INTERVAL = 800;

interface BeltDemoSimState {
  running: boolean;
  paused: boolean;
  step: BeltDemoStep;
}

/**
 * 煤料分拣自动演示：
 * 清料复位 → 依次启动四条皮带（800ms 间隔）→ 开启自动投料循环分拣
 */
export function useBeltDemoSim() {
  const [state, setState] = useState<BeltDemoSimState>({ running: false, paused: false, step: 'IDLE' });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!state.running || state.paused) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    // 依次启动皮带
    BELT_SEQUENCE.forEach((name, i) => {
      const t = setTimeout(() => {
        useBeltStore.getState().setBeltRunning(name, true);
        if (i === BELT_SEQUENCE.length - 1) {
          useBeltStore.getState().setAutoFeed(true);
          setState((p) => ({ ...p, step: 'FEEDING' }));
        }
      }, i * START_UP_INTERVAL);
      timers.push(t);
    });
    timersRef.current = timers;

    return () => {
      timers.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [state.running, state.paused]);

  const start = () => {
    const s = useBeltStore.getState();
    s.clearMaterials();
    BELT_SEQUENCE.forEach((name) => s.setBeltRunning(name, false));
    s.setAutoFeed(false);
    s.setBuzzer(false);
    setState({ running: true, paused: false, step: 'START_UP' });
  };

  const stop = () => {
    const s = useBeltStore.getState();
    s.setAutoFeed(false);
    BELT_SEQUENCE.forEach((name) => s.setBeltRunning(name, false));
    setState({ running: false, paused: false, step: 'IDLE' });
  };

  const pause = () => setState((p) => (p.running ? { ...p, paused: true } : p));
  const resume = () => setState((p) => (p.running ? { ...p, paused: false } : p));

  return { ...state, start, stop, pause, resume };
}
