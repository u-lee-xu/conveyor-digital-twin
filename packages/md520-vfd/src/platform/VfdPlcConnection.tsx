/**
 * MD520 独立场景 PLC 连接：默认指向自己的虚拟 PLC :1507。
 *
 * 外部 PLC 程序都能控制变频器：
 *  - AutoShop / H5U 等 Modbus TCP PLC：coils 130~134 / 140~142 + 15 个数值字；
 *  - 博途 / S7-PLCSIM / 实物 S7：M130.0~ / M140.0~ + MW1000~MW1014；
 *  - GX Works2 / GX Simulator2：Y0~Y4 / X0~X2；实物 FX3U/FX5U 无实际接线统一 M 区。
 * 布尔点位表随 connect 帧下发（boolVariables），不设全局状态，不影响其它设备。
 */
import { PlcConnectionPanel, modbusService, type PlcConnConfig } from '@digital-twin/shared';
import { useVfdAppStore } from '../stores/useVfdAppStore';
import { md520BoolVarsFor } from '../constants/md520-io-vars';

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
