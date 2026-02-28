import React from 'react';
import { Panel, StatusIndicator } from '../ui';
import { useDeviceStore } from '../../stores';

export const StatusPanel: React.FC = () => {
  const { sensors, cylinders, conveyorRunning } = useDeviceStore();

  return (
    <div className="device-card mt-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-200">设备状态</span>
        <span className={`status-badge ${conveyorRunning ? 'status-badge-active pulse-indicator' : 'status-badge-inactive'}`}>
          {conveyorRunning ? '系统运行' : '系统待机'}
        </span>
      </div>

      {/* 传感器状态 */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">传感器信号</div>
        <div className="grid grid-cols-3 gap-2">
          <div className={`
            p-2 rounded-lg text-center transition-all duration-300
            ${sensors.feed 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-gray-800/50 border border-gray-700/30'
            }
          `}>
            <div className={`w-3 h-3 rounded-full mx-auto mb-1 transition-all duration-300
              ${sensors.feed ? 'bg-green-400 glow-green pulse-indicator' : 'bg-gray-600'}
            `}></div>
            <span className="text-xs text-gray-400">上料</span>
          </div>
          <div className={`
            p-2 rounded-lg text-center transition-all duration-300
            ${sensors.color 
              ? 'bg-blue-500/10 border border-blue-500/30' 
              : 'bg-gray-800/50 border border-gray-700/30'
            }
          `}>
            <div className={`w-3 h-3 rounded-full mx-auto mb-1 transition-all duration-300
              ${sensors.color ? 'bg-blue-400 glow' : 'bg-gray-600'}
            `}></div>
            <span className="text-xs text-gray-400">色标</span>
          </div>
          <div className={`
            p-2 rounded-lg text-center transition-all duration-300
            ${sensors.material 
              ? 'bg-orange-500/10 border border-orange-500/30' 
              : 'bg-gray-800/50 border border-gray-700/30'
            }
          `}>
            <div className={`w-3 h-3 rounded-full mx-auto mb-1 transition-all duration-300
              ${sensors.material ? 'bg-orange-400 glow-orange pulse-indicator-orange' : 'bg-gray-600'}
            `}></div>
            <span className="text-xs text-gray-400">物料</span>
          </div>
        </div>
      </div>

      {/* 磁性开关状态 */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">磁性开关</div>
        <div className="space-y-2">
          {/* 上料气缸 */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-400">上料气缸</span>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${cylinders.feed.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">伸出</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${!cylinders.feed.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">缩回</span>
              </div>
            </div>
          </div>
          
          {/* 分拣1气缸 */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-400">分拣1气缸</span>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${cylinders.sorting1.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">伸出</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${!cylinders.sorting1.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">缩回</span>
              </div>
            </div>
          </div>
          
          {/* 分拣2气缸 */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-400">分拣2气缸</span>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${cylinders.sorting2.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">伸出</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${!cylinders.sorting2.extended ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-500">缩回</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusPanel;