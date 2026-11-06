import { useEffect } from 'react';
import { useConveyorScoring } from '../hooks/useConveyorScoring';
import { useDeviceStore } from '../stores';

export function ConveyorDeviceEffects() {
  useConveyorScoring();

  useEffect(() => {
    // 生产构建默认不暴露调试接口；CDP 验收时用 ?debug=1 显式打开
    const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;
    (window as unknown as { __DEBUG__: unknown }).__DEBUG__ = {
      getState: useDeviceStore.getState,
      setState: useDeviceStore.setState,
      spawnMaterial: () => { useDeviceStore.getState().spawnMaterial(); },
      clearMaterial: () => { useDeviceStore.getState().clearMaterial(); },
    };
    return () => { delete (window as unknown as { __DEBUG__?: unknown }).__DEBUG__; };
  }, []);

  return null;
}
