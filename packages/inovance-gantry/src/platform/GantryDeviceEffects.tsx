/**
 * 常驻副作用：每帧推进 position 坐标变量斜坡 / 吸取流程 / 演示循环；
 * 连接 PLC 时 300ms 读回寄存器，并把按 position 派生的 6 路接近开关回写 PLC。
 * 观众端不挂载本地推进、不写 PLC（只读零上行）。
 */
import { useEffect } from 'react';
import { isViewerRuntime, modbusService } from '@digital-twin/shared';
import { useGantryStore } from '../stores/useGantryStore';
import {
  GANTRY_WORD_VARIABLES, GANTRY_PHASE, GANTRY_COILS,
  GANTRY_SENSOR_FEEDBACK, gantrySensorBits,
} from '../constants/gantryVariables';

/** 与 GANTRY_WORD_VARIABLES 同源：连接帧下发的 9 个 uint16 单字一次读回 */
const WORD_NAMES = Object.keys(GANTRY_WORD_VARIABLES);

/** 传感器反馈：Modbus TCP 写 C29~34；S7 / 三菱按变量名写 M140.1~ / X1~ */
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

    const timer = window.setInterval(async () => {
      const st = useGantryStore.getState();
      if (!st.connected) { lastSensorMask = -1; return; }
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
        if (write.success) lastSensorMask = mask;
      } catch {
        // 断开瞬间的读写失败不打断演示
      }
    }, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
