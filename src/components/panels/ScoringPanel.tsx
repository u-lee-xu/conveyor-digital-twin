import React from 'react';

export const ScoringPanel: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
          <span className="text-white text-xl">🏆</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">评分模式</h2>
          <p className="text-xs text-slate-400 uppercase tracking-wider">Scoring Mode</p>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700/50 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h3 className="text-white font-medium mb-2">正在开发中</h3>
        <p className="text-sm text-slate-400">
          评分模式功能正在规划中，后续将提供完整的操作评分与实时反馈。
        </p>
      </div>

      <div className="space-y-3">
        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/30">
          <div className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
            <span>📋</span> 评分规则
          </div>
          <p className="text-xs text-slate-500">
            系统将根据气缸响应时间、分拣准确率等指标进行综合评分。
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScoringPanel;
