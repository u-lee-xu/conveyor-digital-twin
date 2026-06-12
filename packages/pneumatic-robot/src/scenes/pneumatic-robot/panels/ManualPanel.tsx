import { useRobotStore, type CylinderName } from '../useRobotStore';

type CylData = ReturnType<typeof useRobotStore.getState>['cylinders'][CylinderName];

const META: Record<CylinderName, { label: string; left: string; leftExt: boolean; right: string; rightExt: boolean; dot: string; arrow: string }> = {
  forward: { label: '前后', left: '伸出', leftExt: true,  right: '缩回', rightExt: false, dot: 'bg-blue-500', arrow: '\u2192' },
  lift:    { label: '升降', left: '下降', leftExt: true,  right: '升起', rightExt: false, dot: 'bg-amber-500', arrow: '\u2193' },
  clamp:   { label: '夹爪', left: '夹紧', leftExt: false, right: '张开', rightExt: true,  dot: 'bg-emerald-500', arrow: '\u21C4' },
};

export function ManualPanel() {
  const cylinders = useRobotStore((s) => s.cylinders);
  const setCylinder = useRobotStore((s) => s.setCylinder);
  const workpiece = useRobotStore((s) => s.workpiece);
  const spawnWorkpiece = useRobotStore((s) => s.spawnWorkpiece);
  const cleanUpWorkpiece = useRobotStore((s) => s.cleanUpWorkpiece);

  return (
    <div className="card !p-2.5">
      <div className="section-title !mb-1.5">手动控制</div>

      <div className="space-y-2">
        {(Object.entries(cylinders) as [CylinderName, CylData][]).map(([name, cyl]) => {
          const { label, left, leftExt, right, rightExt, dot, arrow } = META[name];
          const ext = cyl.extended;
          const pct = Math.round(cyl.position * 100);
          const barPct = name === 'clamp' ? 100 - pct : pct;
          // 夹爪亮灭顺序与前后/升降对齐：extended→右LED亮，retracted→左LED亮
          const ledLeft  = name === 'clamp' ? cyl.magRear : cyl.magFront;
          const ledRight = name === 'clamp' ? cyl.magFront : cyl.magRear;

          return (
            <div key={name} className="rounded-lg border border-slate-700/25 bg-slate-800/25 p-2">

              {/* 标题行：彩点 + 名称 + 方向指示 */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot} shadow-sm`} />
                  <span className="text-[0.7rem] font-bold text-slate-200">{label}</span>
                </div>
                <span className={`motion-indicator ${ext ? 'motion-extend' : 'motion-retract'}`}>
                  {ext === leftExt ? left : right}&ensp;{arrow}
                </span>
              </div>

              {/* 按钮行：左绿右蓝 */}
              <div className="flex gap-1.5 mb-1.5">
                <button
                  className="btn btn-xs btn-success flex-1 touch-manipulation"
                  onClick={() => setCylinder(name, leftExt)}
                  disabled={ext === leftExt}
                  aria-label={`${label}${left}`}
                >
                  {left}
                </button>
                <button
                  className="btn btn-xs btn-primary flex-1 touch-manipulation"
                  onClick={() => setCylinder(name, rightExt)}
                  disabled={ext === rightExt}
                  aria-label={`${label}${right}`}
                >
                  {right}
                </button>
              </div>

              {/* 进度条 + LED 行 */}
              <div className="flex items-center gap-1.5">
                <div className="progress-bar flex-1">
                  <div className="progress-fill" style={{ width: `${barPct}%` }} />
                </div>
                <span className={`sensor-led ${ledLeft ? 'sensor-led-on' : 'sensor-led-off'}`} />
                <span className={`sensor-led ${ledRight ? 'sensor-led-on' : 'sensor-led-off'}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="divider !my-1.5" />
      <div className="flex gap-1.5 mb-1">
        <button
          className="btn btn-xs btn-success flex-1 touch-manipulation"
          onClick={spawnWorkpiece}
          disabled={workpiece.exists}
          aria-label="生成物料"
        >
          生成物料
        </button>
        <button
          className="btn btn-xs btn-danger flex-1 touch-manipulation"
          onClick={cleanUpWorkpiece}
          disabled={!workpiece.exists}
          aria-label="清理物料"
        >
          清理物料
        </button>
      </div>
      <button
        className="btn btn-xs btn-ghost w-full touch-manipulation"
        onClick={() => useRobotStore.getState().resetAll()}
      >
        全部复位
      </button>
    </div>
  );
}