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

export const SimPanel: React.FC<SimPanelProps> = ({
  step,
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
              <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-3">
                <div className="text-xs text-gray-400 font-medium">仿真模式说明</div>
                
                <div className="text-xs text-gray-300 space-y-2">
                  <p>仿真模式用于PLC程序调试与验证，无需实物设备。</p>
                  <p><span className="text-cyan-400">PLC控制信号</span> → 虚拟产线执行动作</p>
                  <p><span className="text-green-400">虚拟产线反馈</span> → PLC读取传感器状态</p>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">Modbus地址映射</div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">控制信号 (PLC写入, 网页读取):</div>
                      <code className="text-xs text-cyan-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        0:启动 | 1:复位 | 100:上料气缸 | 101:分拣1 | 102:分拣2 | 103:传送带
                      </code>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">反馈信号 (网页写入, PLC读取):</div>
                      <code className="text-xs text-green-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        2-7: 气缸磁性开关 | 8:上料传感器 | 9:色标传感器 | 10:物料传感器
                      </code>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-amber-400 font-medium mb-2">注意</div>
                  <div className="text-xs text-gray-300">
                    仿真模式下所有通信均通过线圈(Coil)进行。地址编号直接对应PLC的M地址编号。
                  </div>
                </div>
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
          {/* 连接状态 */}
          <div className="device-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-200">仿真模式</span>
              <span className="status-badge status-badge-active pulse-indicator">
                运行中
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">服务器:</span>
                <code className="text-cyan-400">{modbusConfig.host}:{modbusConfig.port}</code>
              </div>
            </div>

            {/* 启动/复位按钮 */}
            <div className="grid grid-cols-3 gap-2 mt-4">
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
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">通信统计</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-lg font-medium text-cyan-400">{stats.readCount}</div>
                <div className="text-xs text-gray-400">读取</div>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="text-lg font-medium text-green-400">{stats.writeCount}</div>
                <div className="text-xs text-gray-400">写入</div>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="text-lg font-medium text-red-400">{stats.errorCount}</div>
                <div className="text-xs text-gray-400">错误</div>
              </div>
            </div>
          </div>

          {/* Modbus地址映射 */}
          <div className="device-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Modbus地址映射 (线圈)</div>
            
            {/* 1. 控制信号 (0, 1, 100-103) */}
            <div className="mb-4">
              <div className="text-xs text-cyan-400/70 mb-2 font-medium">控制信号 (PLC写入 → 网页读取)</div>
              <div className="space-y-1 text-xs">
                {[
                  { addr: 0, label: '启动控制', val: controlSignals.start },
                  { addr: 1, label: '复位控制', val: controlSignals.reset },
                  { addr: 100, label: '上料气缸阀', val: controlSignals.feedCylinderValve },
                  { addr: 101, label: '分拣1气缸阀', val: controlSignals.sorting1CylinderValve },
                  { addr: 102, label: '分拣2气缸阀', val: controlSignals.sorting2CylinderValve },
                  { addr: 103, label: '传送带运行', val: controlSignals.conveyor },
                ].map(item => (
                  <div key={item.addr} className="flex items-center justify-between p-1.5 rounded bg-gray-800/50 border border-gray-700/30">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16 font-mono">Addr {item.addr}</span>
                      <span className="text-gray-200">{item.label}</span>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${item.val ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-gray-700'}`}></div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 反馈信号 (2-10) */}
            <div>
              <div className="text-xs text-green-400/70 mb-2 font-medium">反馈信号 (网页写入 → PLC读取)</div>
              <div className="space-y-1 text-xs">
                {[
                  { addr: 2, label: '上料缩回限位', val: !cylinders.feed.extended },
                  { addr: 3, label: '上料伸出限位', val: cylinders.feed.extended },
                  { addr: 4, label: '分拣1缩回限位', val: !cylinders.sorting1.extended },
                  { addr: 5, label: '分拣1伸出限位', val: cylinders.sorting1.extended },
                  { addr: 6, label: '分拣2缩回限位', val: !cylinders.sorting2.extended },
                  { addr: 7, label: '分拣2伸出限位', val: cylinders.sorting2.extended },
                  { addr: 8, label: '上料传感器', val: sensors.feed },
                  { addr: 9, label: '色标传感器', val: sensors.color },
                  { addr: 10, label: '物料传感器', val: sensors.material },
                ].map(item => (
                  <div key={item.addr} className="flex items-center justify-between p-1.5 rounded bg-gray-800/50 border border-gray-700/30">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-16 font-mono">Addr {item.addr}</span>
                      <span className="text-gray-200">{item.label}</span>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${item.val ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-gray-700'}`}></div>
                  </div>
                ))}
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