import React, { useEffect, useState } from 'react';
import type { ProtocolType } from '../../services/modbus-websocket';

/** PLC 连接配置 */
export interface PlcConnConfig {
  host: string;
  port: number;
  protocol: ProtocolType;
  rack?: number;
  slot?: number;
}

const PROTOCOL_LABELS: Record<ProtocolType, string> = {
  modbus: 'Modbus TCP',
  s7: 'Siemens S7',
  mitsubishi: '三菱 MX',
};

const DEFAULT_PARAMS: Record<ProtocolType, { host: string; port: number; rack?: number; slot?: number }> = {
  modbus: { host: '127.0.0.1', port: 502 },
  s7: { host: '127.0.0.1', port: 102, rack: 0, slot: 1 },
  mitsubishi: { host: '127.0.0.1', port: 0 },
};

interface PlcConnectionPanelProps {
  /** 当前模式名称（如 仿真模式 / 评分模式） */
  modeLabel: string;
  /** 设备支持的协议列表 */
  protocols: ProtocolType[];
  /** 可选预设配置 */
  presets?: { label: string; config: PlcConnConfig }[];
  /** 初始连接参数（默认本地仿真器） */
  initialConfig?: Partial<PlcConnConfig>;
  /** 受控协议（可选，外部需要同步当前协议时传入） */
  protocol?: ProtocolType;
  onProtocolChange?: (protocol: ProtocolType) => void;
  /** 外部断连通知（设备断连回调中递增该值，触发组件复位连接状态） */
  disconnectTick?: number;
  /** 连接/断开实现（返回错误消息，成功返回 null） */
  onConnect: (config: PlcConnConfig) => Promise<string | null>;
  onDisconnect: () => Promise<void>;
  /** 连接状态变化（设备可借此同步状态/启停轮询） */
  onConnectedChange?: (connected: boolean) => void;
  /** 参数变化持久化（可选） */
  onConfigChange?: (config: PlcConnConfig) => void;
  /** 帮助面板回调（可选，点击 ❓ 打开场景帮助） */
  onHelp?: () => void;
}

/** 统一 PLC 连接面板（平台共享，设备注入协议与连接实现） */
export const PlcConnectionPanel: React.FC<PlcConnectionPanelProps> = ({
  modeLabel,
  protocols,
  presets,
  initialConfig,
  disconnectTick,
  protocol: protocolProp,
  onProtocolChange,
  onConnect,
  onDisconnect,
  onConnectedChange,
  onConfigChange,
  onHelp,
}) => {
  const [protocol, setProtocol] = useState<ProtocolType>(initialConfig?.protocol ?? protocols[0] ?? 'modbus');
  const [host, setHost] = useState(initialConfig?.host ?? DEFAULT_PARAMS[protocol].host);
  const [port, setPort] = useState(String(initialConfig?.port ?? DEFAULT_PARAMS[protocol].port));
  const [rack, setRack] = useState(String(initialConfig?.rack ?? 0));
  const [slot, setSlot] = useState(String(initialConfig?.slot ?? 1));
  const [selectedPreset, setSelectedPreset] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // 连接状态变化 → 通知设备
  useEffect(() => {
    onConnectedChange?.(connected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // 外部断连（PLC 断开回调）
  useEffect(() => {
    if (!disconnectTick) return;
    setConnected(false);
    setMessage('PLC 连接已断开');
  }, [disconnectTick, setConnected]);

  // 受控协议：外部变化时同步内部状态（保持参数默认值）
  useEffect(() => {
    if (protocolProp && protocolProp !== protocol) {
      setProtocol(protocolProp);
      setSelectedPreset('');
      const d = DEFAULT_PARAMS[protocolProp];
      setHost(d.host);
      setPort(String(d.port));
      setRack(String(d.rack ?? 0));
      setSlot(String(d.slot ?? 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolProp]);

  const handleProtocolChange = (p: ProtocolType) => {
    setProtocol(p);
    onProtocolChange?.(p);
    setSelectedPreset('');
    const d = DEFAULT_PARAMS[p];
    setHost(d.host);
    setPort(String(d.port));
    setRack(String(d.rack ?? 0));
    setSlot(String(d.slot ?? 1));
  };

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = presets?.find((p) => p.label === presetName);
    if (preset) {
      setProtocol(preset.config.protocol);
      onProtocolChange?.(preset.config.protocol);
      setHost(preset.config.host);
      setPort(String(preset.config.port));
      setRack(String(preset.config.rack ?? 0));
      setSlot(String(preset.config.slot ?? 1));
    }
  };

  const buildConfig = (): PlcConnConfig => {
    const nextPort = Number.parseInt(port, 10);
    const nextRack = Number.parseInt(rack, 10);
    const nextSlot = Number.parseInt(slot, 10);
    return {
      host: host.trim() || '127.0.0.1',
      port: Number.isFinite(nextPort) ? nextPort : DEFAULT_PARAMS[protocol].port,
      protocol,
      rack: Number.isFinite(nextRack) ? nextRack : 0,
      slot: Number.isFinite(nextSlot) ? nextSlot : 1,
    };
  };

  const handleConnect = async () => {
    const config = buildConfig();
    onConfigChange?.(config);
    setBusy(true);
    setMessage('');
    try {
      const error = await onConnect(config);
      if (error) throw new Error(error);
      setConnected(true);
      setMessage(`已连接 ${PROTOCOL_LABELS[config.protocol]}: ${config.host}:${config.port}`);
    } catch (e) {
      setConnected(false);
      setMessage(e instanceof Error ? e.message : '连接失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onDisconnect();
    } catch {
      // 忽略断开错误
    }
    setConnected(false);
    setMessage('已断开 PLC 连接');
    setBusy(false);
  };

  return (
    <div className="device-card !p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold text-white">PLC 连接</div>
          <div className="text-xs text-gray-500 mt-0.5">{modeLabel}</div>
        </div>
        <span className={`status-badge ${connected ? 'status-badge-active' : 'status-badge-inactive'}`}>
          {connected ? '已连接' : '未连接'}
        </span>
        {onHelp && (
          <button
            onClick={onHelp}
            title="使用说明与地址映射"
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-gray-700/60 transition-colors text-lg leading-none"
          >
            ❓
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {presets && presets.length > 0 && (
          <label className="text-xs text-gray-300">
            <span className="block mb-1 text-gray-500">预设配置</span>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={busy || connected}
              className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- 选择预设 --</option>
              {presets.map((p) => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className={`text-xs text-gray-300 ${presets && presets.length > 0 ? '' : 'col-span-2'}`}>
          <span className="block mb-1 text-gray-500">通信协议</span>
          <select
            value={protocol}
            onChange={(e) => handleProtocolChange(e.target.value as ProtocolType)}
            disabled={busy || connected}
            className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            {protocols.map((p) => (
              <option key={p} value={p}>{PROTOCOL_LABELS[p]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-xs text-gray-300 col-span-2">
          <span className="block mb-1 text-gray-500">主机地址 Host</span>
          <input
            type="text"
            value={host}
            onChange={(e) => { setHost(e.target.value); setSelectedPreset(''); }}
            disabled={busy || connected}
            className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-gray-300">
          <span className="block mb-1 text-gray-500">端口 Port</span>
          <input
            type="number"
            value={port}
            onChange={(e) => { setPort(e.target.value); setSelectedPreset(''); }}
            disabled={busy || connected}
            className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        {protocol === 's7' && (
          <>
            <label className="text-xs text-gray-300">
              <span className="block mb-1 text-gray-500">Rack</span>
              <input
                type="number"
                value={rack}
                onChange={(e) => { setRack(e.target.value); setSelectedPreset(''); }}
                disabled={busy || connected}
                className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </label>
            <label className="text-xs text-gray-300">
              <span className="block mb-1 text-gray-500">Slot</span>
              <input
                type="number"
                value={slot}
                onChange={(e) => { setSlot(e.target.value); setSelectedPreset(''); }}
                disabled={busy || connected}
                className="w-full rounded-lg bg-gray-900/70 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </label>
          </>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={handleConnect}
          disabled={busy || connected}
          className="btn btn-sm btn-success flex-1 touch-manipulation"
        >
          {busy && !connected ? '连接中...' : '连接'}
        </button>
        <button
          onClick={handleDisconnect}
          disabled={busy || !connected}
          className="btn btn-sm btn-outline flex-1 touch-manipulation"
        >
          断开
        </button>
      </div>

      {message && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${
          message.includes('已连接') ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default PlcConnectionPanel;
