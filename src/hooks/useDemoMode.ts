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
  const timeoutsRef = useRef<number[]>([]);
  const rafsRef = useRef<number[]>([]);

  const addTimeout = useCallback((cb: () => void, ms: number) => {
    const id = window.setTimeout(cb, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const addRAF = useCallback((cb: () => void) => {
    const id = window.requestAnimationFrame(cb);
    rafsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const id of timeoutsRef.current) {
      clearTimeout(id);
    }
    timeoutsRef.current = [];

    for (const id of rafsRef.current) {
      cancelAnimationFrame(id);
    }
    rafsRef.current = [];
  }, []);

  const delay = useCallback(async (ms: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const onAbort = () => { reject(new DemoAbortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });

      const tid = addTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) { reject(new DemoAbortError()); return; }
        const idx = timeoutsRef.current.indexOf(tid);
        if (idx !== -1) timeoutsRef.current.splice(idx, 1);
        resolve();
      }, ms);
    });
  }, [addTimeout]);

  const delayWhilePaused = useCallback(async () => {
    while (pausedRef.current) {
      await delay(100);
    }
  }, [delay]);

  const waitForMaterialPosition = useCallback(async (targetX: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const activeRafs: number[] = [];
      
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        activeRafs.forEach(id => {
          cancelAnimationFrame(id);
          const idx = rafsRef.current.indexOf(id);
          if (idx !== -1) rafsRef.current.splice(idx, 1);
        });
        activeRafs.length = 0;
      };

      const onAbort = () => {
        cleanup();
        reject(new DemoAbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (signal?.aborted) { return; }
        if (pausedRef.current) { 
          const id = addRAF(check);
          activeRafs.push(id);
          return; 
        }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          cleanup();
          resolve();
          return;
        }

        if (currentMaterial.position[0] >= targetX) {
          cleanup();
          resolve();
        } else {
          const id = addRAF(check);
          activeRafs.push(id);
        }
      };
      check();
    });
  }, [addRAF]);

  const waitForMaterialZ = useCallback(async (targetZ: number) => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const activeRafs: number[] = [];
      
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        activeRafs.forEach(id => {
          cancelAnimationFrame(id);
          const idx = rafsRef.current.indexOf(id);
          if (idx !== -1) rafsRef.current.splice(idx, 1);
        });
        activeRafs.length = 0;
      };

      const onAbort = () => {
        cleanup();
        reject(new DemoAbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (signal?.aborted) { return; }
        if (pausedRef.current) { 
          const id = addRAF(check);
          activeRafs.push(id);
          return; 
        }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          cleanup();
          resolve();
          return;
        }

        if (currentMaterial.position[2] <= targetZ) {
          cleanup();
          resolve();
        } else {
          const id = addRAF(check);
          activeRafs.push(id);
        }
      };
      check();
    });
  }, [addRAF]);

  const waitForMaterialCleared = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) { reject(new DemoAbortError()); return; }

      const activeRafs: number[] = [];
      
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        activeRafs.forEach(id => {
          cancelAnimationFrame(id);
          const idx = rafsRef.current.indexOf(id);
          if (idx !== -1) rafsRef.current.splice(idx, 1);
        });
        activeRafs.length = 0;
      };

      const onAbort = () => {
        cleanup();
        reject(new DemoAbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (signal?.aborted) { return; }
        if (pausedRef.current) { 
          const id = addRAF(check);
          activeRafs.push(id);
          return; 
        }

        const currentMaterial = useDeviceStore.getState().material;
        if (!currentMaterial.visible) {
          cleanup();
          resolve();
        } else {
          const id = addRAF(check);
          activeRafs.push(id);
        }
      };
      check();
    });
  }, [addRAF]);

  const startDemo = useCallback(async () => {
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const color = Math.random() > 0.5 ? 'blue' : 'black';
      materialColorRef.current = color;

      setDemoState('SPAWN');
      useDeviceStore.getState().spawnMaterial();
      useDeviceStore.setState(state => ({
        material: { ...state.material, color }
      }));

      await delay(1000);
      await delayWhilePaused();
      if (ac.signal.aborted) return;

      setDemoState('FEEDING');
      extendCylinder('feed');

      await waitForMaterialZ(0.05);
      await delay(200);
      await delayWhilePaused();
      if (ac.signal.aborted) return;

      setDemoState('FEED_RETRACT');
      retractCylinder('feed');
      await delay(500);
      await delayWhilePaused();
      if (ac.signal.aborted) return;

      setDemoState('TRANSIT');
      startConveyor();

      const isBlack = materialColorRef.current === 'black';
      const targetStopX = isBlack ? CYLINDERS.sorting1 : CYLINDERS.sorting2;

      await waitForMaterialPosition(SENSORS.color - 0.05);
      await delay(100);
      await delayWhilePaused();
      if (ac.signal.aborted) return;

      await waitForMaterialPosition(targetStopX);
      if (ac.signal.aborted) return;

      stopConveyor();
      await delay(100);
      await delayWhilePaused();
      if (ac.signal.aborted) return;

      if (isBlack) {
        setDemoState('SORTING1');
        extendCylinder('sorting1');

        await waitForMaterialCleared();
        if (ac.signal.aborted) return;

        setDemoState('SORTING1_RETRACT');
        retractCylinder('sorting1');
        await delay(500);
      } else {
        setDemoState('SORTING2');
        extendCylinder('sorting2');

        await waitForMaterialCleared();
        if (ac.signal.aborted) return;

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
  }, [delay, delayWhilePaused, extendCylinder, retractCylinder, startConveyor, stopConveyor, waitForMaterialPosition, waitForMaterialZ, waitForMaterialCleared]);

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
      clearAllTimers();
      return;
    }

    const runLoop = async () => {
      if (loopRunningRef.current) return;
      loopRunningRef.current = true;

      try {
        while (useDeviceStore.getState().mode === 'auto') {
          if (!startedRef.current) {
            await delay(200);
            continue;
          }
          if (pausedRef.current) {
            await delay(200);
            continue;
          }

          await startDemo();

          if (!startedRef.current) continue;

          await delay(2000);
        }
      } catch (e) {
        if (!(e instanceof DemoAbortError)) {
          console.error('[DemoMode] runLoop error:', e);
        }
      } finally {
        loopRunningRef.current = false;
      }
    };

    runLoop();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      loopRunningRef.current = false;
      clearAllTimers();
    };
  }, [mode]); // ❗️ 只依赖 mode，不能依赖 startDemo！

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
    clearAllTimers();
    loopRunningRef.current = false;

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
  }, [clearAllTimers]);

  return {
    state: demoState,
    startDemoMode,
    isStarted,
    isPaused,
    togglePause,
    resetDemo,
  };
}
