import React from 'react';
import { useBeltStore } from '../useBeltStore';

export const BeltDemoPanel: React.FC = () => {
  const belts = useBeltStore((s) => s.belts || {});
  const indicators = useBeltStore((s) => s.indicators || { belt1_run: false, belt2_run: false, belt3_run: false, fault: false });

  const anyRunning = indicators.belt1_run || indicators.belt2_run || indicators.belt3_run;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${anyRunning ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
          <div className={`w-2 h-2 rounded-full ${anyRunning ? 'bg-green-400 animate-ping' : 'bg-slate-600'}`}></div>
          <span className="text-xs font-bold tracking-widest">{anyRunning ? '演示运行中' : '演示就绪'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Object.entries(belts).map(([name, b]) => (
          <div key={name} className="bg-slate-900/40 p-2 rounded border border-slate-800">
            <div className="text-[10px] text-gray-500 mb-1">{name}</div>
            <div className="flex items-center justify-between">
              <div className={`w-1.5 h-1.5 rounded-full ${b.running ? 'bg-green-400' : 'bg-slate-700'}`}></div>
              <div className="text-xs font-mono text-gray-300">{(b.speed * 1000).toFixed(1)} m/s</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BeltDemoPanel;
