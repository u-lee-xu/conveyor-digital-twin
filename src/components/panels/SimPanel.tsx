import React, { useState } from 'react';
import type { SimStep } from '../../hooks/useSimMode';

// 预设MQTT服务器
const MQTT_PRESETS = [
  { name: 'EMQX 公共服务器', host: 'broker.emqx.io', port: 1883 },
  { name: 'Eclipse Mosquitto', host: 'test.mosquitto.org', port: 1883 },
  { name: 'HiveMQ 公共服务器', host: 'broker.hivemq.com', port: 1883 },
  { name: '自定义服务器', host: '', port: 1883 },
];

interface SimPanelProps {
  step: SimStep;
  errorMessage: string | null;
  mqttConfig: {
    host: string;
    port: number;
    topic: string;
  };
  stats: {
    messagesReceived: number;
    messagesSent: number;
    controlSignals: number;
    feedbackSignals: number;
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
  onConnect: (host: string, port: number, topic: string) => void;
  onDisconnect: () => void;
  onPublishAllFeedback: () => void;
}

export const SimPanel: React.FC<SimPanelProps> = ({
  step,
  errorMessage,
  mqttConfig,
  stats,
  sensors,
  cylinders,
  conveyorRunning,
  onConnect,
  onDisconnect,
  onPublishAllFeedback,
}) => {
  const [host, setHost] = useState(mqttConfig.host);
  const [port, setPort] = useState(mqttConfig.port.toString());
  const [topic, setTopic] = useState(mqttConfig.topic);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // 计算WebSocket地址
  const wsPort = parseInt(port) === 1883 ? 8083 : parseInt(port) === 8883 ? 8084 : parseInt(port);
  const wsProtocol = parseInt(port) === 8883 ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${host}:${wsPort}/mqtt`;

  const handlePresetChange = (index: number) => {
    setSelectedPreset(index);
    const preset = MQTT_PRESETS[index];
    if (preset.host) {
      setHost(preset.host);
      setPort(preset.port.toString());
    }
  };

  const handleConnect = () => {
    onConnect(host, parseInt(port) || 1883, topic);
  };

  return (
    <div className="space-y-3">
      {/* MQTT连接配置 */}
      {step === 'IDLE' && (
        <div className="device-card">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">MQTT 连接配置</div>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">服务器选择</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(parseInt(e.target.value))}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
              >
                {MQTT_PRESETS.map((preset, index) => (
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
                placeholder="broker.emqx.io"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-400 mb-1 block">端口</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="1883"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-400 mb-1 block">主题前缀</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="digital-twin/sim"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <button
              onClick={handleConnect}
              className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              连接 MQTT
            </button>
            
            {/* 帮助按钮 */}
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-full py-2 px-4 rounded-lg bg-gray-700/30 text-gray-400 text-sm hover:bg-gray-700/50 transition-all flex items-center justify-center gap-2"
            >
              <span>?</span>
              <span>仿真模式说明</span>
              <span className={`transform transition-transform ${showHelp ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {/* 帮助说明面板 */}
            {showHelp && (
              <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-3">
                <div className="text-xs text-gray-400 font-medium">仿真模式说明</div>
                
                <div className="text-xs text-gray-300 space-y-2">
                  <p>仿真模式用于PLC程序调试与验证，无需实物设备。</p>
                  <p><span className="text-cyan-400">PLC控制信号</span> → 虚拟产线执行动作</p>
                  <p><span className="text-green-400">虚拟产线反馈</span> → PLC读取传感器状态</p>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">控制Topic（PLC→数字孪生）</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">气缸控制:</span>
                      <code className="text-cyan-400">{topic}/control/cylinder</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">传送带控制:</span>
                      <code className="text-cyan-400">{topic}/control/conveyor</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">物料生成:</span>
                      <code className="text-cyan-400">{topic}/control/material</code>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">反馈Topic（数字孪生→PLC）</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">传感器:</span>
                      <code className="text-green-400">{topic}/feedback/sensor_*</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">磁性开关:</span>
                      <code className="text-green-400">{topic}/feedback/magnetic_*</code>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">消息格式示例</div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">气缸伸出:</div>
                      <code className="text-xs text-cyan-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        {`{"type":"cylinder","name":"feed","value":true}`}
                      </code>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">传送带启动:</div>
                      <code className="text-xs text-cyan-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        {`{"type":"conveyor","name":"main","value":true}`}
                      </code>
                    </div>
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
                <code className="text-cyan-400">{mqttConfig.host}:{mqttConfig.port}</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">WebSocket:</span>
                <code className="text-cyan-400">{wsUrl}</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">主题前缀:</span>
                <code className="text-cyan-400">{mqttConfig.topic}</code>
              </div>
            </div>
          </div>

          {/* 通信统计 */}
          <div className="device-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">通信统计</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-lg font-medium text-cyan-400">{stats.controlSignals}</div>
                <div className="text-xs text-gray-400">控制信号接收</div>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="text-lg font-medium text-green-400">{stats.feedbackSignals}</div>
                <div className="text-xs text-gray-400">反馈信号发送</div>
              </div>
            </div>
          </div>

          {/* 反馈信号状态 */}
          <div className="device-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">反馈信号</span>
              <button
                onClick={onPublishAllFeedback}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                刷新状态
              </button>
            </div>
            
            {/* 传感器状态 */}
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-2">传感器</div>
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-lg text-center ${sensors.feed ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-800/50 border border-gray-700/30'}`}>
                  <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.feed ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">上料</span>
                </div>
                <div className={`p-2 rounded-lg text-center ${sensors.color ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-gray-800/50 border border-gray-700/30'}`}>
                  <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.color ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">色标</span>
                </div>
                <div className={`p-2 rounded-lg text-center ${sensors.material ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-gray-800/50 border border-gray-700/30'}`}>
                  <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.material ? 'bg-orange-400' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">物料</span>
                </div>
              </div>
            </div>
            
            {/* 磁性开关状态 */}
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-2">磁性开关</div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">上料气缸</span>
                  <div className="flex gap-2">
                    <span className={cylinders.feed.extended ? 'text-green-400' : 'text-gray-600'}>伸出</span>
                    <span className={!cylinders.feed.extended ? 'text-green-400' : 'text-gray-600'}>缩回</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">分拣1气缸</span>
                  <div className="flex gap-2">
                    <span className={cylinders.sorting1.extended ? 'text-green-400' : 'text-gray-600'}>伸出</span>
                    <span className={!cylinders.sorting1.extended ? 'text-green-400' : 'text-gray-600'}>缩回</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">分拣2气缸</span>
                  <div className="flex gap-2">
                    <span className={cylinders.sorting2.extended ? 'text-green-400' : 'text-gray-600'}>伸出</span>
                    <span className={!cylinders.sorting2.extended ? 'text-green-400' : 'text-gray-600'}>缩回</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 传送带状态 */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">传送带</span>
                <span className={conveyorRunning ? 'text-green-400' : 'text-gray-600'}>
                  {conveyorRunning ? '运行中' : '停止'}
                </span>
              </div>
            </div>
          </div>

          {/* 断开连接 */}
          <button
            onClick={onDisconnect}
            className="w-full py-2 px-4 rounded-lg bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700 transition-all"
          >
            断开连接
          </button>
        </>
      )}
    </div>
  );
};

export default SimPanel;
