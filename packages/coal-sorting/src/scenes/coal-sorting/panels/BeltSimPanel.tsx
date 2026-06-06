import React from 'react';
import { Button } from '@digital-twin/shared';
import { useBeltStore, type BeltName, type BeltSensorName } from '../useBeltStore';

export const BeltSimPanel: React.FC = () => {
  const sensors = useBeltStore((s) => s.sensors || {});
  const indicators = useBeltStore((s) => s.indicators || { belt1_run: false, belt2_run: false, belt3_run: false, belt4_run: false, fault: false });
  const materialCount = useBeltStore((s) => (s.materialCount?.coal || 0) + (s.materialCount?.stone || 0));
  const materials = useBeltStore((s) => s.materials || []);

  const setBeltRunning = useBeltStore((s) => s.setBeltRunning);
  const setBeltFault = useBeltStore((s) => s.setBeltFault);
  const setBuzzer = useBeltStore((s) => s.setBuzzer);

  const anyRunning = indicators.belt1_run || indicators.belt2_run || indicators.belt3_run || indicators.belt4_run;
  const anyFault = indicators.fault;

  const beltNames: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/80 border border-slate-600/30 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase mb-3 text-center tracking-widest">仿真主令控制</div>
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => beltNames.forEach(n => setBeltRunning(n, true))} variant="success" size="lg" disabled={anyRunning && !anyFault}>▶ 启动</Button>
          <Button onClick={() => beltNames.forEach(n => setBeltRunning(n, false))} variant="danger" size="lg">◼ 停止</Button>
          <Button onClick={() => { beltNames.forEach(n => setBeltFault(n, false)); setBuzzer(false); }} variant="warning" size="sm">🔄 复位</Button>
        </div>
      </div>

      <div className="device-card bg-slate-900/60 p-3 rounded-lg border border-slate-800/50">
        <div className="text-[10px] text-gray-500 uppercase mb-2">IO 实时映像</div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(sensors) as BeltSensorName[]).map((sn, i) => (
            <div key={sn} className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-mono ${sensors[sn] ? 'bg-green-500/30 text-green-400 border border-green-500/50' : 'bg-slate-800 text-gray-600'}`}>
              I{i}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between p-2 bg-slate-900/40 rounded text-xs">
        <span className="text-gray-500">在线: {materials.length}</span>
        <span className="text-gray-500">产出: {materialCount}</span>
      </div>
    </div>
  );
};

export default BeltSimPanel;
