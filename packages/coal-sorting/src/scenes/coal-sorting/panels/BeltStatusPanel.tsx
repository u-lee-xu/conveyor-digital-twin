import React from 'react';
import { useBeltStore, type BeltSensorName } from '../useBeltStore';

const SENSOR_CONFIG: { name: BeltSensorName; label: string }[] = [
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

export const BeltStatusPanel: React.FC = () => {
  const sensors = useBeltStore((s) => s.sensors);
  const feedCylinder = useBeltStore((s) => s.feedCylinder);
  const materialCount = useBeltStore((s) => s.materialCount);
  const materials = useBeltStore((s) => s.materials);
  const indicators = useBeltStore((s) => s.indicators);

  const anyFault = indicators.fault;
  const anyRunning = indicators.belt1_run || indicators.belt2_run || indicators.belt3_run || indicators.belt4_run;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.68rem] font-medium text-slate-200">系统实时状态</span>
        <span className={`badge ${anyFault ? 'badge-red' : anyRunning ? 'badge-green' : 'badge-slate'}`}>
          <span className={`badge-dot ${anyFault ? 'badge-dot-red' : anyRunning ? 'badge-dot-green' : 'badge-dot-slate'}`} />
          {anyFault ? '系统故障' : anyRunning ? '系统运行' : '系统待机'}
        </span>
      </div>

      <div className="mb-2">
        <div className="text-[0.55rem] text-slate-500 uppercase tracking-wider mb-1.5">传感器阵列信号</div>
        <div className="grid grid-cols-5 gap-1">
          {SENSOR_CONFIG.map((sc) => (
            <div
              key={sc.name}
              className={`
                p-1 rounded-lg text-center transition-all duration-300 border
                ${sensors[sc.name]
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-slate-800/50 border-slate-700/30'
                }
              `}
            >
              <div className={`w-1.5 h-1.5 rounded-full mx-auto mb-0.5 transition-all duration-300
                ${sensors[sc.name] ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-slate-600'}
              `}></div>
              <span className="text-[0.5rem] text-slate-500 block truncate leading-none">{sc.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="divider !my-1.5" />
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[0.62rem] text-slate-400">运行中物料</span>
          <span className="text-[0.62rem] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{materials.length} pcs</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[0.62rem] text-slate-400">已处理精煤</span>
          <span className="text-[0.62rem] font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">{materialCount.coal} pcs</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[0.62rem] text-slate-400">矸石吹除</span>
          <span className="text-[0.62rem] font-mono text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{materialCount.stone} pcs</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[0.62rem] text-slate-400">给料推板状态</span>
          <span className={`badge ${feedCylinder.extended ? 'badge-blue' : 'badge-slate'}`}>
            <span className={`badge-dot ${feedCylinder.extended ? 'badge-dot-blue' : 'badge-dot-slate'}`} />
            {feedCylinder.extended ? '已伸出' : '已缩回'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BeltStatusPanel;
