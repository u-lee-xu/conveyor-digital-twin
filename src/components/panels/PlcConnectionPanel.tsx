import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../../stores';
import { modbusService } from '../../services/modbus-websocket';
import type { Mode } from '../../types';

const MODE_LABELS: Record<Mode, string> = {
  manual: '手动模式',
  auto: '演示模式',
  scoring: '评分模式',
  sim: '仿真模式',
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
  const [unitId, setUnitId] = useState(String(plcConfig.unitId));
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
    setUnitId(String(plcConfig.unitId));
  }, [plcConfig.host, plcConfig.port, plcConfig.unitId]);

  const syncConfig = () => {
    const nextPort = Number.parseInt(port, 10);
    const nextUnitId = Number.parseInt(unitId, 10);
    setPlcConfig({
      host: host.trim() || '127.0.0.1',
      port: Number.isFinite(nextPort) ? nextPort : 502,
      unitId: Number.isFinite(nextUnitId) ? nextUnitId : 1,
    });
  };

  const handleConnect = async () => {
    syncConfig();
    const { plcConfig: currentConfig } = useDeviceStore.getState();
    setBusy(true);
    setMessage('');

    try {
      const result = await modbusService.connect(currentConfig.host, currentConfig.port);
      if (!result.success) {
        throw new Error(result.error || '连接失败');
      }
      setConnected(true);
      setMessage(`已连接到 ${currentConfig.host}:${currentConfig.port}`);
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
    } catch {}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-300">
          <span className="block mb-1 text-slate-400">Host</span>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
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
            onChange={(e) => setPort(e.target.value)}
            onBlur={syncConfig}
            disabled={busy}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-300">
          <span className="block mb-1 text-slate-400">Unit ID</span>
          <input
            type="number"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            onBlur={syncConfig}
            disabled={busy}
            className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
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

      <div className="mt-3 text-xs text-slate-400 min-h-4">
        {message || `当前地址: ${plcConfig.host}:${plcConfig.port} / Unit ${plcConfig.unitId}`}
      </div>
    </div>
  );
};

export default PlcConnectionPanel;
