// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useAutoFeedLoop } from './hooks/useAutoFeedLoop';
import { useBeltStore } from './useBeltStore';

/** 挂载真实组件，让 useEffect 生效（模拟 App 顶层挂载） */
function Harness() {
  useAutoFeedLoop();
  return null;
}

describe('useAutoFeedLoop - 自动投料循环', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBeltStore.getState().reset();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    useBeltStore.getState().clearMaterials();
  });

  it('autoFeed 开启且 belt1 运行时按间隔投料（不依赖手动面板挂载）', () => {
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(<Harness />));

    // 模拟演示时序：belt1 运行 + 开启自动投料
    act(() => {
      useBeltStore.getState().setBeltRunning('belt1', true);
      useBeltStore.getState().setAutoFeed(true);
    });

    act(() => {
      vi.advanceTimersByTime(4500);
    });

    const materials = useBeltStore.getState().materials;
    expect(materials.length).toBe(2);
    expect(materials[0].onBelt).toBe('belt1');

    act(() => root.unmount());
  });

  it('autoFeed 关闭后停止投料', () => {
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(<Harness />));

    act(() => {
      useBeltStore.getState().setBeltRunning('belt1', true);
      useBeltStore.getState().setAutoFeed(true);
    });
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(useBeltStore.getState().materials.length).toBe(1);

    act(() => {
      useBeltStore.getState().setAutoFeed(false);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useBeltStore.getState().materials.length).toBe(1);

    act(() => root.unmount());
  });

  it('belt1 停止时投料挂起', () => {
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(<Harness />));

    act(() => {
      useBeltStore.getState().setAutoFeed(true);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(useBeltStore.getState().materials.length).toBe(0);

    act(() => root.unmount());
  });
});
