import React from 'react';
import { useDeviceStore } from '../../stores';

// 状态机状态显示配置
const STATE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  IDLE: { label: '待机', icon: '⏸️', color: 'gray' },
  SPAWN: { label: '生成物料', icon: '📦', color: 'blue' },
  FEEDING: { label: '上料推出', icon: '↗️', color: 'green' },
  FEED_RETRACT: { label: '上料缩回', icon: '↙️', color: 'yellow' },
  TRANSIT: { label: '传送中', icon: '➡️', color: 'cyan' },
  SORTING1: { label: '分拣1推出', icon: '↗️', color: 'orange' },
  SORTING1_RETRACT: { label: '分拣1缩回', icon: '↙️', color: 'yellow' },
  SORTING2: { label: '分拣2推出', icon: '↗️', color: 'orange' },
  SORTING2_RETRACT: { label: '分拣2缩回', icon: '↙️', color: 'yellow' },
  COMPLETE: { label: '完成', icon: '✅', color: 'green' },
};

interface DemoPanelProps {
  demoState: string;
  isStarted: boolean;
  isPaused: boolean;
  onStart: () => void;
  onTogglePause: () => void;
  onReset: () => void;
}

export const DemoPanel: React.FC<DemoPanelProps> = ({ demoState, isStarted, isPaused, onStart, onTogglePause, onReset }) => {
  // 字段级选择器：避免整 store 订阅被物料位置等高频更新每帧触发重渲染
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const materialColor = useDeviceStore((s) => s.material.color);
  const sensors = useDeviceStore((s) => s.sensors);
  const feedExtended = useDeviceStore((s) => s.cylinders.feed.extended);
  const sorting1Extended = useDeviceStore((s) => s.cylinders.sorting1.extended);
  const sorting2Extended = useDeviceStore((s) => s.cylinders.sorting2.extended);

  const currentState = STATE_LABELS[demoState] || STATE_LABELS.IDLE;

  return (
    <div className="space-y-3">
      {/* 状态机状态 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">状态机</span>
          <span className={`status-badge ${
            currentState.color === 'green' ? 'status-badge-active' :
            currentState.color === 'blue' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
            currentState.color === 'orange' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
            currentState.color === 'cyan' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' :
            currentState.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
            'status-badge-inactive'
          }`}>
            <span className="mr-1">{currentState.icon}</span>
            {currentState.label}
          </span>
        </div>
        
        {/* 状态流程指示 */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className={demoState === 'IDLE' ? 'text-white' : ''}>待机</span>
          <span>→</span>
          <span className={['SPAWN', 'FEEDING', 'FEED_RETRACT'].includes(demoState) ? 'text-white' : ''}>上料</span>
          <span>→</span>
          <span className={demoState === 'TRANSIT' ? 'text-white' : ''}>传送</span>
          <span>→</span>
          <span className={['SORTING1', 'SORTING1_RETRACT', 'SORTING2', 'SORTING2_RETRACT'].includes(demoState) ? 'text-white' : ''}>分拣</span>
          <span>→</span>
          <span className={demoState === 'COMPLETE' ? 'text-white' : ''}>完成</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="device-card">
        <div className="flex gap-2">
          <button
            onClick={onStart}
            disabled={isStarted && !isPaused}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              isStarted && !isPaused
                ? 'bg-gray-600/30 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 text-white shadow-lg shadow-green-500/30 hover:bg-green-600'
            }`}
          >
            ▶ 启动
          </button>
          <button
            onClick={onTogglePause}
            disabled={!isStarted}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              !isStarted
                ? 'bg-gray-600/30 text-gray-500 cursor-not-allowed'
                : isPaused
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30'
            }`}
          >
            {isPaused ? '▶ 继续' : '⏸ 暂停'}
          </button>
          <button
            onClick={onReset}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
          >
            ⟲ 复位
          </button>
        </div>
      </div>

      {/* 运行状态 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">运行状态</span>
          <span className={`status-badge ${conveyorRunning ? 'status-badge-active pulse-indicator' : 'status-badge-inactive'}`}>
            {conveyorRunning ? '运行中' : '已停止'}
          </span>
        </div>

        {/* 物料信息 */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400">当前物料</span>
          <span className={`status-badge ${materialVisible ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {materialVisible ? (
              <>
                <span className={`w-2 h-2 rounded-full mr-1 ${materialColor === 'blue' ? 'bg-blue-400' : 'bg-gray-800'}`}></span>
                {materialColor === 'blue' ? '蓝色' : '黑色'}
              </>
            ) : '无物料'}
          </span>
        </div>

        {/* 传感器状态 */}
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">传感器</div>
          <div className="grid grid-cols-3 gap-2">
            <div className={`
              p-2 rounded-lg text-center transition-all duration-300
              ${sensors.feed 
                ? 'bg-green-500/10 border border-green-500/30' 
                : 'bg-gray-800/50 border border-gray-700/30'
              }
            `}>
              <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.feed ? 'bg-green-400' : 'bg-gray-600'}`}></div>
              <span className="text-xs text-gray-400">上料</span>
            </div>
            <div className={`
              p-2 rounded-lg text-center transition-all duration-300
              ${sensors.color 
                ? 'bg-blue-500/10 border border-blue-500/30' 
                : 'bg-gray-800/50 border border-gray-700/30'
              }
            `}>
              <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.color ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
              <span className="text-xs text-gray-400">色标</span>
            </div>
            <div className={`
              p-2 rounded-lg text-center transition-all duration-300
              ${sensors.material 
                ? 'bg-orange-500/10 border border-orange-500/30' 
                : 'bg-gray-800/50 border border-gray-700/30'
              }
            `}>
              <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${sensors.material ? 'bg-orange-400' : 'bg-gray-600'}`}></div>
              <span className="text-xs text-gray-400">物料</span>
            </div>
          </div>
        </div>

        {/* 气缸状态 */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">气缸状态</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400">上料气缸</span>
              <div className="flex gap-3">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${feedExtended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">伸出</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${!feedExtended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">缩回</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400">分拣1气缸</span>
              <div className="flex gap-3">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${sorting1Extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">伸出</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${!sorting1Extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">缩回</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400">分拣2气缸</span>
              <div className="flex gap-3">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${sorting2Extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">伸出</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${!sorting2Extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                  <span className="text-xs text-gray-500">缩回</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 分拣逻辑说明 */}
      <div className="device-card">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">分拣逻辑</div>
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-gray-800"></span>
            <span>黑色物料 → 色标传感器触发 → 分拣1推出</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-400"></span>
            <span>蓝色物料 → 色标传感器不触发 → 分拣2推出</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoPanel;
