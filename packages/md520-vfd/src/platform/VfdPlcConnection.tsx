/**
 * MD520 独立场景 PLC 连接：只对接外部 PLC 编程软件的 simulator 或实物 PLC
 * （Modbus TCP 通信控制或 DI/AI 端子控制）。
 *
 * 两种外部控制方式（由变频器参数 F0-02 / F0-03 选择）：
 *  - 通信控制（F0-02=2、F0-03=9）：PLC 程序写 2000H 控制字、7310H 频率给定、
 *    1000H 百分比，读 3000H / 1001H / 1009H；Modbus TCP / S7 / 三菱点位如下。
 *  - 端子控制（F0-02=1）：PLC 数字量输出接 DI1~DI5 决定运行、方向与多段速，
 *    模拟量输出接 AI1/AI2（F0-03=2/3）给频率；这类接线不经过 WS 网关。
 *  - AutoShop / H5U 等 Modbus TCP PLC：coils 130~134 / 140~142 + 15 个数值字；
 *  - 博途 / S7-PLCSIM / 实物 S7：M130.0~ / M140.0~ + MW1000~MW1014；
 *  - GX Works2 / GX Simulator2：Y0~Y4 / X0~X2；实物 FX3U/FX5U 无实际接线统一 M 区。
 * 内置虚拟 PLC 仅开发 / 验收使用，不列入教学预设、不随课堂启动。
 * 布尔点位表随 connect 帧下发（boolVariables），不设全局状态，不影响其它设备。
 */
import { PlcConnectionPanel, type PlcConnConfig } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { useVfdAppStore } from '../stores/useVfdAppStore';
import { md520BoolVarsFor } from '../constants/md520-io-vars';

const PRESETS: { label: string; config: PlcConnConfig }[] = [
  { label: 'PLC 仿真软件 (Modbus TCP :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: '汇川 H5U (Modbus TCP :502)', config: { host: '127.0.0.1', port: 502, protocol: 'modbus' } },
  { label: 'S7-1200/1500 仿真 (S7 :102)', config: { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: 'S7-PLCSIM (局域网)', config: { host: '192.168.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 } },
  { label: '三菱 GX Simulator2 仿真', config: { host: '127.0.0.1', port: 0, protocol: 'mitsubishi' } },
];

export function VfdPlcConnection({ modeLabel }: { modeLabel: string }) {
  const plcConfig = useVfdAppStore((s) => s.plcConfig);
  const setPlcConfig = useVfdAppStore((s) => s.setPlcConfig);
  const setConnected = useVfdAppStore((s) => s.setConnected);
  const mitsubishiProfile = useVfdAppStore((s) => s.mitsubishiProfile);
  const setMitsubishiProfile = useVfdAppStore((s) => s.setMitsubishiProfile);

  return (
    <PlcConnectionPanel
      modeLabel={modeLabel}
      protocols={['modbus', 's7', 'mitsubishi']}
      presets={PRESETS}
      initialConfig={plcConfig}
      enableMitsubishiProfile
      profile={mitsubishiProfile}
      onProfileChange={setMitsubishiProfile}
      onConnect={async (config) => {
        // 布尔表按协议 / 三菱档位现算；Modbus TCP 走 coils 数字地址，不下发表
        const boolVariables = md520BoolVarsFor(
          config.protocol ?? 'modbus',
          config.profile ?? mitsubishiProfile,
        );
        const result = await modbusService.connect({
          ...config,
          ...(boolVariables ? { boolVariables } : {}),
        });
        return result.success ? null : result.error || '连接失败';
      }}
      onDisconnect={async () => { await modbusService.disconnect(); }}
      onConnectedChange={setConnected}
      onConfigChange={setPlcConfig}
    />
  );
}
