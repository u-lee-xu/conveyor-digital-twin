/** 仿真模式 PLC 连接（统一 shared 面板 + 龙门自己的字变量表） */
/* eslint-disable react-refresh/only-export-components */
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import { GANTRY_WORD_VARIABLES, GANTRY_COILS } from '../constants/gantryVariables';
import { useGantryAppStore } from '../stores/useGantryAppStore';
import { useGantryStore } from '../stores/useGantryStore';

/**
 * 预设口径与传送带分拣 / MD520 一致：
 *  - :1509 是 start-lab 起的**本机教学虚拟 PLC**（方案 A），不接真机也能跑仿真，故作为默认；
 *  - :502 是汇川 H5U / EASY 等真实 PLC 的 Modbus TCP 标准端口，选后把主机地址改成现场 IP 即可。
 * 不固化现场 IP，所有预设 host 都先给回环，由界面输入框改。
 */
const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: '龙门虚拟 PLC (本机 :1509)', config: { host: '127.0.0.1', port: 1509, protocol: 'modbus' } },
  { label: '汇川H5U (Modbus :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川EASY (Modbus :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-1200/1500 仿真', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

/** 主令按钮：写 PLC 输入线圈（自复位），未连接时不写任何地址 */
export async function pulseGantryInput(name: keyof typeof GANTRY_COILS): Promise<void> {
  const store = useGantryStore.getState();
  if (!store.connected) return;
  await modbusService.writeCoils(GANTRY_COILS[name], [true]);
  await modbusService.writeCoils(GANTRY_COILS[name], [false]);
}

export function GantryPlcConnection({ modeLabel = '仿真模式' }: { modeLabel?: string }) {
  const setPlcConnected = useGantryAppStore((s) => s.setPlcConnected);
  const setConnected = useGantryStore((s) => s.setConnected);
  const setControlSource = useGantryStore((s) => s.setControlSource);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const result = await modbusService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
      wordVariables: GANTRY_WORD_VARIABLES,
    });
    if (!result.success) return result.error || '连接失败';
    setControlSource('plc');
    return null;
  };

  const handleDisconnect = async () => {
    await modbusService.disconnect();
    setConnected(false);
    setControlSource('local');
  };

  const onConnectedChange = (on: boolean) => {
    setConnected(on);
    setPlcConnected(on);
    if (!on) setControlSource('local');
  };

  return (
    <PlcConnectionPanel
      modeLabel={modeLabel}
      protocols={['modbus', 's7', 'mitsubishi']}
      presets={PRESETS}
      initialConfig={PRESETS[0].config}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      onConnectedChange={onConnectedChange}
    />
  );
}
