/**
 * 常驻副作用：每帧推进 position 坐标变量斜坡与吸取流程状态机。
 * 观众端不挂载本地推进，位置完全由主控快照镜像驱动（零上行）。
 */
import { useEffect } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { useGantryStore } from '../stores/useGantryStore';

export function GantryDeviceEffects() {
  useEffect(() => {
    if (isViewerRuntime()) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const delta = Math.min(0.05, (t - last) / 1000);
      last = t;
      useGantryStore.getState().tick(delta);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
