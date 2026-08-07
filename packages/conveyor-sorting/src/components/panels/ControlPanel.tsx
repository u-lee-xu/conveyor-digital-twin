import React from 'react';
import { Button } from '@digital-twin/shared';
import { useDeviceStore } from '../../stores';
import type { CylinderName } from '../../types';
import { CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT } from '../scene/shared';

function cylinderPct(extension: number, extendPos: number) {
  const span = extendPos - CYLINDER_RETRACT_POS;
  const pct = ((extension - CYLINDER_RETRACT_POS) / span) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/** 气缸伸出进度条（与气动机械手风格统一） */
function CylinderProgress({ name, extendPos }: { name: CylinderName; extendPos: number }) {
  const currentExtension = useDeviceStore((s) => s.cylinders[name].currentExtension);
  const pct = cylinderPct(currentExtension, extendPos);

  return (
    <div className="progress-bar flex-1">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface ControlPanelProps {
  isMobile?: boolean;
  onPanelClose?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ isMobile = false, onPanelClose }) => {
  // 字段级选择器：避免整 store 订阅被物料位置等高频更新每帧触发重渲染
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const feedExtended = useDeviceStore((s) => s.cylinders.feed.extended);
  const sorting1Extended = useDeviceStore((s) => s.cylinders.sorting1.extended);
  const sorting2Extended = useDeviceStore((s) => s.cylinders.sorting2.extended);
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const signalTower = useDeviceStore((s) => s.signalTower);
  const startConveyor = useDeviceStore((s) => s.startConveyor);
  const stopConveyor = useDeviceStore((s) => s.stopConveyor);
  const extendCylinder = useDeviceStore((s) => s.extendCylinder);
  const retractCylinder = useDeviceStore((s) => s.retractCylinder);
  const spawnMaterial = useDeviceStore((s) => s.spawnMaterial);
  const clearMaterial = useDeviceStore((s) => s.clearMaterial);
  const setSignalTower = useDeviceStore((s) => s.setSignalTower);

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
            <span className={`status-badge ${feedExtended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {feedExtended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('feed')}
              variant={feedExtended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('feed')}
              variant={!feedExtended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
          <div className="mt-2">
            <CylinderProgress name="feed" extendPos={CYLINDER_EXTEND_POS_FEED} />
          </div>
        </div>

        {/* 分拣1气缸 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-300">分拣1</span>
            <span className={`status-badge ${sorting1Extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {sorting1Extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('sorting1')}
              variant={sorting1Extended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('sorting1')}
              variant={!sorting1Extended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
          <div className="mt-2">
            <CylinderProgress name="sorting1" extendPos={CYLINDER_EXTEND_POS_SORT} />
          </div>
        </div>

        {/* 分拣2气缸 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-300">分拣2</span>
            <span className={`status-badge ${sorting2Extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
              {sorting2Extended ? '伸出' : '缩回'}
            </span>
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={() => extendCylinder('sorting2')}
              variant={sorting2Extended ? 'primary' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift"
            >
              ↗ 伸出
            </Button>
            <Button 
              onClick={() => retractCylinder('sorting2')}
              variant={!sorting2Extended ? 'warning' : 'default'}
              size="sm"
              className="flex-1 btn-hover-lift text-white"
            >
              ↙ 缩回
            </Button>
          </div>
          <div className="mt-2">
            <CylinderProgress name="sorting2" extendPos={CYLINDER_EXTEND_POS_SORT} />
          </div>
        </div>
      </div>

      {/* 物料控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">物料</span>
          <span className={`status-badge ${materialVisible ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {materialVisible ? '已生成' : '无物料'}
          </span>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={spawnMaterial}
            variant={materialVisible ? 'default' : 'success'}
            size="md"
            className="flex-1 btn-hover-lift"
            glow
          >
            📦 生成
          </Button>
          <Button 
            onClick={clearMaterial}
            variant={materialVisible ? 'danger' : 'default'}
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
            <button
              className={`btn btn-sm ${signalTower.red ? 'btn-danger' : 'btn-outline'} touch-manipulation`}
              onClick={() => setSignalTower({ red: !signalTower.red })}
              aria-label="红灯指示灯"
            >
              {signalTower.red ? '熄灭' : '点亮'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${signalTower.yellow ? 'bg-yellow-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">黄灯</span>
            </div>
            <button
              className={`btn btn-sm ${signalTower.yellow ? 'btn-warning' : 'btn-outline'} touch-manipulation`}
              onClick={() => setSignalTower({ yellow: !signalTower.yellow })}
              aria-label="黄灯指示灯"
            >
              {signalTower.yellow ? '熄灭' : '点亮'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${signalTower.green ? 'bg-green-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">绿灯</span>
            </div>
            <button
              className={`btn btn-sm ${signalTower.green ? 'btn-success' : 'btn-outline'} touch-manipulation`}
              onClick={() => setSignalTower({ green: !signalTower.green })}
              aria-label="绿灯指示灯"
            >
              {signalTower.green ? '熄灭' : '点亮'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;