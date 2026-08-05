import { useEffect } from 'react';
import { useConveyorScoring } from '../hooks/useConveyorScoring';
import { useDeviceStore } from '../stores';

export function ConveyorDeviceEffects() {
  useConveyorScoring();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __DEBUG__: unknown }).__DEBUG__ = {
      getState: useDeviceStore.getState,
      setState: useDeviceStore.setState,
      spawnMaterial: () => { useDeviceStore.getState().spawnMaterial(); },
      clearMaterial: () => { useDeviceStore.getState().clearMaterial(); },
    };
  }, []);

  return null;
}
