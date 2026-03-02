import React, { useState } from 'react';
import { useDeviceStore } from '../../stores';
import type { CalibrateStep, CalibratePhase, CalibrateRound, CalibrationData, MaterialColor } from '../../hooks/useSyncMode';

// 检测结果记录
interface DetectionRecord {
  timestamp: number;
  color: MaterialColor;
  sortedBy: 'sorting1' | 'sorting2';
}

// 预设MQTT服务器
const MQTT_PRESETS = [
  { name: 'EMQX 公共服务器', host: 'broker.emqx.io', port: 1883 },
  { name: 'Eclipse Mosquitto', host: 'test.mosquitto.org', port: 1883 },
  { name: 'HiveMQ 公共服务器', host: 'broker.hivemq.com', port: 1883 },
  { name: '自定义服务器', host: '', port: 1883 },
];

interface SyncPanelProps {
  step: CalibrateStep;
  phase: CalibratePhase;
  round: CalibrateRound;
  currentMaterialColor: MaterialColor;
  mqttConfig: {
    host: string;
    port: number;
    topic: string;
  };
  calibration: CalibrationData;
  detectionHistory: DetectionRecord[];
  onConnect: (host: string, port: number, topic: string) => void;
  onStartCalibrate: () => void;
  onPlaceMaterial: () => void;
  onNextRound: () => void;
  onResetCalibrate: () => void;
  onStartSync: () => void;
  onDisconnect: () => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({
  step,
  phase,
  round,
  currentMaterialColor,
  mqttConfig,
  calibration,
  detectionHistory,
  onConnect,
  onStartCalibrate,
  onPlaceMaterial,
  onNextRound,
  onResetCalibrate,
  onStartSync,
  onDisconnect,
}) => {
  const [host, setHost] = useState(mqttConfig.host);
  const [port, setPort] = useState(mqttConfig.port.toString());
  const [topic, setTopic] = useState(mqttConfig.topic);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const { sensors, conveyorRunning } = useDeviceStore();

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

  // 获取校准阶段进度
  const getProgress = () => {
    if (round === 1) {
      switch (phase) {
        case 'WAIT_MATERIAL': return 0;
        case 'DETECT_FEED': return 16;
        case 'DETECT_COLOR': return 33;
        case 'SORTING': return 45;
        case 'COMPLETE': return 50;
        default: return 0;
      }
    } else {
      switch (phase) {
        case 'WAIT_MATERIAL': return 50;
        case 'DETECT_MATERIAL': return 66;
        case 'SORTING': return 83;
        case 'COMPLETE': return 100;
        default: return 50;
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* MQTT连接配置 */}
      {step === 'IDLE' && (
        <div className="device-card">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">MQTT 连接配置</div>
          
          <div className="space-y-3">
            {/* 服务器选择 */}
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
                placeholder="digital-twin/user1"
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <button
              onClick={handleConnect}
              className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all"
            >
              连接 MQTT
            </button>
            
            {/* 帮助按钮 */}
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-full py-2 px-4 rounded-lg bg-gray-700/30 text-gray-400 text-sm hover:bg-gray-700/50 transition-all flex items-center justify-center gap-2"
            >
              <span>?</span>
              <span>MQTT 配置说明</span>
              <span className={`transform transition-transform ${showHelp ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {/* 帮助说明面板 */}
            {showHelp && (
              <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-3">
                <div className="text-xs text-gray-400 font-medium">连接信息</div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">WebSocket 地址:</span>
                    <code className="text-xs text-cyan-400 bg-gray-900/50 px-2 py-1 rounded">{wsUrl}</code>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">订阅主题:</span>
                    <code className="text-xs text-cyan-400 bg-gray-900/50 px-2 py-1 rounded">{topic}/#</code>
                  </div>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">消息格式</div>
                  
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">传感器状态:</div>
                      <code className="text-xs text-green-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        {`{"type":"sensor","name":"feed","value":true}`}
                      </code>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-500 mb-1">气缸控制:</div>
                      <code className="text-xs text-yellow-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        {`{"type":"cylinder","name":"sorting1","value":true}`}
                      </code>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-500 mb-1">传送带控制:</div>
                      <code className="text-xs text-blue-400 bg-gray-900/50 px-2 py-1 rounded block overflow-x-auto">
                        {`{"type":"conveyor","name":"main","value":true}`}
                      </code>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="text-xs text-gray-400 font-medium mb-2">主题列表</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">传感器:</span>
                      <code className="text-cyan-400">{topic}/sensors</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">气缸:</span>
                      <code className="text-cyan-400">{topic}/cylinders</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">传送带:</span>
                      <code className="text-cyan-400">{topic}/conveyor</code>
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
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mr-3"></div>
            <span className="text-gray-400">正在连接...</span>
          </div>
        </div>
      )}

      {/* 已连接 - 校准引导 */}
      {(step === 'CONNECTED' || step === 'CALIBRATING') && (
        <>
          {/* 连接状态 */}
          <div className="device-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-200">MQTT 状态</span>
              <span className="status-badge status-badge-active pulse-indicator">
                已连接
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">服务器:</span>
                <code className="text-cyan-400">{mqttConfig.host}:{mqttConfig.port}</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">WebSocket:</span>
                <code className="text-cyan-400">{wsProtocol}://{mqttConfig.host}:{mqttConfig.port === 1883 ? 8083 : mqttConfig.port === 8883 ? 8084 : mqttConfig.port}/mqtt</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">主题前缀:</span>
                <code className="text-cyan-400">{mqttConfig.topic}</code>
              </div>
            </div>
          </div>

          {/* 校准引导 - 初始 */}
          {step === 'CONNECTED' && (
            <div className="device-card">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">校准引导</div>
              <div className="text-sm text-gray-300 mb-4">
                同步模式需要先校准传送带速度，请准备<span className="text-white font-medium">黑色</span>和<span className="text-blue-400 font-medium">蓝色</span>物料各1个进行校准。
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                <div className="text-xs text-amber-400">
                  校准流程：第1轮用黑色物料，第2轮用蓝色物料
                </div>
              </div>
              <button
                onClick={onStartCalibrate}
                className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-600 transition-all"
              >
                开始校准
              </button>
            </div>
          )}

          {/* 校准进行中 */}
          {step === 'CALIBRATING' && (
            <div className="device-card">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                校准进行中 - 第{round}轮
              </div>
              
              {/* 轮次指示 */}
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex-1 h-2 rounded-full ${round >= 1 ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gray-700'}`}></div>
                <div className={`flex-1 h-2 rounded-full ${round >= 2 ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gray-700'}`}></div>
              </div>
              
              {/* 校准进度条 */}
              <div className="mb-4">
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${getProgress()}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>第1轮(黑色)</span>
                  <span>第2轮(蓝色)</span>
                </div>
              </div>

              {/* 当前轮次物料提示 */}
              <div className={`p-3 rounded-lg mb-4 ${
                round === 1 
                  ? 'bg-gray-500/10 border border-gray-500/30' 
                  : 'bg-blue-500/10 border border-blue-500/30'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${
                    round === 1 ? 'bg-gray-600' : 'bg-blue-500'
                  }`}></div>
                  <span className={`text-sm font-medium ${
                    round === 1 ? 'text-gray-300' : 'text-blue-300'
                  }`}>
                    第{round}轮：请使用<span className="font-bold">{round === 1 ? '黑色' : '蓝色'}</span>物料
                  </span>
                </div>
              </div>

              {/* 当前阶段提示 */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-4">
                <div className="text-sm text-blue-400">
                  {round === 1 && (
                    <>
                      {phase === 'WAIT_MATERIAL' && '请在物料台放入黑色物料，然后点击"已放入物料"按钮'}
                      {phase === 'DETECT_FEED' && '正在等待上料传感器检测...'}
                      {phase === 'DETECT_COLOR' && '检测到物料！正在等待色标传感器...'}
                      {phase === 'SORTING' && '色标传感器触发（黑色物料），分拣1即将动作...'}
                      {phase === 'COMPLETE' && '第1轮完成！请点击"开始第2轮"'}
                    </>
                  )}
                  {round === 2 && (
                    <>
                      {phase === 'WAIT_MATERIAL' && '请在物料台放入蓝色物料，然后点击"已放入物料"按钮'}
                      {phase === 'DETECT_MATERIAL' && '检测到物料！正在等待物料传感器...'}
                      {phase === 'SORTING' && '物料传感器触发，分拣2即将动作...'}
                      {phase === 'COMPLETE' && '校准完成！'}
                    </>
                  )}
                </div>
              </div>

              {/* 检测到的物料颜色 */}
              {currentMaterialColor !== 'unknown' && (
                <div className={`p-2 rounded-lg mb-4 flex items-center gap-2 ${
                  currentMaterialColor === 'black' 
                    ? 'bg-gray-500/20 border border-gray-500/30' 
                    : 'bg-blue-500/20 border border-blue-500/30'
                }`}>
                  <div className={`w-3 h-3 rounded ${
                    currentMaterialColor === 'black' ? 'bg-gray-600' : 'bg-blue-500'
                  }`}></div>
                  <span className="text-xs text-gray-300">
                    检测到：{currentMaterialColor === 'black' ? '黑色物料' : '蓝色物料'}
                  </span>
                </div>
              )}

              {/* 传感器实时状态 */}
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">传感器状态</div>
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

              {/* 操作按钮 */}
              {phase === 'WAIT_MATERIAL' && (
                <button
                  onClick={onPlaceMaterial}
                  className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-600 transition-all"
                >
                  已放入物料
                </button>
              )}
              
              {round === 1 && phase === 'COMPLETE' && (
                <button
                  onClick={onNextRound}
                  className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all"
                >
                  开始第2轮
                </button>
              )}

              {/* 重新校准按钮 */}
              <button
                onClick={onResetCalibrate}
                className="w-full py-2 px-4 rounded-lg bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700 transition-all mt-2"
              >
                重新校准
              </button>
            </div>
          )}
        </>
      )}

      {/* 校准完成 / 同步运行中 */}
      {(step === 'CALIBRATED' || step === 'SYNCING') && (
        <>
          <div className="device-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-200">MQTT 状态</span>
              <span className={`status-badge ${step === 'SYNCING' ? 'status-badge-active pulse-indicator' : 'status-badge-inactive'}`}>
                {step === 'SYNCING' ? '同步中' : '已校准'}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">服务器:</span>
                <code className="text-cyan-400">{mqttConfig.host}:{mqttConfig.port}</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">WebSocket:</span>
                <code className="text-cyan-400">{wsProtocol}://{mqttConfig.host}:{mqttConfig.port === 1883 ? 8083 : mqttConfig.port === 8883 ? 8084 : mqttConfig.port}/mqtt</code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">主题前缀:</span>
                <code className="text-cyan-400">{mqttConfig.topic}</code>
              </div>
            </div>
          </div>

          {/* 校准结果 */}
          <div className="device-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">校准结果</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">第1段动画时间</span>
                <span className="text-lg font-medium text-green-400">
                  {calibration.phase1Time ? `${calibration.phase1Time} ms` : '未校准'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">第2段动画时间</span>
                <span className="text-lg font-medium text-blue-400">
                  {calibration.phase2Time ? `${calibration.phase2Time} ms` : '未校准'}
                </span>
              </div>
            </div>
            
            {/* 开始同步按钮 */}
            {step === 'CALIBRATED' && (
              <button
                onClick={onStartSync}
                className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all mt-4"
              >
                开始同步
              </button>
            )}
            
            {/* 重新校准按钮 */}
            <button
              onClick={onResetCalibrate}
              className="w-full py-2 px-4 rounded-lg bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700 transition-all mt-2"
            >
              重新校准
            </button>
          </div>

          {/* 实时状态 */}
          <div className="device-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">实时状态</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">传送带</span>
                <span className={`status-badge ${conveyorRunning ? 'status-badge-active' : 'status-badge-inactive'}`}>
                  {conveyorRunning ? '运行' : '停止'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
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
          </div>

          {/* 检测历史记录 */}
          {step === 'SYNCING' && detectionHistory.length > 0 && (
            <div className="device-card">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">检测结果</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {detectionHistory.slice(-5).reverse().map((record, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${
                        record.color === 'black' ? 'bg-gray-600' : 'bg-blue-500'
                      }`}></div>
                      <span className="text-xs text-gray-300">
                        {record.color === 'black' ? '黑色' : '蓝色'}物料
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      分拣{record.sortedBy === 'sorting1' ? '1' : '2'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

export default SyncPanel;