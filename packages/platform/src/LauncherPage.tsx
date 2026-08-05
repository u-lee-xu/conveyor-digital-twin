import type { DeviceDefinition } from './types';

interface LauncherPageProps {
  devices: DeviceDefinition[];
  onSelect: (deviceId: string) => void;
}

const PROTOCOL_LABELS: Record<string, string> = {
  modbus: 'Modbus TCP',
  s7: 'Siemens S7',
  mitsubishi: '三菱 MX',
};

export function LauncherPage({ devices, onSelect }: LauncherPageProps) {
  return (
    <div className="w-screen h-screen bg-dark-900 overflow-hidden relative flex flex-col items-center justify-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 blur-3xl rounded-full" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] bg-purple-600/10 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 text-center mb-10 px-6">
        <h1 className="text-4xl font-bold text-white tracking-wide">
          数字孪生<span className="text-gradient">仿真平台</span>
        </h1>
        <p className="mt-3 text-sm text-gray-400">选择要进入的教学设备 · © 2026 老徐</p>
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6 max-w-5xl w-full">
        {devices.map((device) => (
          <button
            key={device.id}
            onClick={() => onSelect(device.id)}
            className="device-card text-left group"
          >
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${device.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                <span className="text-2xl">{device.icon}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                  {device.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  V{device.version}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-400 leading-relaxed line-clamp-2">
              {device.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {device.protocols.map((protocol) => (
                <span key={protocol} className="status-badge status-badge-inactive">
                  {PROTOCOL_LABELS[protocol] ?? protocol}
                </span>
              ))}
              <span className="status-badge status-badge-inactive">
                {device.modes.length} 种模式
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
