import React from 'react';
import { useDeviceStore } from '../../stores';
import type { CylinderName } from '../../types';
import { CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT } from '../scene/shared';

function cylinderPct(extension: number, extendPos: number) {
  const span = extendPos - CYLINDER_RETRACT_POS;
  const pct = ((extension - CYLINDER_RETRACT_POS) / span) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/** 气缸伸出进度条（与自动配药 DispenseControlPanel 同款） */
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

/**
 * 手动控制面板：与自动配药手动面板同款组件语言——
 * device-card 分组 + badge 状态 + 原生 btn + progress-bar + io-led，
 * 不再使用共享 Button 组件的霓虹发光效果。
 */
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

  const cylinders: { key: CylinderName; label: string; extended: boolean; extendPos: number }[] = [
    { key: 'feed', label: '上料气缸', extended: feedExtended, extendPos: CYLINDER_EXTEND_POS_FEED },
    { key: 'sorting1', label: '分拣1', extended: sorting1Extended, extendPos: CYLINDER_EXTEND_POS_SORT },
    { key: 'sorting2', label: '分拣2', extended: sorting2Extended, extendPos: CYLINDER_EXTEND_POS_SORT },
  ];

  const lamps: { key: string; label: string; on: boolean; variant: string; dot: string; toggle: () => void }[] = [
    { key: 'red', label: '红灯', on: signalTower.red, variant: 'btn-danger', dot: 'bg-red-500', toggle: () => setSignalTower({ red: !signalTower.red }) },
    { key: 'yellow', label: '黄灯', on: signalTower.yellow, variant: 'btn-warning', dot: 'bg-yellow-500', toggle: () => setSignalTower({ yellow: !signalTower.yellow }) },
    { key: 'green', label: '绿灯', on: signalTower.green, variant: 'btn-success', dot: 'bg-green-500', toggle: () => setSignalTower({ green: !signalTower.green }) },
  ];

  return (
    <div className="space-y-3">
      {isMobile && onPanelClose && (
        <button
          className="btn btn-xs btn-outline w-full touch-manipulation"
          onClick={onPanelClose}
        >
          ▼ 关闭面板
        </button>
      )}

      {/* 传送带控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">传送带</span>
          <span className={`badge ${conveyorRunning ? 'badge-green' : 'badge-slate'}`}>
            {conveyorRunning ? '运行中' : '已停止'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn btn-sm flex-1 touch-manipulation ${conveyorRunning ? 'btn-success' : 'btn-outline'}`}
            onClick={startConveyor}
          >
            ▶ 启动
          </button>
          <button
            className="btn btn-sm btn-danger flex-1 touch-manipulation"
            onClick={stopConveyor}
          >
            ◼ 停止
          </button>
        </div>
      </div>

      {/* 气缸控制 */}
      <div className="device-card">
        <div className="section-title !mb-3">气缸控制</div>
        <div className="space-y-4">
          {cylinders.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-300">{c.label}</span>
                <span className={`badge ${c.extended ? 'badge-green' : 'badge-slate'}`}>
                  {c.extended ? '伸出' : '缩回'}
                </span>
              </div>
              <div className="flex gap-2 mb-2">
                <button
                  className={`btn btn-xs flex-1 touch-manipulation ${c.extended ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => extendCylinder(c.key)}
                >
                  ↗ 伸出
                </button>
                <button
                  className={`btn btn-xs flex-1 touch-manipulation ${!c.extended ? 'btn-warning' : 'btn-outline'}`}
                  style={{ color: '#fff' }}
                  onClick={() => retractCylinder(c.key)}
                >
                  ↙ 缩回
                </button>
              </div>
              <CylinderProgress name={c.key} extendPos={c.extendPos} />
            </div>
          ))}
        </div>
      </div>

      {/* 物料控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">物料</span>
          <span className={`badge ${materialVisible ? 'badge-green' : 'badge-slate'}`}>
            {materialVisible ? '已生成' : '无物料'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-success flex-1 touch-manipulation"
            onClick={spawnMaterial}
          >
            📦 生成
          </button>
          <button
            className="btn btn-sm btn-danger flex-1 touch-manipulation"
            onClick={clearMaterial}
          >
            🗑 清除
          </button>
        </div>
      </div>

      {/* 三色灯塔 */}
      <div className="device-card">
        <div className="section-title !mb-3">三色灯塔</div>
        <div className="space-y-2">
          {lamps.map((l) => (
            <div key={l.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${l.on ? l.dot : 'bg-gray-600'}`} />
                <span className="text-xs font-medium text-gray-300">{l.label}</span>
              </div>
              <button
                className={`btn btn-xs ${l.on ? l.variant : 'btn-outline'} touch-manipulation`}
                onClick={l.toggle}
                aria-label={`${l.label}指示灯`}
              >
                {l.on ? '熄灭' : '点亮'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
