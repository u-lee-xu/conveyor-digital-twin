import React from 'react';
import { Button } from '@digital-twin/shared';
import { useDeviceStore } from '../../stores';

interface ControlPanelProps {
  isMobile?: boolean;
  onPanelClose?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ isMobile = false, onPanelClose }) => {
  const {
    conveyorRunning,
    cylinders,
    material,
    signalTower,
    startConveyor,
    stopConveyor,
    extendCylinder,
    retractCylinder,
    spawnMaterial,
    clearMaterial,
    setSignalTower,
  } = useDeviceStore();

  return (
    <div className="space-y-3">
      {/* 移动端关闭按钮 */}
      {isMobile && onPanelClose && (
        <Button
          onClick={onPanelClose}
          variant="default"
          size="sm"
          className="w-full mb-4"
        >
          ▼ 关闭面板
        </Button>
      )}

      {/* 传送带控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">传送带</span>
          <span className={`status-badge ${conveyorRunning ? 'status-badge-active' : 'status-badge-inactive'}`}>
            <span className={`w-2 h-2 rounded-full ${conveyorRunning ? 'bg-green-400' : 'bg-gray-500'}`}></span>
            {conveyorRunning ? '运行中' : '已停止'}
          </span>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={startConveyor} 
            variant={conveyorRunning ? 'success' : 'default'}
            size="md"
            className="flex-1 btn-hover-lift text-white"
            glow
          >
            ▶ 启动
          </Button>
          <Button 
            onClick={stopConveyor} 
            variant="danger"
            size="md"
            className="flex-1 btn-hover-lift"
            glow
          >
            ◼ 停止
          </Button>
        </div>
      </div>

      {/* 气缸控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">气缸控制</span>
        </div>
        
        {/* 上料气缸 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-300">上料气缸</span>
            <span className={`status-badge ${cylinders.feed.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.feed.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('feed')}
              variant={cylinders.feed.extended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('feed')}
              variant={!cylinders.feed.extended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>

        {/* 分拣1气缸 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-300">分拣1</span>
            <span className={`status-badge ${cylinders.sorting1.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.sorting1.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('sorting1')}
              variant={cylinders.sorting1.extended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('sorting1')}
              variant={!cylinders.sorting1.extended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>

        {/* 分拣2气缸 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-300">分拣2</span>
            <span className={`status-badge ${cylinders.sorting2.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.sorting2.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('sorting2')}
              variant={cylinders.sorting2.extended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('sorting2')}
              variant={!cylinders.sorting2.extended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>
      </div>

      {/* 物料控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">物料</span>
          <span className={`status-badge ${material.visible ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {material.visible ? '已生成' : '无物料'}
          </span>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={spawnMaterial}
            variant={material.visible ? 'default' : 'success'}
            size="md"
            className="flex-1 btn-hover-lift"
            glow
          >
            📦 生成
          </Button>
          <Button 
            onClick={clearMaterial}
            variant={material.visible ? 'danger' : 'default'}
            size="md"
            className="flex-1 btn-hover-lift"
            glow
          >
            🗑 清除
          </Button>
        </div>
      </div>

      {/* 三色灯塔控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">三色灯塔</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${signalTower.red ? 'bg-red-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">红灯</span>
            </div>
            <Button
              onClick={() => setSignalTower({ red: !signalTower.red })}
              variant={signalTower.red ? 'danger' : 'default'}
              size="sm"
            >
              {signalTower.red ? '熄灭' : '点亮'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${signalTower.yellow ? 'bg-yellow-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">黄灯</span>
            </div>
            <Button
              onClick={() => setSignalTower({ yellow: !signalTower.yellow })}
              variant={signalTower.yellow ? 'warning' : 'default'}
              size="sm"
              className="text-white"
            >
              {signalTower.yellow ? '熄灭' : '点亮'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${signalTower.green ? 'bg-green-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">绿灯</span>
            </div>
            <Button
              onClick={() => setSignalTower({ green: !signalTower.green })}
              variant={signalTower.green ? 'success' : 'default'}
              size="sm"
            >
              {signalTower.green ? '熄灭' : '点亮'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;