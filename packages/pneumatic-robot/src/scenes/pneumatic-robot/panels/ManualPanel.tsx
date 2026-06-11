import { useRobotStore, type CylinderName } from '../useRobotStore';
import { ADDRESS } from '../constants';

type CylData = ReturnType<typeof useRobotStore.getState>['cylinders'][CylinderName];

const META: Record<CylinderName, { label: string; up: string; dn: string; dot: string; arrow: string }> = {
  forward: { label: '前后', up: '伸出', dn: '缩回', dot: 'bg-blue-500', arrow: '\u2192' },
  lift:    { label: '升降', up: '下降', dn: '升起', dot: 'bg-amber-500', arrow: '\u2193' },
  clamp:   { label: '夹爪', up: '张开', dn: '夹紧', dot: 'bg-emerald-500', arrow: '\u21C4' },
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
          const { label, up, dn, dot, arrow } = META[name];
          const ext = cyl.extended;
          const pct = Math.round(cyl.position * 100);
          const sa = ADDRESS.SOLENOID[name];
          const ma = ADDRESS.MAG[name];
          // SOLENOID now has extend/retract (or open/close for clamp),
          // MAG has front/rear (or open/close for clamp)
          const saList = ('extend' in sa) ? [sa.extend, sa.retract] : [sa.open, sa.close];
          const maList = ('front' in ma) ? [ma.front, ma.rear] : [ma.open, ma.close];

          return (
            <div key={name} className="rounded-lg border border-slate-700/25 bg-slate-800/25 p-2">

              {/* 标题行：彩点 + 名称 + 方向指示 */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot} shadow-sm`} />
                  <span className="text-[0.7rem] font-bold text-slate-200">{label}</span>
                </div>
                <span className={`motion-indicator ${ext ? 'motion-extend' : 'motion-retract'}`}>
                  {ext ? up : dn}&ensp;{arrow}
                </span>
              </div>

              {/* 按钮行 */}
              <div className="flex gap-1.5 mb-1.5">
                <button
                  className="btn btn-xs btn-success flex-1 touch-manipulation"
                  onClick={() => setCylinder(name, true)}
                  disabled={ext}
                  aria-label={`${label}${up}`}
                >
                  {up}
                </button>
                <button
                  className="btn btn-xs btn-outline flex-1 touch-manipulation"
                  onClick={() => setCylinder(name, false)}
                  disabled={!ext}
                  aria-label={`${label}${dn}`}
                >
                  {dn}
                </button>
              </div>

              {/* 进度条 + 地址 + LED 行 */}
              <div className="flex items-center gap-1.5">
                <div className="progress-bar flex-1">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="addr-tag">{maList[0].s7}</span>
                <span className="addr-tag">{saList[0].s7}</span>
                <span className={`sensor-led ${cyl.magFront ? 'sensor-led-on' : 'sensor-led-off'}`} />
                <span className={`sensor-led ${cyl.magRear ? 'sensor-led-on' : 'sensor-led-off'}`} />
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