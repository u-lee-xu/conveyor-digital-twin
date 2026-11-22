/**
 * 仿真模式 PLC 连接：对接**外部 PLC 仿真软件 / 实物 PLC**，不用内置虚拟 PLC。
 *
 * 学生在 PLC 程序里读 5 个按钮与 14 路反馈，写 KM1 / KM2 线圈与 FR 复位；
 * 保持、点动、换向互锁逻辑属于学生程序，孪生侧不做 KM 辅助常开自锁接线。
 * 预设只给常规协议入口，不固化现场 IP，也不列本机练习靶机。
 */
/* eslint-disable react-refresh/only-export-components */
import { PlcConnectionPanel, type PlcConnConfig } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import {
  MOTOR_WORD_VARIABLES, motorBoolVarsFor, encodeMotorAction, MOTOR_ACTION,
} from '../constants/motorVariables';
import { useMotorAppStore } from '../stores/useMotorAppStore';
import { useMotorStore } from '../stores/useMotorStore';

const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: 'PLC 仿真软件 (Modbus TCP :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-PLCSIM (S7 :102)', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

let actionSeq = 0;

/** 教学主令：写显式动作字，序号递增形成变化沿；未连接时绝不写任何地址 */
export async function pulseMotorAction(code: number): Promise<void> {
  if (!useMotorStore.getState().connected) return;
  actionSeq = (actionSeq + 1) % 1000;
  await modbusService.writeWord('MOTOR_ACTION_W', encodeMotorAction(code, actionSeq));
}

export const MOTOR_ACTION_BUTTONS: { label: string; code: number }[] = [
  { label: 'FR 复位', code: MOTOR_ACTION.FR_RESET },
  { label: '全部复位', code: MOTOR_ACTION.ALL_RESET },
  { label: '触发过载', code: MOTOR_ACTION.TRIGGER_OVERLOAD },
];

export function MotorPlcConnection({ modeLabel = '仿真模式' }: { modeLabel?: string }) {
  const setPlcConnected = useMotorAppStore((s) => s.setPlcConnected);
  const setConnected = useMotorStore((s) => s.setConnected);
  const setControlSource = useMotorStore((s) => s.setControlSource);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const boolVariables = motorBoolVarsFor(config.protocol ?? 'modbus');
    const result = await modbusService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
      wordVariables: MOTOR_WORD_VARIABLES,
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
