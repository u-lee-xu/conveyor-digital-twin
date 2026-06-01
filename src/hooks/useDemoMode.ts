import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeviceStore } from '../stores';
import { SENSORS, CYLINDERS } from '../components/scene/shared';

type DemoState =
  | 'IDLE'
  | 'SPAWN'
  | 'FEEDING'
  | 'FEED_RETRACT'
  | 'TRANSIT'
  | 'SORTING1'
  | 'SORTING1_RETRACT'
  | 'SORTING2'
  | 'SORTING2_RETRACT'
  | 'COMPLETE';

class DemoAbortError extends Error {}

export function useDemoMode() {
  const mode = useDeviceStore((state) => state.mode);
  const extendCylinder = useDeviceStore((state) => state.extendCylinder);
  const retractCylinder = useDeviceStore((state) => state.retractCylinder);
  const startConveyor = useDeviceStore((state) => state.startConveyor);
  const stopConveyor = useDeviceStore((state) => state.stopConveyor);

  const [demoState, setDemoState] = useState<DemoState>('IDLE');
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const startedRef = useRef(false);
  const [isStarted, setIsStarted] = useState(false);
  const materialColorRef = useRef<'blue' | 'black'>('blue');
  const loopRunningRef = useRef(false);

  const checkAbort = useCallback(() => {
    if (abortRef.current?.signal.aborted) throw new DemoAbortError();
  }, []);

  const delay = useCallback(async (ms: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const onAbort = () => { clearTimeout(tid); reject(new DemoAbortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });

      const tid = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) { reject(new DemoAbortError()); return; }
        resolve();
      }, ms);
    });
  }, []);

  const delayWhilePaused = useCallback(async () => {
    while (pausedRef.current) {
      await delay(100);
    }
  }, [delay]);

  const waitForMaterialPosition = useCallback(async (targetX: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const onAbort = () => { cancelAnimationFrame(rafId); reject(new DemoAbortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });

      let rafId = 0;
      const check = () => {
        if (signal?.aborted) { reject(new DemoAbortError()); return; }
        if (pausedRef.current) { rafId = requestAnimationFrame(check); return; }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
          return;
        }

        if (currentMaterial.position[0] >= targetX) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        } else {
          rafId = requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  const waitForMaterialZ = useCallback(async (targetZ: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const onAbort = () => { cancelAnimationFrame(rafId); reject(new DemoAbortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });

      let rafId = 0;
      const check = () => {
        if (signal?.aborted) { reject(new DemoAbortError()); return; }
        if (pausedRef.current) { rafId = requestAnimationFrame(check); return; }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
          return;
        }

        if (currentMaterial.position[2] <= targetZ) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        } else {
          rafId = requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  const waitForMaterialCleared = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const onAbort = () => { cancelAnimationFrame(rafId); reject(new DemoAbortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });

      let rafId = 0;
      const check = () => {
        if (signal?.aborted) { reject(new DemoAbortError()); return; }
        if (pausedRef.current) { rafId = requestAnimationFrame(check); return; }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        } else {
          rafId = requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  const startDemo = useCallback(async () => {
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      checkAbort();
      const color = Math.random() > 0.5 ? 'blue' : 'black';
      materialColorRef.current = color;

      setDemoState('SPAWN');
      useDeviceStore.getState().spawnMaterial();
      useDeviceStore.setState(state => ({
        material: { ...state.material, color }
      }));

      await delay(1000);
      await delayWhilePaused();

      setDemoState('FEEDING');
      extendCylinder('feed');

      await waitForMaterialZ(0.05);
      await delay(200);
      await delayWhilePaused();

      setDemoState('FEED_RETRACT');
      retractCylinder('feed');
      await delay(500);
      await delayWhilePaused();

      setDemoState('TRANSIT');
      startConveyor();

      const isBlack = materialColorRef.current === 'black';
      const targetStopX = isBlack ? CYLINDERS.sorting1 : CYLINDERS.sorting2;

      await waitForMaterialPosition(SENSORS.color - 0.05);
      await delay(100);
      await delayWhilePaused();

      await waitForMaterialPosition(targetStopX);

      stopConveyor();
      await delay(100);
      await delayWhilePaused();

      if (isBlack) {
        setDemoState('SORTING1');
        extendCylinder('sorting1');

        await waitForMaterialCleared();

        setDemoState('SORTING1_RETRACT');
        retractCylinder('sorting1');
        await delay(500);
      } else {
        setDemoState('SORTING2');
        extendCylinder('sorting2');

        await waitForMaterialCleared();

        setDemoState('SORTING2_RETRACT');
        retractCylinder('sorting2');
        await delay(500);
      }

      setDemoState('COMPLETE');
      await delay(1000);

      setDemoState('IDLE');
    } catch (e) {
      if (e instanceof DemoAbortError) return;
      throw e;
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
    }
  }, [checkAbort, delay, delayWhilePaused, extendCylinder, retractCylinder, startConveyor, stopConveyor, waitForMaterialPosition, waitForMaterialZ, waitForMaterialCleared]);

  useEffect(() => {
    if (mode !== 'auto') {
      abortRef.current?.abort();
      abortRef.current = null;
      startedRef.current = false;
      setIsStarted(false);
      pausedRef.current = false;
      setIsPaused(false);
      setDemoState('IDLE');
      loopRunningRef.current = false;
      return;
    }

    const runLoop = async () => {
      if (loopRunningRef.current) return;
      loopRunningRef.current = true;

      while (useDeviceStore.getState().mode === 'auto') {
        if (!startedRef.current) {
          await new Promise<void>(r => window.setTimeout(r, 200));
          continue;
        }
        if (pausedRef.current) {
          await new Promise<void>(r => window.setTimeout(r, 200));
          continue;
        }

        await startDemo();

        if (!startedRef.current) continue;

        await new Promise<void>(r => window.setTimeout(r, 2000));
      }

      loopRunningRef.current = false;
    };

    runLoop();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      loopRunningRef.current = false;
    };
  }, [mode, startDemo]);

  const startDemoMode = useCallback(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      setIsStarted(true);
    }
  }, []);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
    if (pausedRef.current) {
      useDeviceStore.getState().stopConveyor();
    } else {
      if (demoState === 'TRANSIT') {
        useDeviceStore.getState().startConveyor();
      }
    }
  }, [demoState]);

  const resetDemo = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    startedRef.current = false;
    setIsStarted(false);
    pausedRef.current = false;
    setIsPaused(false);

    const state = useDeviceStore.getState();
    state.stopConveyor();
    state.retractCylinder('feed');
    state.retractCylinder('sorting1');
    state.retractCylinder('sorting2');
    state.clearMaterial();
    setDemoState('IDLE');
  }, []);

  return {
    state: demoState,
    startDemoMode,
    isStarted,
    isPaused,
    togglePause,
    resetDemo,
  };
}
