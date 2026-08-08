import { useEffect, useRef } from 'react';
import { useBeltStore } from '../useBeltStore';
import { MAX_MATERIALS } from '../constants';

/**
 * 自动投料循环（与面板挂载解耦）
 * 监听 store 的 autoFeed / autoFeedInterval，无需手动模式面板即可工作（演示/仿真共用）
 */
export function useAutoFeedLoop() {
  const autoFeed = useBeltStore((s) => s.autoFeed);
  const interval = useBeltStore((s) => s.autoFeedInterval);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (autoFeed) {
      timerRef.current = setInterval(() => {
        const state = useBeltStore.getState();
        // 自动投料条件：开启自动、未满、1号皮带正在运行
        if (state.materials.length < MAX_MATERIALS && state.belts.belt1?.running) {
          state.spawnMaterial();
        }
      }, Math.max(0.2, interval) * 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoFeed, interval]);
}
