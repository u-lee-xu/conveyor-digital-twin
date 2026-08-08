import React from 'react';
import { useBeltStore, type BeltName } from '../useBeltStore';

const BELT_NAMES: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
const BELT_LABELS: Record<BeltName, string> = {
  belt1: '1# 给料皮带', belt2: '2# 筛分皮带', belt3: '3# 精煤皮带', belt4: '4# 筛下皮带',
};

export const BeltScoringPanel: React.FC<{ connected: boolean }> = ({ connected }) => {
  const belts = useBeltStore((s) => s.belts);

  const readyCount = BELT_NAMES.filter((n) => !belts[n].fault).length;

  return (
    <div className="space-y-2">
      <div className="card card-accent">
        <div className="section-title !mb-1.5">综合实训评分系统</div>
        <div className="flex justify-between items-end">
          <div className="text-2xl font-black text-white leading-none">0 <span className="text-[0.6rem] text-slate-500">pts</span></div>
          <div className="text-[0.6rem] text-slate-500">PROGRESS: 0%</div>
        </div>
        <div className="progress-bar mt-2">
          <div className="progress-fill" style={{ width: '0%' }} />
        </div>
      </div>

      {!connected ? (
        <div className="card">
          <div className="flex items-center gap-2 text-[0.65rem] text-yellow-400/90">
            <span className="badge badge-yellow"><span className="badge-dot badge-dot-yellow" />待连接</span>
            <span>请先在上方「PLC 连接」区域连接 PLC 后开始评分</span>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center gap-2 text-[0.65rem] text-slate-400">
            <span className="badge badge-green"><span className="badge-dot badge-dot-green" />已连接</span>
            <span>评分功能开发中，敬请期待</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title !mb-1.5">设备准备状态</div>
        <div className="space-y-1">
          {BELT_NAMES.map((name) => {
            const ready = !belts[name].fault;
            return (
              <div key={name} className="flex items-center justify-between p-2 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-[0.62rem] text-slate-400">{BELT_LABELS[name]}</span>
                <span className={`badge ${ready ? 'badge-green' : 'badge-red'}`}>
                  <span className={`badge-dot ${ready ? 'badge-dot-green' : 'badge-dot-red'}`} />
                  {ready ? '就绪' : '故障'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="divider !my-1.5" />
        <div className="flex justify-between items-center">
          <span className="text-[0.6rem] text-slate-500">就绪设备</span>
          <span className="text-[0.65rem] font-mono text-blue-400">{readyCount} / {BELT_NAMES.length}</span>
        </div>
      </div>
    </div>
  );
};

export default BeltScoringPanel;
