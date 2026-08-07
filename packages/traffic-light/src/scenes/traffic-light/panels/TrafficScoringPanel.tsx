import { useEffect, useMemo, useRef } from 'react';
import { useTrafficStore, type ScoringItemStatus } from '../useTrafficStore';
import { Button } from '@digital-twin/shared';
import { SCORING_MODULES } from '../hooks/useTrafficScoring';
import { cycleDuration, derivedRed, type DirectionTiming } from '../constants';

const STATUS_ICON: Record<ScoringItemStatus, string> = {
  pending: '·',
  passed: '✓',
  failed: '✕',
  skipped: '○',
};

const STATUS_COLOR: Record<ScoringItemStatus, string> = {
  pending: 'text-slate-500',
  passed: 'text-green-400',
  failed: 'text-red-400',
  skipped: 'text-slate-600',
};

const STATUS_BG: Record<ScoringItemStatus, string> = {
  pending: 'bg-slate-500/5 border-slate-500/10',
  passed: 'bg-green-500/5 border-green-500/10',
  failed: 'bg-red-500/10 border-red-500/20',
  skipped: 'bg-slate-800/30 border-slate-700/20',
};

const TIMING_FIELDS: { key: keyof DirectionTiming; label: string; desc: string }[] = [
  { key: 'greenSteady', label: '绿稳', desc: '绿灯稳定时长(s)' },
  { key: 'greenFlash', label: '绿闪', desc: '绿灯闪烁时长(s)' },
  { key: 'yellow', label: '黄灯', desc: '黄灯时长(s)' },
];

type TrafficTiming = ReturnType<typeof useTrafficStore.getState>['timing'];

export function TrafficScoringPanel({ connected }: { connected: boolean }) {
  const {
    isScoringRunning,
    scoringComplete,
    setScoringRunning,
    score,
    scoringStatus,
    scoringLog,
    scoringPrompt,
    resetScore,
    timing,
    setTiming,
    resetTiming,
  } = useTrafficStore();

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [scoringLog]);

  const moduleScores = useMemo(() => {
    return SCORING_MODULES.map(mod => {
      const allItems = mod.subModules.flatMap(sm => sm.items);
      const earned = allItems.reduce((sum, item) => {
        return sum + (scoringStatus[item.id] === 'passed' ? item.points : 0);
      }, 0);
      const passed = allItems.filter(i => scoringStatus[i.id] === 'passed').length;
      const failed = allItems.filter(i => scoringStatus[i.id] === 'failed').length;
      const skipped = allItems.filter(i => scoringStatus[i.id] === 'skipped').length;
      const pending = allItems.filter(i => !scoringStatus[i.id] || scoringStatus[i.id] === 'pending').length;
      return { ...mod, earned, passed, failed, skipped, pending };
    });
  }, [scoringStatus]);

  const handleStartAutoTest = () => {
    if (!connected) return;
    resetScore();
    setScoringRunning(true);
  };

  const ewRed = derivedRed(timing.ns);
  const nsRed = derivedRed(timing.ew);
  const totalCycle = cycleDuration(timing);

  const renderTimingGroup = (title: string, dir: keyof TrafficTiming) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-300">{title}</span>
        <span className="text-[9px] text-slate-500">
          红灯 = {title === '东西' ? '南北' : '东西'}(绿+闪+黄) = {title === '东西' ? ewRed : nsRed}s
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TIMING_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1" title={f.desc}>
            <span className="text-[9px] text-slate-500">{f.label}</span>
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={timing[dir][f.key]}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v) && v >= 1 && v <= 60) {
                  setTiming({ [dir]: { [f.key]: v } });
                }
              }}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white font-mono w-full focus:outline-none focus:border-amber-500/60"
            />
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <span className="text-white text-xl">🚦</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">自动评分系统</h2>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Automated Assessment</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-black font-mono transition-colors ${
            score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-slate-400'
          }`}>
            {score}
          </div>
          <div className="text-[10px] text-slate-500 uppercase">/ 100 pts</div>
        </div>
      </div>

      <div className={`px-4 py-2 rounded-xl border flex items-center justify-between ${connected ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></div>
          <span className="text-xs font-medium text-slate-300">
            {connected ? 'PLC 已连接，可开始评分' : '请先在上方连接 PLC'}
          </span>
        </div>
        {!connected && <span className="text-[10px] text-amber-300">评分模式需手动连接</span>}
      </div>

      {/* ===== 教师参数 ===== */}
      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
            时序参数（教师可调）
          </div>
          <button
            className="btn btn-xs btn-outline touch-manipulation"
            style={{ fontSize: '0.6rem' }}
            onClick={resetTiming}
          >
            恢复默认
          </button>
        </div>
        <div className="space-y-3">
          {renderTimingGroup('东西方向', 'ew')}
          {renderTimingGroup('南北方向', 'ns')}
        </div>
        <div className="mt-3 text-[9px] text-slate-500">
          红灯时长自动派生（不可设定）：东西红灯 = 南北绿稳+绿闪+黄 = {ewRed}s；南北红灯 = 东西绿稳+绿闪+黄 = {nsRed}s。一个完整循环 = {totalCycle}s。时长判定容差 ±40%。
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-700/50">
        {scoringComplete ? (
          <div className="mb-4">
            <div className={`px-4 py-4 rounded-xl border text-center ${
              score >= 80 ? 'bg-green-500/10 border-green-500/30' :
              score >= 50 ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="text-2xl mb-1">🏁</div>
              <div className={`text-3xl font-black font-mono ${
                score >= 80 ? 'text-green-400' :
                score >= 50 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {score}
              </div>
              <div className="text-xs text-slate-400 mt-1">/ 100 分</div>
              <div className={`text-sm font-bold mt-2 ${
                score >= 80 ? 'text-green-300' :
                score >= 50 ? 'text-yellow-300' :
                'text-red-300'
              }`}>
                {score >= 90 ? '优秀' : score >= 80 ? '良好' : score >= 60 ? '及格' : '不及格'}
              </div>
            </div>
            <Button
              onClick={() => { setScoringRunning(false); }}
              variant="primary"
              className="w-full mt-3 h-10 text-sm font-bold"
            >
              返回
            </Button>
          </div>
        ) : !isScoringRunning ? (
          <Button
            onClick={handleStartAutoTest}
            variant="primary"
            className="w-full mb-4 h-12 text-base font-bold disabled:opacity-50"
            disabled={!connected}
            glow
          >
            开始自动评分
          </Button>
        ) : (
          <Button
            onClick={() => setScoringRunning(false)}
            variant="danger"
            className="w-full mb-4 h-12 text-base font-bold animate-pulse"
            glow
          >
            停止当前评分
          </Button>
        )}

        {isScoringRunning && !scoringComplete && scoringPrompt && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
            <p className="text-sm text-indigo-200 font-medium">{scoringPrompt}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>测评状态</span>
            <span className={
              scoringComplete ? 'text-green-400' :
              isScoringRunning ? 'text-blue-400' : 'text-slate-500'
            }>
              {scoringComplete ? '✓ 已完成' : isScoringRunning ? '序列执行中...' : '待命'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest px-1 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
          模块评分 / Module Scores
        </div>
        {moduleScores.map((mod, idx) => (
          <div key={mod.id} className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-300">{idx + 1}</span>
                <span className="text-sm font-semibold text-white">{mod.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold font-mono ${
                  mod.earned >= mod.maxPoints * 0.8 ? 'text-green-400' :
                  mod.earned >= mod.maxPoints * 0.5 ? 'text-yellow-400' :
                  mod.earned > 0 ? 'text-orange-400' : 'text-slate-500'
                }`}>
                  {mod.earned}
                </span>
                <span className="text-[10px] text-slate-500">/ {mod.maxPoints}</span>
              </div>
            </div>
            <div className="h-1 bg-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  mod.earned >= mod.maxPoints * 0.8 ? 'bg-green-500' :
                  mod.earned >= mod.maxPoints * 0.5 ? 'bg-yellow-500' :
                  mod.earned > 0 ? 'bg-orange-500' : 'bg-slate-700'
                }`}
                style={{ width: `${(mod.earned / mod.maxPoints) * 100}%` }}
              />
            </div>
            <div className="px-4 py-2 space-y-1">
              {mod.subModules.map(sm => (
                <div key={sm.id}>
                  <div className="flex items-center gap-1 mt-1 mb-0.5">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">{sm.name}</span>
                    {sm.isPrerequisite && (
                      <span className="text-[8px] px-1 py-0 rounded bg-indigo-500/20 text-indigo-300">前置</span>
                    )}
                  </div>
                  {sm.items.map(item => {
                    const status: ScoringItemStatus = scoringStatus[item.id] || 'pending';
                    return (
                      <div key={item.id} className={`flex items-center justify-between px-2 py-1 rounded border ${STATUS_BG[status]} mb-0.5`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${STATUS_COLOR[status]}`}>{STATUS_ICON[status]}</span>
                          <span className={`text-[10px] ${status === 'skipped' ? 'text-slate-600 line-through' : status === 'failed' ? 'text-red-200' : 'text-slate-300'}`}>
                            {item.name}
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono ${
                          status === 'passed' ? 'text-green-400' :
                          status === 'failed' ? 'text-red-400' :
                          status === 'skipped' ? 'text-slate-600' : 'text-slate-500'
                        }`}>
                          {status === 'passed' ? `+${item.points}` : status === 'pending' ? `${item.points}` : '0'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          评分日志 / Scoring Log
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {scoringLog.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic px-1">等待流程触发...</div>
          ) : (
            <>
              {scoringLog.map((entry) => (
                <div key={entry.id} className={`rounded-lg px-2 py-1.5 flex items-start gap-2 border ${STATUS_BG[entry.status]}`}>
                  <span className={`text-xs mt-0.5 ${STATUS_COLOR[entry.status]}`}>{STATUS_ICON[entry.status]}</span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className={`text-[10px] ${entry.status === 'passed' ? 'text-green-100/90' : entry.status === 'failed' ? 'text-red-200' : 'text-slate-500'}`}>
                      {entry.label}
                    </span>
                    <span className="text-[8px] text-slate-600">{new Date(entry.time).toLocaleTimeString()}</span>
                  </div>
                  <span className={`text-[10px] font-mono ${
                    entry.status === 'passed' ? 'text-green-400' : 'text-slate-600'
                  }`}>
                    {entry.status === 'passed' ? `+${entry.points}` : ''}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10 opacity-60">
        <div className="text-[10px] text-indigo-300 font-bold mb-1 italic">评分说明:</div>
        <p className="text-[9px] text-slate-500 leading-relaxed">
          纯累加制评分，初始 0 分，通过评分项累计至满分 100。前置子模块失败则后续子模块自动跳过。时长判定按教师设定的时序参数 ±40% 容差；绿闪要求 1Hz 交替 ≥2 次。停止语义：停止后完成当前循环（红灯结束）全部熄灭；急停立即全灭。互锁全程监控：东西绿与南北绿、绿灯与黄灯不得同时点亮。
        </p>
        <div className="flex gap-3 mt-2 text-[9px] text-slate-500">
          <span><span className="text-green-400">✓</span> 通过</span>
          <span><span className="text-red-400">✕</span> 失败</span>
          <span><span className="text-slate-600">○</span> 跳过</span>
          <span><span className="text-slate-500">·</span> 待评</span>
        </div>
      </div>
    </div>
  );
}

export default TrafficScoringPanel;
