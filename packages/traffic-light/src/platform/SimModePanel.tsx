import { useState } from 'react';
import { PlcConnectionPanel, type PlcConnConfig } from '@digital-twin/shared';
import { SimPanel } from '../scenes/traffic-light/panels/SimPanel';
import { plcService } from '../services/plc-websocket';
import type { ProtocolType } from '../services/plc-websocket';

export function SimModePanel() {
  const [protocol, setProtocol] = useState<ProtocolType>('mitsubishi');
  const [connected, setConnected] = useState(false);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const plcConfig: Parameters<typeof plcService.connect>[0] = {
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
    };
    const result = await plcService.connect(plcConfig);
    return result.success ? null : result.error || '连接失败';
  };

  const handleDisconnect = async () => {
    await plcService.disconnect();
  };

  return (
    <>
      <PlcConnectionPanel
        modeLabel="仿真模式"
        protocols={['modbus', 's7', 'mitsubishi']}
        protocol={protocol}
        onProtocolChange={setProtocol}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onConnectedChange={setConnected}
      />
      <SimPanel
        protocol={protocol}
        connected={connected}
        setConnected={setConnected}
      />
    </>
  );
}
