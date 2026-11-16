/**
 * 常驻副作用：每帧推进流量积分 / 演示状态机；连接 PLC 时 300ms 读回命令字、
 * 执行器线圈与三色灯线圈，并把四罐 32 位 REAL 模拟量 + 3 个状态字 + 8 路液位开关回写 PLC。
 *
 * 操作站 7 个输入点不走本循环的定时写：点动按钮必须即时落帧，
 * 由 liquidOperator.ts 的事件入口写成整块，本循环每轮只做一次去重同步。
 *
 * 观众端不挂载本地推进、不写 PLC（只读零上行）。
 * 本地手动 / 演示模式 connected=false，整个通信分支不发任何帧。
 */
import { useEffect } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { useLiquidStore, liquidRatioA } from '../stores/useLiquidStore';
import {
  LIQUID_COILS, LIQUID_COMMAND_WORD_NAMES, LIQUID_REAL_NAMES, LIQUID_REPORT_WORD_NAMES,
  LIQUID_OUTPUT_COIL_NAMES, LIQUID_LAMP_COIL_NAMES,
  LIQUID_SENSOR_FEEDBACK_BASE, LIQUID_SENSOR_VAR_NAMES,
  liquidSensorBits, liquidSensorMask, LIQUID_PLC_SCALE,
} from '../constants/liquidVariables';
import { floatToDintBits } from '../constants/real32';
import type { Lamps, Outputs } from '../constants/liquidConstants';
import { flushLiquidOperator } from './liquidOperator';

/**
 * 与 LIQUID_OUTPUT_COIL_NAMES 同序：C0~C4 执行器一次读回；基址从变量表派生，改地址不必再动此处。
 * 三色灯紧接执行器占 C5~C7，与执行器共用同一次连续读（C0~C7）。
 */
const OUTPUT_COIL_BASE = LIQUID_COILS.LIQUID_VALVE_A;
const OUTPUT_COIL_COUNT = LIQUID_OUTPUT_COIL_NAMES.length;
const LAMP_COIL_OFFSET = LIQUID_COILS.LIQUID_LAMP_GREEN - OUTPUT_COIL_BASE;
const OUTPUT_BLOCK_COUNT = OUTPUT_COIL_COUNT + LIQUID_LAMP_COIL_NAMES.length;
/** S7 / 三菱按变量名读，执行器与三色灯一起读回 */
const OUTPUT_VAR_NAMES = [...LIQUID_OUTPUT_COIL_NAMES, ...LIQUID_LAMP_COIL_NAMES];

export function LiquidDeviceEffects() {
  useEffect(() => {
    if (isViewerRuntime()) return;
    /** 上一次成功写回 PLC 的开关量掩码；-1 表示尚未写过（连接后必先写一次全状态） */
    let lastSensorMask = -1;
    /** 上一次成功写回的 REAL 位模式；静止时不重复发帧 */
    let lastRealKey = '';
    /** 300ms 轮询的 in-flight 守卫：一次读慢于间隔时不重入，避免帧交错 */
    let busy = false;
    /** 卸载 / 切模式后，在途 await 返回时不再写 store、不再发帧 */
    let stopped = false;
    let raf = 0;
    let last = performance.now();

    const loop = (t: number) => {
      const delta = (t - last) / 1000;
      last = t;
      useLiquidStore.getState().tick(delta);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const poll = async () => {
      const st = useLiquidStore.getState();
      if (!st.connected) {
        lastSensorMask = -1;
        lastRealKey = '';
        return;
      }
      if (stopped) return;
      try {
        /* 1) PLC → 设备：显式动作字 + 配方 / 时长 + 5 个执行器线圈 */
        const words = await modbusService.readWords([...LIQUID_COMMAND_WORD_NAMES]);
        if (stopped) return;
        /**
         * 读失败必须整轮跳过：用 0 兜底会把配方 / 时长清 0，还会把 actionSeq 打回 0，
         * 导致 PLC 补发同 seq 动作字时重复触发 RESET / ESTOP。缺字段保持上次值。
         */
        if (!words.success || !words.values) return;
        const w = words.values;
        const num = (key: string): number | undefined => {
          const raw = w[key];
          if (raw === undefined) return undefined;
          const n = Number(raw);
          return Number.isFinite(n) ? n : undefined;
        };
        let outputs: Partial<Outputs> = {};
        let lamps: Partial<Lamps> = {};
        if (modbusService.getProtocol() === 'modbus') {
          const coils = await modbusService.readCoils(OUTPUT_COIL_BASE, OUTPUT_BLOCK_COUNT);
          if (stopped) return;
          if (coils.success && coils.values) {
            const v = coils.values;
            outputs = {
              valveA: !!v[0], valveB: !!v[1], stirForward: !!v[2],
              stirReverse: !!v[3], discharge: !!v[4],
            };
            lamps = {
              green: !!v[LAMP_COIL_OFFSET],
              yellow: !!v[LAMP_COIL_OFFSET + 1],
              red: !!v[LAMP_COIL_OFFSET + 2],
            };
          }
        } else {
          const vars = await modbusService.readVars(OUTPUT_VAR_NAMES);
          if (stopped) return;
          if (vars.success && vars.values) {
            const v = vars.values;
            outputs = {
              valveA: !!v.LIQUID_VALVE_A, valveB: !!v.LIQUID_VALVE_B,
              stirForward: !!v.LIQUID_STIR_FWD, stirReverse: !!v.LIQUID_STIR_REV,
              discharge: !!v.LIQUID_DISCHARGE,
            };
            lamps = {
              green: !!v.LIQUID_LAMP_GREEN,
              yellow: !!v.LIQUID_LAMP_YELLOW,
              red: !!v.LIQUID_LAMP_RED,
            };
          }
        }
        useLiquidStore.getState().setPlcFrame({
          outputs,
          lamps,
          actionWord: num('LIQUID_ACTION_W'),
          recipeA: num('LIQUID_RECIPE_A'),
          recipeB: num('LIQUID_RECIPE_B'),
          stirForwardSec: num('LIQUID_STIR_FWD_W'),
          stirReverseSec: num('LIQUID_STIR_REV_W'),
        });

        /* 2) 设备 → PLC：四罐 REAL 模拟量（双字单帧原子写，低字在前） */
        const s = useLiquidStore.getState();
        const realBits = [
          floatToDintBits(s.volumes.a),
          floatToDintBits(s.volumes.b),
          floatToDintBits(s.volumes.mix),
          floatToDintBits(s.volumes.product),
        ];
        const realKey = realBits.join(',');
        if (realKey !== lastRealKey) {
          const wrote = await modbusService.writeWords([...LIQUID_REAL_NAMES], realBits);
          if (stopped) return;
          if (wrote.success) lastRealKey = realKey;
        }

        /* 3) 设备 → PLC：阶段 / 轮次 / 配比 / 开关量掩码（单字） */
        const mask = liquidSensorMask(s.sensors);
        await modbusService.writeWords([...LIQUID_REPORT_WORD_NAMES], [
          s.phase,
          s.round,
          Math.round(liquidRatioA(s.mixA, s.mixB) * LIQUID_PLC_SCALE.RATIO),
          mask,
        ]);
        if (stopped) return;

        /* 4) 开关量反馈：位掩码变化才发帧；写失败不更新掩码，下一轮自动重试 */
        if (mask !== lastSensorMask) {
          const bits = liquidSensorBits(s.sensors);
          const write = modbusService.getProtocol() === 'modbus'
            ? await modbusService.writeCoils(LIQUID_SENSOR_FEEDBACK_BASE, bits)
            : await modbusService.writeVars(LIQUID_SENSOR_VAR_NAMES, bits);
          if (stopped) return;
          if (write.success) lastSensorMask = mask;
        }

        /* 5) 设备 → PLC：操作站 7 个输入点（位串没变就跳过，点动由事件入口即时落帧） */
        flushLiquidOperator();
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
