/**
 * 常驻副作用：每帧推进转速 / 位移 / 热累积与演示状态机；仿真连接时 300ms
 * 读回 PLC 的 KM1 / KM2 / FR 复位线圈与显式动作字，并把位移双字、过程量单字
 * 与 14 路开关量回写 PLC。
 *
 * 观众端不挂载本地推进、不写 PLC。手动 / 演示模式 connected=false，整个通信分支零帧。
 */
import { useEffect } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import {
  MOTOR_REPORT_WORD_NAMES, MOTOR_COMMAND_WORD_NAMES, MOTOR_OUTPUT_COIL_NAMES,
  MOTOR_OUTPUT_COIL_BASE, MOTOR_OUTPUT_COIL_COUNT, MOTOR_SENSOR_FEEDBACK_BASE,
  MOTOR_SENSOR_VAR_NAMES, motorSensorBits, motorSensorMask,
} from '../constants/motorVariables';
import {
  useMotorStore, motorFeedbackOf, motorPlcWords,
} from '../stores/useMotorStore';

export function MotorDeviceEffects() {
  useEffect(() => {
    if (isViewerRuntime()) return;
    /** 上一次成功写回 PLC 的开关量掩码；-1 表示连接后必先写一次全状态 */
    let lastSensorMask = -1;
    /** 上一次成功写回的位移，静止时不重复发双字帧 */
    let lastDisplacement = Number.NaN;
    /** 300ms 轮询 in-flight 守卫，避免帧交错 */
    let busy = false;
    let stopped = false;
    let raf = 0;
    let last = performance.now();

    const loop = (t: number) => {
      const delta = (t - last) / 1000;
      last = t;
      useMotorStore.getState().tick(delta);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const poll = async () => {
      const st = useMotorStore.getState();
      if (!st.connected) {
        lastSensorMask = -1;
        lastDisplacement = Number.NaN;
        return;
      }
      if (stopped) return;
      try {
        /* 1) PLC → 设备：显式动作字 + 两只接触器线圈 + FR 复位线圈 */
        const words = await modbusService.readWords([...MOTOR_COMMAND_WORD_NAMES]);
        if (stopped) return;
        if (!words.success || !words.values) return;
        const actionWord = words.values.MOTOR_ACTION_W;
        let km1: boolean | undefined;
        let km2: boolean | undefined;
        let reset: boolean | undefined;
        if (modbusService.getProtocol() === 'modbus') {
          const coils = await modbusService.readCoils(MOTOR_OUTPUT_COIL_BASE, MOTOR_OUTPUT_COIL_COUNT);
          if (stopped) return;
          if (coils.success && coils.values) {
            km1 = !!coils.values[0];
            km2 = !!coils.values[1];
            reset = !!coils.values[2];
          }
        } else {
          const vars = await modbusService.readVars([...MOTOR_OUTPUT_COIL_NAMES]);
          if (stopped) return;
          if (vars.success && vars.values) {
            km1 = !!vars.values.MOTOR_KM1;
            km2 = !!vars.values.MOTOR_KM2;
            reset = !!vars.values.MOTOR_FR_RESET;
          }
        }
        useMotorStore.getState().setPlcFrame({
          km1, km2, reset,
          actionWord: typeof actionWord === 'number' && Number.isFinite(actionWord) ? actionWord : undefined,
        });

        /* 2) 设备 → PLC：位移 32 位 DINT 双字单帧原子写，低字在前 */
        const s = useMotorStore.getState();
        const displacement = Math.trunc(s.beltDisplacement);
        if (displacement !== lastDisplacement) {
          const wrote = await modbusService.writeWords(['MOTOR_DISPLACEMENT'], [displacement]);
          if (stopped) return;
          if (wrote.success) lastDisplacement = displacement;
        }

        /* 3) 设备 → PLC：转速 / 电流 / 热累积 / 阶段 / 掩码，单字按缩放上报 */
        const w = motorPlcWords();
        await modbusService.writeWords([...MOTOR_REPORT_WORD_NAMES], [
          w.MOTOR_SPEED_RPM,
          w.MOTOR_CURRENT_A,
          w.MOTOR_THERMAL,
          w.MOTOR_PHASE_W,
          w.MOTOR_SENSOR_MASK,
        ]);
        if (stopped) return;

        /* 4) 开关量反馈：位掩码变化才发帧；写失败不更新掩码，下一轮自动重试 */
        const feedback = motorFeedbackOf(s);
        const mask = motorSensorMask(feedback);
        if (mask !== lastSensorMask) {
          const bits = motorSensorBits(feedback);
          const write = modbusService.getProtocol() === 'modbus'
            ? await modbusService.writeCoils(MOTOR_SENSOR_FEEDBACK_BASE, bits)
            : await modbusService.writeVars(MOTOR_SENSOR_VAR_NAMES, bits);
          if (stopped) return;
          if (write.success) lastSensorMask = mask;
        }
      } catch {
        // 断开瞬间的读写失败不打断本地推进
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
