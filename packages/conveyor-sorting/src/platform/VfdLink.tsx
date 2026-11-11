/**
 * MD520 虚拟变频器常驻链路（平台壳 effects，主控专用）。
 *
 * 1. 每帧推进 F0-17/F0-18 加减速斜坡，产出频率倍率给 3D 带速消费。
 * 2. 每 300ms 走 485：读 2000H 控制命令 / 1000H 通信设定值 / 7310H 设定频率2，
 *    写回 3000H 状态与 1001H 运行频率（从站监视数据）。
 * 3. 只在 F0-02=2（通信命令源）时让 PLC 抢运行权；面板 / DI 模式下不覆盖本地给定。
 *
 * 观众端不挂载 effects，参数与状态走 exportSnapshot / applyBroadcast 数值镜像。
 */
import { useEffect } from 'react';
import { modbusService } from '@digital-twin/shared';
import { useVfdStore } from '../stores/useVfdStore';
import { MD520_SOURCE } from '../vfd/md520Spec';

export function VfdLink() {
  useEffect(() => {
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
    let busy = false;
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
        const res = await modbusService.readWords([
          'VFD_COMMAND2', 'VFD_SETPOINT', 'VFD_FREQ2',
        ]);
        if (res.success && res.values) {
          const pctRaw = Number(res.values['VFD_SETPOINT'] ?? 0);
          const pct = pctRaw > 32767 ? pctRaw - 65536 : pctRaw;
          const maxHz = store.params['F0-10'] || 50;
          const freq2Raw = Number(res.values['VFD_FREQ2'] ?? 0);
          // 7310H 按 0.01Hz 写入；1000H 是相对最大频率的 ±100.00%
          const setpointHz = freq2Raw > 0
            ? freq2Raw / 100
            : Math.abs(pct) / 10000 * maxHz;
          if (source === MD520_SOURCE.COMM) {
            store.setPlcFrame({
              command: Number(res.values['VFD_COMMAND2'] ?? 0),
              setpointHz,
            });
          }
          store.setCommOnline(true);
        } else {
          store.setCommOnline(false);
        }
        const snap = useVfdStore.getState().snapshot();
        await modbusService.writeWord('VFD_STATUS1', snap.status);
        await modbusService.writeWord('VFD_RUN_FREQ', Math.round(snap.outputHz * 100));
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
