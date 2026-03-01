import React, { useState } from 'react';
import { useDeviceStore } from '../../stores';

// 校准步骤
type CalibrateStep = 
  | 'IDLE'           // 等待连接
  | 'CONNECTING'     // 连接中
  | 'CONNECTED'      // 已连接，等待校准
  | 'CALIBRATING'    // 校准中
  | 'CALIBRATED'     // 校准完成
  | 'SYNCING';       // 同步运行中

// 校准阶段
type CalibratePhase = 
  | 'WAIT_MATERIAL'  // 等待放入物料
  | 'DETECT_FEED'    // 等待上料传感器
  | 'DETECT_COLOR'   // 等待色标传感器
  | 'DETECT_MATERIAL'// 等待物料传感器
  | 'COMPLETE';      // 本轮完成

interface SyncPanelProps {
  step: CalibrateStep;
  phase: CalibratePhase;
  mqttConfig: {
    host: string;
    port: number;
    topic: string;
  };
  calibration: {
    speed: number | null;
    phase1Time: number | null;
    phase2Time: number | null;
  };
  onConnect: (host: string, port: number, topic: string) => void;
  onStartCalibrate: () => void;
  onDisconnect: () => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({
  step,
  phase,
  mqttConfig,
  calibration,
  onConnect,
  onStartCalibrate,
  onDisconnect,
}) => {
  const [host, setHost] = useState(mqttConfig.host);
  const [port, setPort] = useState(mqttConfig.port.toString());
  const [topic, setTopic] = useState(mqttConfig.topic);

  const { sensors, conveyorRunning } = useDeviceStore();

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
            <div className="text-xs text-gray-500">
              {mqttConfig.host}:{mqttConfig.port}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              主题: {mqttConfig.topic}
            </div>
          </div>

          {/* 校准引导 */}
          {step === 'CONNECTED' && (
            <div className="device-card">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">校准引导</div>
              <div className="text-sm text-gray-300 mb-4">
                同步模式需要先校准传送带速度，请准备2个物料进行校准。
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
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">校准进行中</div>
              
              {/* 校准阶段指示 */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className={phase === 'WAIT_MATERIAL' ? 'text-white' : 'text-gray-500'}>等待物料</span>
                  <span className={phase === 'DETECT_FEED' ? 'text-white' : 'text-gray-500'}>上料检测</span>
                  <span className={phase === 'DETECT_COLOR' ? 'text-white' : 'text-gray-500'}>色标检测</span>
                  <span className={phase === 'DETECT_MATERIAL' ? 'text-white' : 'text-gray-500'}>物料检测</span>
                </div>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${(() => {
                      switch (phase) {
                        case 'WAIT_MATERIAL': return '0%';
                        case 'DETECT_FEED': return '25%';
                        case 'DETECT_COLOR': return '50%';
                        case 'DETECT_MATERIAL': return '75%';
                        case 'COMPLETE': return '100%';
                        default: return '0%';
                      }
                    })()}` }}
                  ></div>
                </div>
              </div>

              {/* 当前阶段提示 */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <div className="text-sm text-blue-400">
                  {phase === 'WAIT_MATERIAL' && '请在物料台放入物料，系统将自动检测'}
                  {phase === 'DETECT_FEED' && '正在等待上料传感器检测...'}
                  {phase === 'DETECT_COLOR' && '正在等待色标传感器检测...'}
                  {phase === 'DETECT_MATERIAL' && '正在等待物料传感器检测...'}
                  {phase === 'COMPLETE' && '本轮校准完成！'}
                </div>
              </div>

              {/* 传感器实时状态 */}
              <div className="mt-4">
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
              <span className="status-badge status-badge-active pulse-indicator">
                同步中
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {mqttConfig.host}:{mqttConfig.port}
            </div>
          </div>

          {/* 校准结果 */}
          <div className="device-card">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">校准结果</div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">传送带速度</span>
              <span className="text-lg font-medium text-cyan-400">
                {calibration.speed ? `${(calibration.speed * 100).toFixed(2)} m/s` : '未校准'}
              </span>
            </div>
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
