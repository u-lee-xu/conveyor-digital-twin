/** 仿真模式 PLC 连接（统一 shared 面板 + 龙门自己的字变量表） */
/* eslint-disable react-refresh/only-export-components */
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import { GANTRY_WORD_VARIABLES, GANTRY_COILS, gantryBoolVarsFor } from '../constants/gantryVariables';
import { useGantryAppStore } from '../stores/useGantryAppStore';
import { useGantryStore } from '../stores/useGantryStore';

/**
 * 仿真模式只负责「虚拟场景 ↔ PLC 仿真软件」的交互，**不依赖内置虚拟 PLC**：
 * 学生在 InoProShop / AutoShop / PLCSIM / GX Simulator2 / 任意 Modbus 仿真器里
 * 按变量地址表写自己的 PLC 程序，本场景经网关 300ms 读回寄存器跟着动。
 * 默认走 Modbus TCP 标准端口 502；不固化现场 IP，host 先给回环由界面输入框改。
 * :1509 本机练习靶机不列入预设（需手动启用并手填端口，见 start-lab.cjs）。
 */
const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: 'PLC 仿真软件 (Modbus TCP :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川H5U (Modbus :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川EASY (Modbus :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-PLCSIM (S7 :102)', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
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
    // S7 / 三菱按变量名写传感器反馈，布尔表随 connect 帧下发；
    // Modbus TCP 走 coils 数字地址，不下发表（与 MD520 同口径）。
    const boolVariables = gantryBoolVarsFor(config.protocol ?? 'modbus');
    const result = await modbusService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
      wordVariables: GANTRY_WORD_VARIABLES,
      ...(boolVariables ? { boolVariables } : {}),
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
