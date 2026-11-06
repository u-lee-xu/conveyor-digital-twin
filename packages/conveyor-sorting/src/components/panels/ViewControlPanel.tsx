import React from 'react';
import { useDeviceStore, useConveyorViewStore } from '../../stores';
import { VIEW_PRESETS, VIEW_BUTTONS } from '../../scenes/conveyor-sorting/constants';

/**
 * 可选的侧栏视图控制（默认由右上角 ConveyorViewSwitcher 承担）。
 * 保留为紧凑 card 版本，供平台壳 sidebarExtras 需要时直接挂载。
 */
export const ViewControlPanel: React.FC = () => {
  const showLabels = useDeviceStore((s) => s.showLabels);
  const toggleLabels = useDeviceStore((s) => s.toggleLabels);
  const activeView = useConveyorViewStore((s) => s.activeView);
  const setView = useConveyorViewStore((s) => s.setView);

  return (
    <div className="card mb-2">
      <div className="section-title !mb-2">视图控制</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {VIEW_BUTTONS.map((key) => (
          <button
            key={key}
            className={`btn btn-xs touch-manipulation ${activeView === key ? 'btn-primary' : 'btn-outline'}`}
            title={VIEW_PRESETS[key].desc}
            onClick={() => setView(key)}
          >
            {VIEW_PRESETS[key].label}
          </button>
        ))}
      </div>
      <button
        className={`btn btn-xs w-full touch-manipulation ${showLabels ? 'btn-primary' : 'btn-outline'}`}
        onClick={toggleLabels}
      >
        {showLabels ? '🏷 隐藏标签' : '🏷 显示标签'}
      </button>
    </div>
  );
};

export default ViewControlPanel;
