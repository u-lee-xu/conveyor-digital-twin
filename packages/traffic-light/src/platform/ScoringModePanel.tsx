import { useState } from 'react';
import { PlcConnectionPanel, HelpPanel, type PlcConnConfig } from '@digital-twin/shared';
import { TrafficScoringPanel } from '../scenes/traffic-light/panels/TrafficScoringPanel';
import { useTrafficScoring } from '../scenes/traffic-light/hooks/useTrafficScoring';
import { plcService } from '../services/plc-websocket';
import { buildTrafficHelpContent } from '../scenes/traffic-light/helpContent';
import type { ProtocolType } from '../services/plc-websocket';

export function ScoringModePanel() {
  const [showHelp, setShowHelp] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolType>('mitsubishi');
  const [connected, setConnected] = useState(false);

  useTrafficScoring();

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
        modeLabel="评分模式"
        protocols={['modbus', 's7', 'mitsubishi']}
        protocol={protocol}
        onProtocolChange={setProtocol}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onConnectedChange={setConnected}
        onHelp={() => setShowHelp(true)}
      />
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
        <TrafficScoringPanel connected={connected} />
      </div>
      {showHelp && <HelpPanel content={buildTrafficHelpContent()} onClose={() => setShowHelp(false)} />}
    </>
  );
}

export default ScoringModePanel;
