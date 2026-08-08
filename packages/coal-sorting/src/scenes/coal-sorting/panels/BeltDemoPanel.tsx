import { useEffect } from 'react';
import { useBeltStore, type BeltName } from '../useBeltStore';
import { useBeltDemoSim, STEP_LABELS, type BeltDemoStep } from '../hooks/useBeltDemoSim';

const STEP_ORDER: BeltDemoStep[] = ['IDLE', 'START_UP', 'FEEDING', 'STOPPING'];

const BELT_NAMES: BeltName[] = ['belt1', 'belt2', 'belt3', 'belt4'];
const BELT_LABELS: Record<BeltName, string> = {
  belt1: '1# 给料', belt2: '2# 筛分', belt3: '3# 小料', belt4: '4# 大料',
};

export const BeltDemoPanel: React.FC = () => {
  const demo = useBeltDemoSim();
  const belts = useBeltStore((s) => s.belts);
  const materials = useBeltStore((s) => s.materials);
  const materialCount = useBeltStore((s) => s.materialCount);
  const sensors = useBeltStore((s) => s.sensors);

  // 退出演示模式时自动停止
  useEffect(() => {
    return () => { if (demo.running) demo.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyRunning = BELT_NAMES.some((n) => belts[n].running);
  const activeStepIndex = STEP_ORDER.indexOf(demo.step);

  return (
    <div className="space-y-2">
      {/* ===== 状态徽章 ===== */}
      <div className="card">
        <div className="flex items-center justify-between">
          <span className={`badge ${anyRunning ? 'badge-green' : 'badge-slate'}`}>
            <span className={`badge-dot ${anyRunning ? 'badge-dot-green' : 'badge-dot-slate'}`} />
            {demo.running ? '演示运行中' : '演示就绪'}
          </span>
          <span className="text-[0.6rem] text-slate-500 font-mono">
            {demo.paused ? '已暂停' : STEP_LABELS[demo.step]}
          </span>
        </div>
      </div>

      {/* ===== 步骤指示器 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">演示流程</div>
        <div className="step-list flex-wrap">
          {STEP_ORDER.map((step, i) => (
            <span key={step} className={`step-item ${i <= activeStepIndex ? 'step-item-active' : ''}`}>
              <span className="step-index">{i + 1}</span>
              <span className="step-dot" />
              {STEP_LABELS[step]}
            </span>
          ))}
        </div>
      </div>

      {/* ===== 控制按钮 ===== */}
      <div className="card">
        <div className="flex gap-1.5">
          {!demo.running ? (
            <button className="btn btn-xs btn-success flex-1 touch-manipulation" style={{ fontSize: '0.62rem' }} onClick={demo.start}>
              ▶ 开始演示
            </button>
          ) : (
            <>
              <button className="btn btn-xs btn-warning flex-1 touch-manipulation" style={{ fontSize: '0.62rem' }} onClick={demo.paused ? demo.resume : demo.pause}>
                {demo.paused ? '▶ 继续' : '⏸ 暂停'}
              </button>
              <button className="btn btn-xs btn-danger flex-1 touch-manipulation" style={{ fontSize: '0.62rem' }} onClick={demo.stop}>
                ■ 停止
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== 皮带状态 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">皮带状态</div>
        <div className="grid grid-cols-2 gap-1.5">
          {BELT_NAMES.map((name) => {
            const b = belts[name];
            return (
              <div key={name} className="bg-slate-900/40 p-2 rounded border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.6rem] text-slate-400">{BELT_LABELS[name]}</span>
                  <span className={`io-led ${b.running ? 'io-led-on' : 'io-led-off'}`} />
                </div>
                <div className="text-[0.62rem] font-mono text-slate-500">
                  {(b.speed * 1000).toFixed(1)} mm/s
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 运行统计 ===== */}
      <div className="card">
        <div className="section-title !mb-1.5">运行统计</div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[0.62rem] text-slate-500">在线物料</span>
            <span className="text-[0.62rem] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{materials.length} pcs</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[0.62rem] text-slate-500">大料收集</span>
            <span className="text-[0.62rem] font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">{materialCount.large} pcs</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[0.62rem] text-slate-500">小料收集</span>
            <span className="text-[0.62rem] font-mono text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{materialCount.small} pcs</span>
          </div>
          <div className="flex justify-between items-center">
            
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[0.62rem] text-slate-500">堆料传感器</span>
            <span className={`badge ${sensors.s10_pileup ? 'badge-red' : 'badge-slate'}`}>
              <span className={`badge-dot ${sensors.s10_pileup ? 'badge-dot-red' : 'badge-dot-slate'}`} />
              {sensors.s10_pileup ? '堆积' : '正常'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeltDemoPanel;
