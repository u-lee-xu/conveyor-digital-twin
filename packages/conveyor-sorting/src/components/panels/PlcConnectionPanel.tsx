import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../../stores';
import { modbusService, type ProtocolType } from '@digital-twin/shared';
import type { Mode } from '../../types';

const MODE_LABELS: Record<Mode, string> = {
  manual: '手动模式',
  auto: '演示模式',
  scoring: '评分模式',
  sim: '仿真模式',
};

const PROTOCOL_OPTIONS = [
  { value: 'modbus', label: 'Modbus TCP' },
  { value: 's7', label: 'Siemens S7' },
];

const PRESETS: Record<string, { host: string; port: number; protocol: ProtocolType; rack?: number; slot?: number }> = {
  '汇川H5U (Modbus)': { host: '127.0.0.1', port: 502, protocol: 'modbus' },
  '汇川EASY (Modbus)': { host: '127.0.0.1', port: 502, protocol: 'modbus' },
  'S7-1200/1500 仿真': { host: '127.0.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 },
  'S7-PLCSIM (局域网)': { host: '192.168.0.1', port: 102, protocol: 's7', rack: 0, slot: 1 },
};

interface PlcConnectionPanelProps {
  mode: Extract<Mode, 'scoring' | 'sim'>;
}

export const PlcConnectionPanel: React.FC<PlcConnectionPanelProps> = ({ mode }) => {
  const plcConfig = useDeviceStore((s) => s.plcConfig);
  const setPlcConfig = useDeviceStore((s) => s.setPlcConfig);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const setConnected = useDeviceStore((s) => s.setConnected);
  const setScoringRunning = useDeviceStore((s) => s.setScoringRunning);
  const [host, setHost] = useState(plcConfig.host);
  const [port, setPort] = useState(String(plcConfig.port));
  const [protocol, setProtocol] = useState<ProtocolType>(plcConfig.protocol || 'modbus');
  const [rack, setRack] = useState(String(plcConfig.rack ?? 0));
  const [slot, setSlot] = useState(String(plcConfig.slot ?? 1));
  const [selectedPreset, setSelectedPreset] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    modbusService.setOnPlcDisconnected(() => {
      setConnected(false);
      setScoringRunning(false);
      setMessage('PLC 连接已断开');
    });
    return () => {
      modbusService.setOnPlcDisconnected(null);
    };
  }, [setConnected, setScoringRunning]);

  useEffect(() => {
    setHost(plcConfig.host);
    setPort(String(plcConfig.port));
    setProtocol(plcConfig.protocol || 'modbus');
    setRack(String(plcConfig.rack ?? 0));
    setSlot(String(plcConfig.slot ?? 1));
  }, [plcConfig.host, plcConfig.port, plcConfig.protocol, plcConfig.rack, plcConfig.slot]);

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    if (presetName && PRESETS[presetName]) {
      const preset = PRESETS[presetName];
      setHost(preset.host);
      setPort(String(preset.port));
      setProtocol(preset.protocol);
      setRack(String(preset.rack ?? 0));
      setSlot(String(preset.slot ?? 1));
    }
  };

  const syncConfig = () => {
    const nextPort = Number.parseInt(port, 10);
    const nextRack = Number.parseInt(rack, 10);
    const nextSlot = Number.parseInt(slot, 10);
    setPlcConfig({
      host: host.trim() || '127.0.0.1',
      port: Number.isFinite(nextPort) ? nextPort : 502,
      protocol,
      rack: Number.isFinite(nextRack) ? nextRack : 0,
      slot: Number.isFinite(nextSlot) ? nextSlot : 1,
    });
  };

  const handleConnect = async () => {
    syncConfig();
    const { plcConfig: currentConfig } = useDeviceStore.getState();
    setBusy(true);
    setMessage('');

    try {
      const result = await modbusService.connect({
        host: currentConfig.host,
        port: currentConfig.port,
        protocol: currentConfig.protocol,
        rack: currentConfig.rack,
        slot: currentConfig.slot,
      });
      if (!result.success) {
        throw new Error(result.error || '连接失败');
      }
      setConnected(true);
      const protocolLabel = currentConfig.protocol === 's7' ? 'S7' : 'Modbus';
      setMessage(`已连接到 ${protocolLabel}: ${currentConfig.host}:${currentConfig.port}`);
    } catch (error) {
      setConnected(false);
      setMessage(error instanceof Error ? error.message : '连接失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setMessage('');
    try {
      await modbusService.disconnect();
    } catch {
      // 忽略断开连接时的错误
    }
    setConnected(false);
    setScoringRunning(false);
    setMessage('已断开 PLC 连接');
    setBusy(false);
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PLC Connection</div>
          <div className="text-sm text-white mt-1">{MODE_LABELS[mode]}</div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs ${isConnected ? 'bg-green-500/15 text-green-300' : 'bg-slate-700/60 text-slate-300'}`}>
          {isConnected ? '已连接' : '未连接'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="text-xs text-slate-300">
          <span className="block mb-1 text-slate-400">预设配置</span>
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={busy || isConnected}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- 选择预设 --</option>
            {Object.keys(PRESETS).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300">
          <span className="block mb-1 text-slate-400">通信协议</span>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as ProtocolType)}
            disabled={busy || isConnected}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            {PROTOCOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-xs text-slate-300 col-span-2">
          <span className="block mb-1 text-slate-400">Host</span>
          <input
            type="text"
            value={host}
            onChange={(e) => { setHost(e.target.value); setSelectedPreset(''); }}
            onBlur={syncConfig}
            disabled={busy}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-300">
          <span className="block mb-1 text-slate-400">Port</span>
          <input
            type="number"
            value={port}
            onChange={(e) => { setPort(e.target.value); setSelectedPreset(''); }}
            onBlur={syncConfig}
            disabled={busy}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        {protocol === 's7' && (
          <>
            <label className="text-xs text-slate-300">
              <span className="block mb-1 text-slate-400">Rack</span>
              <input
                type="number"
                value={rack}
                onChange={(e) => { setRack(e.target.value); setSelectedPreset(''); }}
                onBlur={syncConfig}
                disabled={busy}
                className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </label>
            <label className="text-xs text-slate-300">
              <span className="block mb-1 text-slate-400">Slot</span>
              <input
                type="number"
                value={slot}
                onChange={(e) => { setSlot(e.target.value); setSelectedPreset(''); }}
                onBlur={syncConfig}
                disabled={busy}
                className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </label>
          </>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={handleConnect}
          disabled={busy || isConnected}
          className="flex-1 rounded-lg bg-cyan-500 text-slate-950 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy && !isConnected ? '连接中...' : '连接'}
        </button>
        <button
          onClick={handleDisconnect}
          disabled={busy || !isConnected}
          className="flex-1 rounded-lg bg-slate-700 text-white py-2 text-sm font-semibold disabled:opacity-50"
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
      {!message && (
        <div className="mt-3 text-xs text-slate-500">
          当前: {protocol === 's7' ? 'S7' : 'Modbus'} / {plcConfig.host}:{plcConfig.port}
        </div>
      )}
    </div>
  );
};

export default PlcConnectionPanel;
