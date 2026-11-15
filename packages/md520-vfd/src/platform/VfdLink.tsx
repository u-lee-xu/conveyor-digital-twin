/**
 * MD520 虚拟变频器常驻链路（平台壳 effects，主控专用）。
 *
 * 场景独立：变频器是自己的设备包。仿真模式由外部 PLC 仿真软件 / 实物 PLC 写命令、
 * 给定并读状态联锁；本链路每 300ms 读写同一份寄存器，形成双向闭环。
 * 内置虚拟 PLC 靶机（:1507 等）只在开发模式启用，不属于教学交付链路。
 *
 * 1. 每帧推进 F0-17/F0-18 加减速斜坡，产出频率倍率给 3D 带速消费。
 * 2. 每 300ms 读 2000H / 1000H / 7310H / 1008H / 100AH / 2001H / 7044H，
 *    按 F0-02 选择消费通信给定或端子给定；把 F002H / F003H / F00AH 参数源下发给 PLC。
 * 3. 写回 3000H 状态 / 1001H 运行频率 / 1009H DO 标志，供 PLC 程序做输入联锁。
 * 4. 只在 F0-02=1（端子）或 =2（通信）时让 PLC 抢运行权；面板档不覆盖本地给定。
 *    PLC 尚未下达给定且变频器未接管时跳过零帧，保住手动 / 演示 / 评分的原有额定带速。
 * 5. 外部 PLC 的开关量链路：Modbus TCP 用 readCoils/writeCoils，S7 / 三菱用
 *    readVars/writeVars，把 PLC 输出点接到 DI1~DI5、把 DO1/FM/RELAY 写回 PLC 输入点。
 *    与数值字链路并存，让 AutoShop / 博途 / GX Works2 / 实物 PLC 程序都能控制变频器。
 *
 * 观众端不挂载 effects，参数与状态走 exportSnapshot / applyBroadcast 数值镜像。
 */
import { useEffect } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { useVfdStore } from '../stores/useVfdStore';
import { MD520_SOURCE, MD520_COMMAND } from '../vfd/md520Spec';
import {
  MD520_DI_VAR_KEYS, MD520_DO_VAR_KEYS,
  MD520_MODBUS_DI_BASE, MD520_MODBUS_DO_BASE,
  packDiFlags, unpackDoFlags,
} from '../constants/md520-io-vars';

/** PLC 侧写入的给定 / 监视字，由 conveyor 虚拟 PLC 的参考程序生成 */
const READ_NAMES: string[] = [
  'VFD_COMMAND2', 'VFD_SETPOINT', 'VFD_FREQ2',
  'VFD_DI_FLAGS', 'VFD_AI1', 'VFD_DO_CONTROL', 'VFD_STATUS2',
];

/** 面板下发的参数源：PLC 只读，按命令源决定用 DIDO / AI / 485 哪一路给定 */
const PARAM_NAMES: string[] = ['VFD_PARAM_F0_02', 'VFD_PARAM_F0_03', 'VFD_PARAM_F0_10'];

/** 从站状态字：虚拟变频器写、PLC 读，读写分离避免互相覆盖 */
const STATUS_NAMES: string[] = ['VFD_STATUS1', 'VFD_RUN_FREQ', 'VFD_DO_FLAGS'];

const signed16 = (v: number) => (v > 0x7fff ? v - 0x10000 : v);

export function VfdLink() {
  useEffect(() => {
    /** 观众只读：不建 PLC 通道、不推进本地斜坡，输出频率全靠快照镜像 */
    if (isViewerRuntime()) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const delta = Math.min(0.05, (t - last) / 1000);
      last = t;
      useVfdStore.getState().tick(delta);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (isViewerRuntime()) return;
    let busy = false;
    let lastParams = '';
    const poll = async () => {
      if (busy) return;
      if (!modbusService.isAvailable()) {
        useVfdStore.getState().setCommOnline(false);
        return;
      }
      busy = true;
      try {
        const store = useVfdStore.getState();
        const source = Math.trunc(store.params['F0-02']);
        const freqSource = Math.trunc(store.params['F0-03']);
        const maxHz = store.params['F0-10'] || 50;

        // 参数源只在变化时下发，避免每轮三个多余事务
        const paramValues = [source, freqSource, Math.round(maxHz * 100)];
        const paramFrame = paramValues.join('|');
        if (paramFrame !== lastParams) {
          const wrote = await modbusService.writeWords(PARAM_NAMES, paramValues);
          if (wrote.success) lastParams = paramFrame;
        }

        const res = await modbusService.readWords(READ_NAMES);
        if (res.success && res.values) {
          const v = res.values;
          const pct = signed16(Number(v['VFD_SETPOINT'] ?? 0));
          const freq2Raw = Number(v['VFD_FREQ2'] ?? 0);
          // 7310H 按 0.01Hz 写入；1000H 是相对最大频率的 ±100.00%
          const setpointHz = freq2Raw > 0
            ? freq2Raw / 100
            : Math.abs(pct) / 10000 * maxHz;
          const command = Number(v['VFD_COMMAND2'] ?? 0);
          const diFlags = Number(v['VFD_DI_FLAGS'] ?? 0);
          const ai1V = signed16(Number(v['VFD_AI1'] ?? 0)) / 100;

          // 零帧跳过：PLC 默认停机时不接管带速，也不冲刷面板本地 DI / AI 控件。
          // 18.3 表 18-2 中 2000H 没有 0 档，停机命令是 6（按 F6-10）或 5（自由停机），
          // 所以不能再用「控制字非零」判断 PLC 是否下达给定，只认 1/2/3/4 运行命令。
          const RUN_COMMANDS: number[] = [MD520_COMMAND.FWD, MD520_COMMAND.REV,
            MD520_COMMAND.FJOG, MD520_COMMAND.RJOG];
          const runCommand = RUN_COMMANDS.includes(command);
          const plcActive = store.engaged
            || (source === MD520_SOURCE.COMM && (runCommand || setpointHz > 0.001))
            || (source === MD520_SOURCE.TERMINAL && (diFlags !== 0 || Math.abs(ai1V) > 0.001));
          if (plcActive && source === MD520_SOURCE.COMM) {
            store.setPlcFrame({ command, setpointHz });
          } else if (plcActive && source === MD520_SOURCE.TERMINAL) {
            store.setPlcFrame({ diFlags, ai1: ai1V });
          }
          store.setCommOnline(true);
        } else {
          store.setCommOnline(false);
        }

        // ---- 外部 PLC 的 DI / DO 开关量链路（三协议并存）----
        // 变频器 DO 状态写回 PLC 输入点，PLC 程序可据此做联锁；
        // PLC 输出点读回来作为 DI1~DI5，是端子给定的真值来源。
        const doBits = unpackDoFlags(useVfdStore.getState().snapshot().doFlags);
        let diFlags: number | null = null;
        const protocol = modbusService.getProtocol();
        if (protocol === 'modbus') {
          const rd = await modbusService.readCoils(MD520_MODBUS_DI_BASE, MD520_DI_VAR_KEYS.length);
          if (rd.success && Array.isArray(rd.values)) {
            diFlags = packDiFlags(rd.values.slice(0, MD520_DI_VAR_KEYS.length).map(Boolean));
          }
          await modbusService.writeCoils(MD520_MODBUS_DO_BASE, doBits);
        } else {
          const rd = await modbusService.readVars([...MD520_DI_VAR_KEYS]);
          if (rd.success && rd.values) {
            diFlags = packDiFlags(MD520_DI_VAR_KEYS.map((k) => !!rd.values?.[k]));
          }
          await modbusService.writeVars([...MD520_DO_VAR_KEYS], doBits);
        }
        // 零帧跳过：外部 PLC 未下达任何 DI、变频器也未被接管时不冲刷面板本地 DI 控件
        if (diFlags !== null) {
          const s2 = useVfdStore.getState();
          if (s2.engaged || diFlags !== 0) s2.setPlcFrame({ diFlags });
        }

        const snap = useVfdStore.getState().snapshot();
        await modbusService.writeWords(STATUS_NAMES, [
          snap.status,
          Math.round(snap.outputHz * 100),
          snap.doFlags,
        ]);
      } catch {
        useVfdStore.getState().setCommOnline(false);
      } finally {
        busy = false;
      }
    };
    const id = window.setInterval(poll, 300);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
