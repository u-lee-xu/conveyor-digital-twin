import { useState } from 'react';
import { HelpPanel, PlcConnectionPanel, type PlcConnConfig } from '@digital-twin/shared';
import { DispenseControlPanel } from '../scenes/auto-dispensing/panels/DispenseControlPanel';
import { DispenseDemoPanel } from '../scenes/auto-dispensing/panels/DispenseDemoPanel';
import { DispenseSimPanel } from '../scenes/auto-dispensing/panels/DispenseSimPanel';
import { buildDispensingHelpContent } from '../scenes/auto-dispensing/helpContent';
import { plcService, type ProtocolType } from '../services/plc-websocket';

/**
 * 平台模式面板适配层。
 *
 * 平台 ModePanel 契约只接受 `{ isMobile?: boolean }`，而独立 App 里
 * 仿真面板的协议/连接状态由 App 注入；这里把状态收进面板自身，
 * 使同一个面板既能被平台壳渲染，也能保持独立 App 的功能。
 */

/** 手动模式：紧凑单点 I/O 操作台（内部已含输入点传感器状态，与独立 App 一致） */
export function PlatformManualPanel() {
  return <DispenseControlPanel />;
}

/** 演示模式：配方 + 启停（演示循环由 DeviceDefinition.effects 挂载） */
export function PlatformDemoPanel() {
  return <DispenseDemoPanel />;
}

/** 仿真模式：自带 PLC 连接面板与帮助入口 */
export function PlatformSimPanel() {
  const [protocol, setProtocol] = useState<ProtocolType>('modbus');
  const [connected, setConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const result = await plcService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
    });
    return result.success ? null : (result.error || '连接失败');
  };

  return (
    <>
      <PlcConnectionPanel
        modeLabel="仿真模式"
        protocols={['modbus', 's7', 'mitsubishi']}
        protocol={protocol}
        onProtocolChange={setProtocol}
        onConnect={handleConnect}
        onDisconnect={async () => { await plcService.disconnect(); }}
        onConnectedChange={setConnected}
        onHelp={() => setShowHelp(true)}
      />
      <DispenseSimPanel
        onShowHelp={() => setShowHelp(true)}
        protocol={protocol}
        connected={connected}
        setConnected={setConnected}
      />
      {showHelp && (
        <HelpPanel content={buildDispensingHelpContent()} onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}
