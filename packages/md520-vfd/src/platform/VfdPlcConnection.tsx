/** MD520 独立场景 PLC 连接：默认指向自己的虚拟 PLC :1507 */
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import { useVfdAppStore } from '../stores/useVfdAppStore';

const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: 'MD520 虚拟 PLC (Modbus)', config: { host: '127.0.0.1', port: 1507, protocol: 'modbus' } },
  { label: '汇川H5U (Modbus)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-1200/1500 仿真', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

export function VfdPlcConnection({ modeLabel }: { modeLabel: string }) {
  const plcConfig = useVfdAppStore((s) => s.plcConfig);
  const setPlcConfig = useVfdAppStore((s) => s.setPlcConfig);
  const setConnected = useVfdAppStore((s) => s.setConnected);

  return (
    <PlcConnectionPanel
      modeLabel={modeLabel}
      protocols={['modbus', 's7', 'mitsubishi']}
      presets={PRESETS}
      initialConfig={plcConfig}
      onConnect={async (config) => {
        const result = await modbusService.connect(config);
        return result.success ? null : result.error || '连接失败';
      }}
      onDisconnect={async () => { await modbusService.disconnect(); }}
      onConnectedChange={setConnected}
      onConfigChange={setPlcConfig}
    />
  );
}
