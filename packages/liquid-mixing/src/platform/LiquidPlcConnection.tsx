/**
 * 仿真模式 PLC 连接：只对接**外部 PLC 仿真软件**，不用内置虚拟 PLC、不新增端口或进程。
 *
 * 学生在 PLCSIM / GX Simulator2 / InoProShop / 任意 Modbus 仿真器里按地址表
 * 自写程序：PLC 读四罐 32 位 REAL 液位与 14 路开关量，写 5 个执行器线圈、
 * 配方与显式动作字；场景经网关 300ms 读回后跟着动。
 * 预设只给常规协议入口，不固化现场 IP（host 由界面改成教师机 / PLC 实际地址），
 * 也不列出任何本机练习靶机。
 */
/* eslint-disable react-refresh/only-export-components */
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import {
  LIQUID_WORD_VARIABLES, liquidBoolVarsFor, encodeAction, LIQUID_ACTION,
} from '../constants/liquidVariables';
import { useLiquidAppStore } from '../stores/useLiquidAppStore';
import { useLiquidStore } from '../stores/useLiquidStore';

const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: 'PLC 仿真软件 (Modbus TCP :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川 H5U (Modbus :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-PLCSIM (S7 :102)', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

let actionSeq = 0;

/**
 * 教学主令：写显式动作字（HR311 / MW1106 / D411），序号递增形成变化沿。
 * 正常教学应由学生 PLC 程序写这个字，此处按钮仅用于本机演示与调试；
 * 未连接时绝不写任何地址。
 */
export async function pulseLiquidAction(code: number): Promise<void> {
  if (!useLiquidStore.getState().connected) return;
  actionSeq = (actionSeq + 1) % 1000;
  await modbusService.writeWord('LIQUID_ACTION_W', encodeAction(code, actionSeq));
}

export const LIQUID_ACTION_BUTTONS: { label: string; code: number }[] = [
  { label: '装载配方', code: LIQUID_ACTION.LOAD_RECIPE },
  { label: '全部复位', code: LIQUID_ACTION.RESET },
  { label: '报警复位', code: LIQUID_ACTION.ALARM_RESET },
];

export function LiquidPlcConnection({ modeLabel = '仿真模式' }: { modeLabel?: string }) {
  const setPlcConnected = useLiquidAppStore((s) => s.setPlcConnected);
  const setConnected = useLiquidStore((s) => s.setConnected);
  const setControlSource = useLiquidStore((s) => s.setControlSource);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    // S7 / 三菱按变量名读写布尔，表随 connect 帧下发；Modbus TCP 走 coils 数字地址
    const boolVariables = liquidBoolVarsFor(config.protocol ?? 'modbus');
    const result = await modbusService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
      wordVariables: LIQUID_WORD_VARIABLES,
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
