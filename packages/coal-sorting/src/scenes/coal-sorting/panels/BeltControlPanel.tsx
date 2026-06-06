import React, { useEffect, useRef } from 'react';
import { Button } from '@digital-twin/shared';
import {
  useBeltStore,
  type BeltName
} from '../useBeltStore';
import { MAX_MATERIALS } from '../constants';

export const BeltControlPanel: React.FC = () => {
  const belts = useBeltStore((s) => s.belts || {});
  const feedCylinder = useBeltStore((s) => s.feedCylinder);
  const materials = useBeltStore((s) => s.materials || []);
  const autoFeed = useBeltStore((s) => s.autoFeed);
  const autoFeedInterval = useBeltStore((s) => s.autoFeedInterval || 2);
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

  const autoFeedTimerRef = useRef<any>(null);

  useEffect(() => {
    if (autoFeed) {
      autoFeedTimerRef.current = setInterval(() => {
        const state = useBeltStore.getState();
        // 自动投料条件：开启自动、未满、1号皮带正在运行
        if (state && state.materials.length < MAX_MATERIALS && state.belts.belt1?.running) {
          state.spawnMaterial();
        }
      }, Math.max(0.2, autoFeedInterval) * 1000);
    } else {
      if (autoFeedTimerRef.current) clearInterval(autoFeedTimerRef.current);
    }
    return () => { if (autoFeedTimerRef.current) clearInterval(autoFeedTimerRef.current); };
  }, [autoFeed, autoFeedInterval]);

  const beltNames: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
  const beltLabels: Record<BeltName, string> = {
    belt1: '1# 给料皮带',
    belt2: '2# 筛分整列',
    belt3: '3# 净煤收集',
    belt4: '4# 筛下运送'
  };

  return (
    <div className="space-y-3">
      {/* 动力系统控制 */}
      <div className="device-card">
        <div className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">动力系统控制</div>
        <div className="space-y-4">
          {beltNames.map((name) => {
            const belt = belts[name] || { running: false, speed: 0, fault: false };
            return (
              <div key={name} className="border-l-2 border-slate-700 pl-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">{beltLabels[name]}</span>
                  <span className={`status-badge ${belt.running ? 'status-badge-active' : 'status-badge-inactive'}`}>
                    {belt.running ? '运行中' : '已停止'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setBeltRunning(name, true)}
                    disabled={belt.fault}
                    variant={belt.running ? 'success' : 'default'}
                    size="sm"
                    className="flex-1"
                  >
                    启动
                  </Button>
                  <Button
                    onClick={() => setBeltRunning(name, false)}
                    variant="danger"
                    size="sm"
                    className="flex-1"
                  >
                    停止
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 物料生成控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white uppercase tracking-wider">物料生成</span>
          <span className={`status-badge ${materials.length > 0 ? 'status-badge-active' : 'status-badge-inactive'}`}>
            CNT: {materials.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Button onClick={() => spawnMaterial('coal', 'small')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-800/50">煤/小</Button>
          <Button onClick={() => spawnMaterial('coal', 'medium')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-800/50">煤/中</Button>
          <Button onClick={() => spawnMaterial('coal', 'large')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-800/50">煤/大</Button>
          <Button onClick={() => spawnMaterial('stone', 'small')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-700/30 text-gray-400">石/小</Button>
          <Button onClick={() => spawnMaterial('stone', 'medium')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-700/30 text-gray-400">石/中</Button>
          <Button onClick={() => spawnMaterial('stone', 'large')} variant="default" size="sm" className="text-[10px] px-1 bg-slate-700/30 text-gray-400">石/大</Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Button
            onClick={() => setFeedCylinder(true)}
            variant={feedCylinder.extended ? 'primary' : 'default'}
            size="md"
            className="flex-1"
            glow
          >
            ↗ 伸出
          </Button>
          <Button
            onClick={() => setFeedCylinder(false)}
            variant={!feedCylinder.extended ? 'warning' : 'default'}
            size="md"
            className="flex-1"
            glow
          >
            ↙ 缩回
          </Button>
          <Button onClick={clearMaterials} variant="danger" size="md" className="flex-1" glow>🗑 清料</Button>
        </div>

        <div className="pt-3 border-t border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">自动投料控制</span>
            <div className="flex gap-2">
              <button
                onClick={() => setAutoFeedSize(autoFeedSize === 'mixed' ? 'medium' : 'mixed')}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${autoFeedSize === 'mixed' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-transparent text-gray-500'}`}
              >
                {autoFeedSize === 'mixed' ? '随机尺寸' : '固定尺寸'}
              </button>
              <button
                onClick={() => setAutoFeed(!autoFeed)}
                className={`w-10 h-5 rounded-full relative transition-all duration-300 ${autoFeed ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${autoFeed ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="space-y-3 mt-3">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-gray-500">煤/石比例 (煤: {coalRatio}%)</span>
                <span className="text-[10px] text-gray-500">{100 - coalRatio}% 石</span>
              </div>
              <input
                type="range"
                min="0" max="100" step="5"
                value={coalRatio}
                onChange={(e) => setCoalRatio(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.3)]"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-gray-500">投料时间间隔</span>
                <span className="text-[10px] text-gray-400 font-mono">{autoFeedInterval}s</span>
              </div>
              <input
                type="range"
                min="0.2" max="5" step="0.1"
                value={autoFeedInterval}
                onChange={(e) => setAutoFeedInterval(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500 shadow-[0_0_5px_rgba(34,197,94,0.3)]"
              />
            </div>

            {autoFeedSize === 'mixed' && (
              <div className="pt-2 border-t border-slate-700/30">
                <span className="text-[10px] text-gray-400 block mb-2">颗粒尺寸权重分布</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-gray-500"><span>小</span><span>{sizeWeights.small}</span></div>
                    <input type="range" min="0" max="100" step="1" value={sizeWeights.small} onChange={(e) => setSizeWeight('small', Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-gray-500"><span>中</span><span>{sizeWeights.medium}</span></div>
                    <input type="range" min="0" max="100" step="1" value={sizeWeights.medium} onChange={(e) => setSizeWeight('medium', Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-gray-500"><span>大</span><span>{sizeWeights.large}</span></div>
                    <input type="range" min="0" max="100" step="1" value={sizeWeights.large} onChange={(e) => setSizeWeight('large', Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {!belts.belt1?.running && autoFeed && (
            <div className="mt-2 text-[9px] text-orange-400/80 text-center animate-pulse">
              注意：请启动1#皮带以开始自动投料
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BeltControlPanel;
