/**
 * 常驻副作用：每帧推进 position 坐标变量斜坡 / 吸取流程 / 演示循环；连接 PLC 时 300ms 轮询寄存器。
 * 观众端不挂载本地推进，位置完全由主控快照镜像驱动（零上行）。
 */
import { useEffect } from 'react';
import { isViewerRuntime, modbusService } from '@digital-twin/shared';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_WORD_VARIABLES, GANTRY_PHASE } from '../constants/gantryVariables';

/** 与 GANTRY_WORD_VARIABLES 同源：连接帧下发的 7 个 uint16 单字一次读回 */
const WORD_NAMES = Object.keys(GANTRY_WORD_VARIABLES);

/** Z 下行的四个阶段：气缸伸出，Z 位置由 PLC 给定直接驱动 */
const DOWN_PHASES: number[] = [
  GANTRY_PHASE.Z_DOWN_PICK, GANTRY_PHASE.VACUUM_ON,
  GANTRY_PHASE.Z_DOWN_PLACE, GANTRY_PHASE.VACUUM_OFF,
];

export function GantryDeviceEffects() {
  useEffect(() => {
    if (isViewerRuntime()) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const delta = Math.min(0.05, (t - last) / 1000);
      last = t;
      const s = useGantryStore.getState();
      s.tick(delta);
      s.advanceDemo();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 仿真模式：连接后按 300ms 读回 :1509 的位置 / 阶段字，写回 position 坐标变量
    const timer = window.setInterval(async () => {
      const st = useGantryStore.getState();
      if (!st.connected) return;
      try {
        const result = await modbusService.readWords(WORD_NAMES);
        if (!result.success || !result.values) return;
        const values = result.values;
        const num = (key: string) => {
          const n = Number(values[key]);
          return Number.isFinite(n) ? n : 0;
        };
        const phase = num('GANTRY_PHASE_W');
        useGantryStore.getState().setPlcFrame({
          xPos: num('GANTRY_X_POS'),
          yPos: num('GANTRY_Y_POS'),
          zPos: num('GANTRY_Z_POS'),
          xTarget: num('GANTRY_X_TGT'),
          yTarget: num('GANTRY_Y_TGT'),
          cylinderDown: DOWN_PHASES.includes(phase),
          vacuum: num('GANTRY_HELD_W') > 0,
        });
      } catch {
        // 断开瞬间的读失败不打断演示
      }
    }, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
