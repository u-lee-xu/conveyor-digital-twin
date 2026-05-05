import React, { useState } from 'react';
import type { SimStep } from '../../hooks/useSimMode';
import type { ModbusStatus } from '../../services/modbus-websocket';

// 预设ModbusTCP服务器
const MODBUS_PRESETS = [
  { name: '本地服务器', host: '127.0.0.1', port: 502 },
  { name: '自定义服务器', host: '', port: 502 },
];

interface SimPanelProps {
  step: SimStep;
  isSimulationRunning: boolean;
  errorMessage: string | null;
  modbusConfig: {
    host: string;
    port: number;
  };
  modbusStatus: ModbusStatus;
  stats: {
    readCount: number;
    writeCount: number;
    errorCount: number;
  };
  controlSignals: {
    start: boolean;
    reset: boolean;
    feedCylinderValve: boolean;
    sorting1CylinderValve: boolean;
    sorting2CylinderValve: boolean;
    conveyor: boolean;
  };
  sensors: {
    feed: boolean;
    color: boolean;
    material: boolean;
  };
  cylinders: {
    feed: { extended: boolean };
    sorting1: { extended: boolean };
    sorting2: { extended: boolean };
  };
  conveyorRunning: boolean;
  onConnect: (host: string, port: number) => void;
  onDisconnect: () => void;
  onPublishAllFeedback: () => void;
  onSimulationStart: (signal: boolean) => void;
  onSimulationReset: (signal: boolean) => void;
  onSpawnMaterial: () => void;
}

// 通用信号行组件
const SignalRow: React.FC<{
  addr: number;
  label: string;
  val: boolean;
  color: 'cyan' | 'green' | 'purple';
}> = ({ addr, label, val, color }) => {
  const dotColor = {
    cyan: val ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-gray-700',
    green: val ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]' : 'bg-gray-700',
    purple: val ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.7)]' : 'bg-gray-700',
  }[color];

  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-gray-800/60 border border-gray-700/30">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-gray-500 font-mono text-[10px] shrink-0 w-12">Addr {addr}</span>
        <span className="text-gray-300 text-[11px] truncate">{label}</span>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-1 ${dotColor} transition-all duration-200`} />
    </div>
  );
};

// 分栏标题
const SectionHeader: React.FC<{
  title: string;
  subtitle: string;
  color: 'cyan' | 'green' | 'purple';
}> = ({ title, subtitle, color }) => {
  const colors = {
    cyan: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    green: 'text-green-400 border-green-500/40 bg-green-500/10',
    purple: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
  }[color];

  return (
    <div className={`px-2 py-1.5 rounded-lg border mb-2 ${colors}`}>
      <div className="text-[11px] font-semibold">{title}</div>
      <div className="text-[9px] opacity-70 mt-0.5">{subtitle}</div>
    </div>
  );
};

export const SimPanel: React.FC<SimPanelProps> = ({
  step,
  isSimulationRunning,
  errorMessage,
  modbusConfig,
  stats,
  controlSignals,
  sensors,
  cylinders,
  onConnect,
  onDisconnect,
  onPublishAllFeedback,
  onSimulationStart,
  onSimulationReset,
  onSpawnMaterial,
}) => {
  const [host, setHost] = useState(modbusConfig.host);
  const [port, setPort] = useState(modbusConfig.port.toString());
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const handlePresetChange = (index: number) => {
    setSelectedPreset(index);
    const preset = MODBUS_PRESETS[index];
    if (preset.host) {
      setHost(preset.host);
      setPort(preset.port.toString());
    }
  };

  const handleConnect = () => {
    onConnect(host, parseInt(port) || 502);
  };

  return (
    <div className="space-y-3">
      {/* ModbusTCP连接配置 */}
      {step === 'DISCONNECTED' && (
        <div className="device-card">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">ModbusTCP 连接配置</div>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">服务器选择</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(parseInt(e.target.value))}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
              >
                {MODBUS_PRESETS.map((preset, index) => (
                  <option key={index} value={index}>{preset.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 mb-1 block">服务器地址</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-400 mb-1 block">端口</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="502"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <button
              onClick={handleConnect}
              className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              连接 ModbusTCP
            </button>
            
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-full py-2 px-4 rounded-lg bg-gray-700/30 text-gray-400 text-sm hover:bg-gray-700/50 transition-all flex items-center justify-center gap-2"
            >
              <span>?</span>
              <span>仿真模式说明</span>
              <span className={`transform transition-transform ${showHelp ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {showHelp && (
              <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-2 text-xs text-gray-300">
                <p>仿真模式用于PLC程序调试，无需实物设备。</p>
                <p><span className="text-purple-400">主令信号</span>：仿真系统写入 → PLC读取（M0/M1）</p>
                <p><span className="text-cyan-400">控制信号</span>：PLC写入 → 仿真系统读取（M100-M103）</p>
                <p><span className="text-green-400">反馈信号</span>：仿真系统写入 → PLC读取（M2-M10）</p>
                <p className="text-amber-400 pt-1">所有地址均使用线圈(Coil)。</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 连接中 */}
      {step === 'CONNECTING' && (
        <div className="device-card">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mr-3"></div>
            <span className="text-gray-400">正在连接...</span>
          </div>
        </div>
      )}

      {/* 连接错误 */}
      {step === 'ERROR' && (
        <div className="device-card">
          <div className="text-center py-6">
            <span className="text-4xl">⚠️</span>
            <p className="text-red-400 text-sm mt-3">连接失败</p>
            <p className="text-gray-500 text-xs mt-1">{errorMessage}</p>
            <button
              onClick={() => onDisconnect()}
              className="mt-4 px-4 py-2 rounded-lg bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700 transition-all"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* 已连接 */}
      {step === 'CONNECTED' && (
        <>
          {/* 连接状态 & 操作按钮 */}
          <div className="device-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-medium text-gray-200">仿真模式</span>
                <code className="ml-2 text-[10px] text-cyan-400">{modbusConfig.host}:{modbusConfig.port}</code>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="status-badge status-badge-active pulse-indicator text-[10px]">已连接</span>
                {isSimulationRunning && (
                  <span className="text-[9px] text-green-400">运行中</span>
                )}
              </div>
            </div>

            {/* 启动/复位/生料 */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onMouseDown={() => onSimulationStart(true)}
                onMouseUp={() => onSimulationStart(false)}
                onMouseLeave={() => onSimulationStart(false)}
                onTouchStart={(e) => { e.preventDefault(); onSimulationStart(true); }}
                onTouchEnd={(e) => { e.preventDefault(); onSimulationStart(false); }}
                className="py-2 px-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-600 transition-all active:scale-95 shadow-lg shadow-green-500/20"
              >
                启动
              </button>
              <button
                onMouseDown={() => onSimulationReset(true)}
                onMouseUp={() => onSimulationReset(false)}
                onMouseLeave={() => onSimulationReset(false)}
                onTouchStart={(e) => { e.preventDefault(); onSimulationReset(true); }}
                onTouchEnd={(e) => { e.preventDefault(); onSimulationReset(false); }}
                className="py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
              >
                复位
              </button>
              <button
                onClick={onSpawnMaterial}
                className="py-2 px-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-medium hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg shadow-blue-500/20"
              >
                生料
              </button>
            </div>
          </div>

          {/* 通信统计 */}
          <div className="device-card">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">通信统计</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-center">
                <div className="text-base font-medium text-cyan-400">{stats.readCount}</div>
                <div className="text-[10px] text-gray-400">读取</div>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <div className="text-base font-medium text-green-400">{stats.writeCount}</div>
                <div className="text-[10px] text-gray-400">写入</div>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
                <div className="text-base font-medium text-red-400">{stats.errorCount}</div>
                <div className="text-[10px] text-gray-400">错误</div>
              </div>
            </div>
          </div>

          {/* ── 信号地址表：三栏 ── */}
          <div className="device-card space-y-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Modbus 信号地址</div>

            {/* 栏 1：主令信号（仿真→PLC） */}
            <div>
              <SectionHeader
                title="主令信号"
                subtitle="仿真系统 → PLC"
                color="purple"
              />
              <div className="space-y-1">
                <SignalRow addr={0} label="启动控制" val={controlSignals.start} color="purple" />
                <SignalRow addr={1} label="复位控制" val={controlSignals.reset} color="purple" />
              </div>
            </div>

            {/* 栏 2：控制信号（PLC→仿真） */}
            <div>
              <SectionHeader
                title="控制信号"
                subtitle="PLC → 仿真系统"
                color="cyan"
              />
              <div className="space-y-1">
                <SignalRow addr={100} label="上料气缸电磁阀" val={controlSignals.feedCylinderValve} color="cyan" />
                <SignalRow addr={101} label="分拣1气缸电磁阀" val={controlSignals.sorting1CylinderValve} color="cyan" />
                <SignalRow addr={102} label="分拣2气缸电磁阀" val={controlSignals.sorting2CylinderValve} color="cyan" />
                <SignalRow addr={103} label="传送带运行" val={controlSignals.conveyor} color="cyan" />
              </div>
            </div>

            {/* 栏 3：反馈信号（仿真→PLC） */}
            <div>
              <SectionHeader
                title="反馈信号"
                subtitle="仿真系统 → PLC"
                color="green"
              />
              <div className="space-y-1">
                <SignalRow addr={2}  label="上料缩回限位"  val={!cylinders.feed.extended}     color="green" />
                <SignalRow addr={3}  label="上料伸出限位"  val={cylinders.feed.extended}      color="green" />
                <SignalRow addr={4}  label="分拣1缩回限位" val={!cylinders.sorting1.extended} color="green" />
                <SignalRow addr={5}  label="分拣1伸出限位" val={cylinders.sorting1.extended}  color="green" />
                <SignalRow addr={6}  label="分拣2缩回限位" val={!cylinders.sorting2.extended} color="green" />
                <SignalRow addr={7}  label="分拣2伸出限位" val={cylinders.sorting2.extended}  color="green" />
                <SignalRow addr={8}  label="上料传感器"    val={sensors.feed}                 color="green" />
                <SignalRow addr={9}  label="色标传感器"    val={sensors.color}                color="green" />
                <SignalRow addr={10} label="物料传感器"    val={sensors.material}             color="green" />
              </div>
            </div>
          </div>

          {/* 底部操作 */}
          <div className="flex gap-2">
            <button
              onClick={onPublishAllFeedback}
              className="flex-1 py-2 px-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-all"
            >
              强制刷新反馈
            </button>
            <button
              onClick={onDisconnect}
              className="flex-1 py-2 px-4 rounded-lg bg-gray-800 border border-red-900/30 text-red-400/80 text-xs hover:bg-red-900/20 transition-all"
            >
              断开连接
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SimPanel;