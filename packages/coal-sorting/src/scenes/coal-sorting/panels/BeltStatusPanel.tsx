import React from 'react';
import { useBeltStore, type BeltSensorName } from '../useBeltStore';

export const BeltStatusPanel: React.FC = () => {
  const sensors = useBeltStore((s) => s.sensors || {});
  const feedCylinder = useBeltStore((s) => s.feedCylinder || { extended: false });
  const materialCount = useBeltStore((s) => s.materialCount || { coal: 0, stone: 0, small: 0 });
  const materials = useBeltStore((s) => s.materials || []);
  const indicators = useBeltStore((s) => s.indicators || { belt1_run: false, belt2_run: false, belt3_run: false, fault: false });

  const sensorConfig: { name: BeltSensorName; label: string }[] = [
    { name: 's1_belt1_entry', label: '1#入' },
    { name: 's2_belt1_run', label: '1#运' },
    { name: 's3_belt1_exit', label: '1#出' },
    { name: 's4_belt2_entry', label: '2#入' },
    { name: 's5_belt2_run', label: '2#运' },
    { name: 's6_belt2_exit', label: '2#出' },
    { name: 's7_belt3_entry', label: '3#入' },
    { name: 's8_belt3_run', label: '3#运' },
    { name: 's9_belt3_exit', label: '3#出' },
    { name: 's10_pileup', label: '堆积' },
  ];

  const anyFault = indicators.fault;
  const anyRunning = indicators.belt1_run || indicators.belt2_run || indicators.belt3_run;

  return (
    <div className="device-card mt-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-200">系统实时状态</span>
        <span className={`status-badge ${anyFault ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : anyRunning ? 'status-badge-active pulse-indicator' : 'status-badge-inactive'}`}>
          {anyFault ? '系统故障' : anyRunning ? '系统运行' : '系统待机'}
        </span>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">传感器阵列信号</div>
        <div className="grid grid-cols-5 gap-1.5">
          {sensorConfig.map((sc) => (
            <div
              key={sc.name}
              className={`
                p-1.5 rounded-lg text-center transition-all duration-300 border
                ${sensors[sc.name]
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-gray-800/50 border-gray-700/30'
                }
              `}
            >
              <div className={`w-2 h-2 rounded-full mx-auto mb-1 transition-all duration-300
                ${sensors[sc.name] ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)] pulse-indicator' : 'bg-gray-600'}
              `}></div>
              <span className="text-[9px] text-gray-500 block truncate leading-none">{sc.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-700/50 pt-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">运行中物料</span>
          <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{materials.length} <span className="text-[10px] text-gray-500">pcs</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">已处理精煤</span>
          <span className="text-xs font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">{materialCount.coal} <span className="text-[10px] text-gray-500">pcs</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">给料推板状态</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${feedCylinder.extended ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-gray-500'}`}>
            {feedCylinder.extended ? '已伸出' : '已缩回'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BeltStatusPanel;
