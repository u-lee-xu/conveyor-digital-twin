import { describe, it, expect, beforeEach } from 'vitest';
import { useDeviceStore } from './useDeviceStore';

describe('useDeviceStore', () => {
  beforeEach(() => {
    useDeviceStore.getState().reset();
  });

  it('应该能够启动和停止传送带', () => {
    const { startConveyor, stopConveyor } = useDeviceStore.getState();
    
    startConveyor();
    expect(useDeviceStore.getState().conveyorRunning).toBe(true);
    
    stopConveyor();
    expect(useDeviceStore.getState().conveyorRunning).toBe(false);
  });

  it('应该能够产生新物料', () => {
    const { spawnMaterial } = useDeviceStore.getState();
    
    spawnMaterial();
    const state = useDeviceStore.getState();
    expect(state.material.visible).toBe(true);
    expect(['blue', 'black']).toContain(state.material.color);
  });

  it('应该能够设置传感器状态', () => {
    const { setSensor } = useDeviceStore.getState();
    
    setSensor('feed', true);
    expect(useDeviceStore.getState().sensors.feed).toBe(true);
  });
});
