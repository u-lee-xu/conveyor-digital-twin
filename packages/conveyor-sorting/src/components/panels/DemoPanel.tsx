import React from 'react';
import { useDeviceStore } from '../../stores';

/** 状态机状态：label 用中文，badge 用统一的紧凑状态标签配色 */
const STATE_LABELS: Record<string, { label: string; badge: string }> = {
  IDLE: { label: '待机', badge: 'badge-slate' },
  SPAWN: { label: '生成物料', badge: 'badge-blue' },
  FEEDING: { label: '上料推出', badge: 'badge-green' },
  FEED_RETRACT: { label: '上料缩回', badge: 'badge-yellow' },
  TRANSIT: { label: '传送中', badge: 'badge-blue' },
  SORTING1: { label: '分拣1推出', badge: 'badge-yellow' },
  SORTING1_RETRACT: { label: '分拣1缩回', badge: 'badge-yellow' },
  SORTING2: { label: '分拣2推出', badge: 'badge-yellow' },
  SORTING2_RETRACT: { label: '分拣2缩回', badge: 'badge-yellow' },
  COMPLETE: { label: '完成', badge: 'badge-green' },
};

function IOLed({ label, active, addr }: { label: string; active: boolean; addr?: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 min-w-0" title={addr} style={{ fontSize: '0.62rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <span className={`truncate ${active ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

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

  const steps = [
    { label: '待机', active: demoState === 'IDLE' },
    { label: '上料', active: ['SPAWN', 'FEEDING', 'FEED_RETRACT'].includes(demoState) },
    { label: '传送', active: demoState === 'TRANSIT' },
    { label: '分拣', active: ['SORTING1', 'SORTING1_RETRACT', 'SORTING2', 'SORTING2_RETRACT'].includes(demoState) },
    { label: '完成', active: demoState === 'COMPLETE' },
  ];

  return (
    <div className="space-y-2">
      <div className="card">
        <div className="section-title !mb-1">演示状态机</div>
        <div className="flex items-center justify-between mb-2">
          <span className={`badge ${currentState.badge}`}>{currentState.label}</span>
          <div className="step-list">
            {steps.map((s) => (
              <span key={s.label} className={`step-item ${s.active ? 'step-item-active' : ''}`}>
                <span className={`step-dot ${s.active ? 'step-dot-active' : ''}`} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-success flex-1 touch-manipulation"
            onClick={onStart}
            disabled={isStarted && !isPaused}
          >
            ▶ 启动
          </button>
          <button
            className={`btn btn-sm flex-1 touch-manipulation ${isPaused ? 'btn-success' : 'btn-warning'}`}
            onClick={onTogglePause}
            disabled={!isStarted}
          >
            {isPaused ? '▶ 继续' : '⏸ 暂停'}
          </button>
          <button className="btn btn-sm btn-danger flex-1 touch-manipulation" onClick={onReset}>
            ⟲ 复位
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">运行状态</div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className={`badge ${conveyorRunning ? 'badge-green' : 'badge-slate'}`}>
            {conveyorRunning ? '运行中' : '已停止'}
          </span>
          <span className={`badge ${materialVisible ? 'badge-blue' : 'badge-slate'}`}>
            {materialVisible ? (materialColor === 'blue' ? '蓝色物料' : '黑色物料') : '无物料'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-1 mb-2">
          <IOLed label="上料" active={sensors.feed} addr="M8" />
          <IOLed label="色标" active={sensors.color} addr="M9" />
          <IOLed label="物料" active={sensors.material} addr="M10" />
        </div>
        <div className="grid grid-cols-3 gap-x-1">
          <IOLed label="上料缸前" active={feedExtended} addr="M3" />
          <IOLed label="分拣1前" active={sorting1Extended} addr="M5" />
          <IOLed label="分拣2前" active={sorting2Extended} addr="M7" />
          <IOLed label="上料缸后" active={!feedExtended} addr="M2" />
          <IOLed label="分拣1后" active={!sorting1Extended} addr="M4" />
          <IOLed label="分拣2后" active={!sorting2Extended} addr="M6" />
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">分拣逻辑</div>
        <div className="text-[0.62rem] text-slate-400 space-y-1">
          <div>黑色物料 → 色标传感器触发 → 分拣1推出</div>
          <div>蓝色物料 → 色标传感器不触发 → 分拣2推出</div>
        </div>
      </div>
    </div>
  );
};

export default DemoPanel;
