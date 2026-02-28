import React from 'react';
import { Panel, Button } from '../ui';
import { useDeviceStore } from '../../stores';

export const ControlPanel: React.FC = () => {
  const {
    conveyorRunning,
    cylinders,
    material,
    startConveyor,
    stopConveyor,
    extendCylinder,
    retractCylinder,
    spawnMaterial,
    clearMaterial,
  } = useDeviceStore();

  return (
    <div className="space-y-3">
      {/* 传送带控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">传送带</span>
          <span className={`status-badge ${conveyorRunning ? 'status-badge-active' : 'status-badge-inactive'}`}>
            <span className={`w-2 h-2 rounded-full ${conveyorRunning ? 'bg-green-400' : 'bg-gray-500'}`}></span>
            {conveyorRunning ? '运行中' : '已停止'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={startConveyor} 
            variant={conveyorRunning ? 'success' : 'default'}
            size="sm"
            className="flex-1 btn-hover-lift"
          >
            ▶ 启动
          </Button>
          <Button 
            onClick={stopConveyor} 
            variant={!conveyorRunning ? 'danger' : 'default'}
            size="sm"
            className="flex-1 btn-hover-lift"
          >
            ◼ 停止
          </Button>
        </div>
      </div>

      {/* 气缸控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">气缸控制</span>
        </div>
        
        {/* 上料气缸 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">上料气缸</span>
            <span className={`status-badge ${cylinders.feed.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.feed.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-2">
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
              className="flex-1 btn-hover-lift"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>

        {/* 分拣1气缸 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">分拣1气缸</span>
            <span className={`status-badge ${cylinders.sorting1.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.sorting1.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-2">
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
              className="flex-1 btn-hover-lift"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>

        {/* 分拣2气缸 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">分拣2气缸</span>
            <span className={`status-badge ${cylinders.sorting2.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {cylinders.sorting2.extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-2">
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
              className="flex-1 btn-hover-lift"
            >
              ↙ 缩回
            </Button>
          </div>
        </div>
      </div>

      {/* 物料控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">物料</span>
          <span className={`status-badge ${material.visible ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {material.visible ? '已生成' : '无物料'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={spawnMaterial}
            variant={material.visible ? 'default' : 'success'}
            size="sm"
            className="flex-1 btn-hover-lift"
          >
            📦 生成
          </Button>
          <Button 
            onClick={clearMaterial}
            variant={material.visible ? 'danger' : 'default'}
            size="sm"
            className="flex-1 btn-hover-lift"
          >
            🗑 清除
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;