import React from 'react';
import {
  useBeltStore,
  type BeltName
} from '../useBeltStore';

const BELT_NAMES: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
const BELT_LABELS: Record<BeltName, string> = {
  belt1: '1# 给料皮带', belt2: '2# 筛分整列', belt3: '3# 筛下小料', belt4: '4# 大料收集',
};

export const BeltControlPanel: React.FC = () => {
  const belts = useBeltStore((s) => s.belts);
  const feedCylinder = useBeltStore((s) => s.feedCylinder);
  const materials = useBeltStore((s) => s.materials);
  const autoFeed = useBeltStore((s) => s.autoFeed);
  const autoFeedInterval = useBeltStore((s) => s.autoFeedInterval);
  const coalRatio = useBeltStore((s) => s.coalRatio);
  const autoFeedSize = useBeltStore((s) => s.autoFeedSize);
  const sizeWeights = useBeltStore((s) => s.sizeWeights);

  const setBeltRunning = useBeltStore((s) => s.setBeltRunning);
  const setFeedCylinder = useBeltStore((s) => s.setFeedCylinder);
  const spawnMaterial = useBeltStore((s) => s.spawnMaterial);
  const clearMaterials = useBeltStore((s) => s.clearMaterials);
  const setAutoFeed = useBeltStore((s) => s.setAutoFeed);
  const setAutoFeedInterval = useBeltStore((s) => s.setAutoFeedInterval);
  const setCoalRatio = useBeltStore((s) => s.setCoalRatio);
  const setAutoFeedSize = useBeltStore((s) => s.setAutoFeedSize);
  const setSizeWeight = useBeltStore((s) => s.setSizeWeight);

  return (
    <div className="space-y-2">
      {/* 动力系统控制 */}
      <div className="card">
        <div className="section-title">动力系统控制</div>
        <div className="space-y-2">
          {BELT_NAMES.map((name) => {
            const belt = belts[name];
            return (
              <div key={name} className="border-l-2 border-slate-700 pl-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.65rem] font-medium text-slate-300">{BELT_LABELS[name]}</span>
                  <span className={`badge ${belt.running ? 'badge-green' : 'badge-slate'}`}>
                    <span className={`badge-dot ${belt.running ? 'badge-dot-green' : 'badge-dot-slate'}`} />
                    {belt.running ? '运行中' : '已停止'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBeltRunning(name, true)}
                    disabled={belt.fault}
                    className={`btn btn-xs flex-1 touch-manipulation ${belt.running ? 'btn-success' : 'btn-outline'}`}
                    style={{ fontSize: '0.62rem' }}
                  >
                    启动
                  </button>
                  <button
                    onClick={() => setBeltRunning(name, false)}
                    className="btn btn-xs btn-outline flex-1 touch-manipulation"
                    style={{ fontSize: '0.62rem' }}
                  >
                    停止
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 物料生成控制 */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="section-title !mb-0">物料生成</span>
          <span className="badge badge-blue">
            <span className="badge-dot badge-dot-blue" />CNT: {materials.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <button onClick={() => spawnMaterial('coal', 'small')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem' }}>煤/小</button>
          <button onClick={() => spawnMaterial('coal', 'medium')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem' }}>煤/中</button>
          <button onClick={() => spawnMaterial('coal', 'large')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem' }}>煤/大</button>
          <button onClick={() => spawnMaterial('stone', 'small')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem', color: '#94a3b8' }}>石/小</button>
          <button onClick={() => spawnMaterial('stone', 'medium')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem', color: '#94a3b8' }}>石/中</button>
          <button onClick={() => spawnMaterial('stone', 'large')} className="btn btn-xs btn-outline touch-manipulation" style={{ fontSize: '0.55rem', color: '#94a3b8' }}>石/大</button>
        </div>

        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => setFeedCylinder(true)}
            className={`btn btn-xs flex-1 touch-manipulation ${feedCylinder.extended ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: '0.62rem' }}
          >
            ↗ 上料伸出
          </button>
          <button
            onClick={() => setFeedCylinder(false)}
            className={`btn btn-xs flex-1 touch-manipulation ${!feedCylinder.extended ? 'btn-warning' : 'btn-outline'}`}
            style={{ fontSize: '0.62rem' }}
          >
            ↙ 上料缩回
          </button>
          <button onClick={clearMaterials} className="btn btn-xs btn-danger touch-manipulation" style={{ fontSize: '0.62rem' }}>🗑 清料</button>
        </div>

        <div className="divider !my-1.5" />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.62rem] text-slate-400">自动投料控制</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAutoFeedSize(autoFeedSize === 'mixed' ? 'medium' : 'mixed')}
                className={`btn btn-xs touch-manipulation ${autoFeedSize === 'mixed' ? 'btn-primary' : 'btn-outline'}`}
                style={{ fontSize: '0.55rem' }}
              >
                {autoFeedSize === 'mixed' ? '随机尺寸' : '固定尺寸'}
              </button>
              <button
                onClick={() => setAutoFeed(!autoFeed)}
                className={`w-10 h-5 rounded-full relative transition-all duration-300 ${autoFeed ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-slate-700'}`}
                aria-label="自动投料开关"
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${autoFeed ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.55rem] text-slate-500">煤/石比例 (煤: {coalRatio}%)</span>
                <span className="text-[0.55rem] text-slate-500">{100 - coalRatio}% 石</span>
              </div>
              <input
                type="range"
                min="0" max="100" step="5"
                value={coalRatio}
                onChange={(e) => setCoalRatio(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-[0.55rem] text-slate-500">投料时间间隔</span>
                <span className="text-[0.55rem] text-slate-400 font-mono">{autoFeedInterval}s</span>
              </div>
              <input
                type="range"
                min="0.2" max="5" step="0.1"
                value={autoFeedInterval}
                onChange={(e) => setAutoFeedInterval(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>

            {autoFeedSize === 'mixed' && (
              <div className="pt-1.5 border-t border-slate-700/30">
                <span className="text-[0.55rem] text-slate-400 block mb-1">颗粒尺寸权重分布</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <div key={size} className="space-y-0.5">
                      <div className="flex justify-between text-[0.5rem] text-slate-500">
                        <span>{size === 'small' ? '小' : size === 'medium' ? '中' : '大'}</span>
                        <span>{sizeWeights[size]}</span>
                      </div>
                      <input
                        type="range" min="0" max="100" step="1"
                        value={sizeWeights[size]}
                        onChange={(e) => setSizeWeight(size, Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!belts.belt1?.running && autoFeed && (
            <div className="mt-1.5 text-[0.55rem] text-orange-400/80 text-center animate-pulse">
              注意：请启动1#皮带以开始自动投料
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BeltControlPanel;
