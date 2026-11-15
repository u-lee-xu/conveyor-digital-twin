/**
 * 常驻副作用：每帧推进 position 坐标变量斜坡 / 吸取流程 / 演示循环；
 * 连接 PLC 时 300ms 读回寄存器，并把按 position 派生的 6 路接近开关回写 PLC。
 * 观众端不挂载本地推进、不写 PLC（只读零上行）。
 */
import { useEffect } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { useGantryStore } from '../stores/useGantryStore';
import {
  GANTRY_WORD_VARIABLES, GANTRY_PHASE, GANTRY_COILS,
  GANTRY_SENSOR_FEEDBACK, gantrySensorBits,
} from '../constants/gantryVariables';

/** 与 GANTRY_WORD_VARIABLES 同源：连接帧下发的 9 个 uint16 单字一次读回 */
const WORD_NAMES = Object.keys(GANTRY_WORD_VARIABLES);

/** 传感器反馈：Modbus TCP 写 C9~14；S7 / 三菱按变量名写 M40.1~ / X1~ */
const SENSOR_COIL_BASE = GANTRY_COILS.GANTRY_SENSOR_ORIGIN;
const SENSOR_VAR_NAMES: string[] = GANTRY_SENSOR_FEEDBACK.map((r) => r.key);

/** Z 下行的四个阶段：气缸伸出，Z 位置由 PLC 给定直接驱动 */
const DOWN_PHASES: number[] = [
  GANTRY_PHASE.Z_DOWN_PICK, GANTRY_PHASE.VACUUM_ON,
  GANTRY_PHASE.Z_DOWN_PLACE, GANTRY_PHASE.VACUUM_OFF,
];

export function GantryDeviceEffects() {
  useEffect(() => {
    if (isViewerRuntime()) return;
    /** 上一次成功写回 PLC 的传感器位掩码；-1 表示尚未写过（连接后必先写一次全状态） */
    let lastSensorMask = -1;
    /** 300ms 轮询的 in-flight 守卫：一次读慢于间隔时不重入，避免帧交错 */
    let busy = false;
    /** 卸载 / 切模式后，在途 await 返回时不再写 store、不再发帧 */
    let stopped = false;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const delta = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      const s = useGantryStore.getState();
      s.tick(delta);
      s.advanceDemo();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const poll = async () => {
      const st = useGantryStore.getState();
      if (!st.connected) { lastSensorMask = -1; return; }
      if (stopped) return;
      try {
        const result = await modbusService.readWords(WORD_NAMES);
        if (stopped) return;
        // 读失败整轮跳过；缺字段保持上次值，绝不用 0 兜底把位置拉回原点
        if (!result.success || !result.values) return;
        const values = result.values;
        const num = (key: string): number | undefined => {
          const raw = values[key];
          if (raw === undefined) return undefined;
          const n = Number(raw);
          return Number.isFinite(n) ? n : undefined;
        };
        const phase = num('GANTRY_PHASE_W');
        const held = num('GANTRY_HELD_W');
        useGantryStore.getState().setPlcFrame({
          xPos: num('GANTRY_X_POS'),
          yPos: num('GANTRY_Y_POS'),
          zPos: num('GANTRY_Z_POS'),
          xTarget: num('GANTRY_X_TGT'),
          yTarget: num('GANTRY_Y_TGT'),
          cylinderDown: phase === undefined ? undefined : DOWN_PHASES.includes(phase),
          vacuum: held === undefined ? undefined : held > 0,
          pickCell: num('GANTRY_PICK_CELL'),
          placeCell: num('GANTRY_PLACE_CELL'),
        });

        // 设备 → PLC：6 路接近开关由 position 派生后写回 PLC 输入映像区，
        // 让 PLC 程序能像读真实 I/O 一样做回原点 / 限位联锁。只在状态变化时发帧，
        // 避免每 300ms 刷 FC15 与读帧争用事务链；写失败不更新掩码，下一轮自动重试。
        const bits = gantrySensorBits(useGantryStore.getState().sensors);
        const mask = bits.reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
        if (mask === lastSensorMask) return;
        const write = modbusService.getProtocol() === 'modbus'
          ? await modbusService.writeCoils(SENSOR_COIL_BASE, bits)
          : await modbusService.writeVars(SENSOR_VAR_NAMES, bits);
        if (stopped) return;
        if (write.success) lastSensorMask = mask;
      } catch {
        // 断开瞬间的读写失败不打断演示
      }
    };

    const timer = window.setInterval(() => {
      if (busy || stopped) return;
      busy = true;
      void poll().finally(() => { busy = false; });
    }, 300);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
