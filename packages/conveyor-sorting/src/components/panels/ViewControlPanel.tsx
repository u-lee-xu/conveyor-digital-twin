import React from 'react';
import { Button } from '@digital-twin/shared';
import { useDeviceStore } from '../../stores';

export const ViewControlPanel: React.FC = () => {
  const showLabels = useDeviceStore((s) => s.showLabels);
  const toggleLabels = useDeviceStore((s) => s.toggleLabels);

  return (
    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">视图控制</div>
      <div className="flex flex-col gap-3">
        <Button 
          onClick={toggleLabels}
          variant={showLabels ? 'primary' : 'default'}
          size="md"
          className="w-full btn-hover-lift"
          glow
        >
          {showLabels ? '👁 隐藏标签' : '👁 显示标签'}
        </Button>
      </div>
    </div>
  );
};

export default ViewControlPanel;