import { useEffect } from 'react';
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import { useDeviceStore } from '../stores';

const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: '汇川H5U (Modbus)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川EASY (Modbus)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-1200/1500 仿真', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: 'S7-PLCSIM (局域网)', config: { host: '192.168.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

/** 传送带场景 PLC 连接（统一面板 + 设备连接实现） */
export function ConveyorPlcConnection({ modeLabel }: { modeLabel: string }) {
  const plcConfig = useDeviceStore((s) => s.plcConfig);
  const setPlcConfig = useDeviceStore((s) => s.setPlcConfig);
  const setConnected = useDeviceStore((s) => s.setConnected);
  const setScoringRunning = useDeviceStore((s) => s.setScoringRunning);
  const disconnectTick = useDeviceStore((s) => s.plcDisconnectTick);

  // 外部断连（PLC 主动断开）→ 复位连接状态 + 停止评分
  useEffect(() => {
    modbusService.setOnPlcDisconnected(() => {
      const s = useDeviceStore.getState();
      s.setConnected(false);
      s.setScoringRunning(false);
      s.bumpPlcDisconnectTick();
    });
    return () => modbusService.setOnPlcDisconnected(null);
  }, []);

  return (
    <>
      <PlcConnectionPanel
        modeLabel={modeLabel}
        protocols={['modbus', 's7', 'mitsubishi']}
        presets={PRESETS}
        initialConfig={plcConfig}
        disconnectTick={disconnectTick}
        onConnect={async (config) => {
          const result = await modbusService.connect(config);
          return result.success ? null : result.error || '连接失败';
        }}
        onDisconnect={async () => {
          await modbusService.disconnect();
        }}
        onConnectedChange={(connected) => {
          setConnected(connected);
          if (!connected) setScoringRunning(false);
        }}
        onConfigChange={setPlcConfig}
      />
    </>
  );
}
