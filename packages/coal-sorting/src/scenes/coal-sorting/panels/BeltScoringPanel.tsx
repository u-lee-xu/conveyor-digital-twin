import React from 'react';
import { useBeltStore } from '../useBeltStore';

export const BeltScoringPanel: React.FC = () => {
  const belts = useBeltStore((s) => s.belts || {});

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg">
        <div className="text-[10px] text-blue-400 font-bold uppercase mb-2 tracking-widest text-center">综合实训评分系统</div>
        <div className="flex justify-between items-end">
          <div className="text-2xl font-black text-white leading-none">0 <span className="text-[10px] text-gray-500">pts</span></div>
          <div className="text-[10px] text-gray-500">PROGRESS: 0%</div>
        </div>
      </div>

      <div className="space-y-1">
        {Object.keys(belts).map(name => (
          <div key={name} className="flex items-center justify-between p-2 bg-slate-900/40 rounded border border-slate-800">
            <span className="text-[10px] text-gray-400 uppercase">{name} 准备就绪</span>
            <div className="w-2 h-2 rounded-full bg-slate-700"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BeltScoringPanel;
