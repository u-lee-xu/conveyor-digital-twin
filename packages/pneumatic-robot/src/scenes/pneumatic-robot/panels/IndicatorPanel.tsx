import { useRobotStore, type IndicatorName } from '../useRobotStore';

/** 指示灯定义（与 3D 场景灯塔段一致） */
const INDICATORS: { key: IndicatorName; label: string; dot: string; btn: string }[] = [
  { key: 'running',    label: '绿灯', dot: 'bg-green-500',   btn: 'btn-success' },
  { key: 'home',       label: '蓝灯', dot: 'bg-blue-500',    btn: 'btn-primary' },
  { key: 'processing', label: '黄灯', dot: 'bg-yellow-500',  btn: 'btn-warning' },
  { key: 'alarm',      label: '红灯', dot: 'bg-red-500',     btn: 'btn-danger' },
];

/** 指示灯控制面板（与传送带场景"三色灯塔"卡片同尺寸同风格） */
export function IndicatorPanel() {
  const indicators = useRobotStore((s) => s.indicators);
  const setIndicator = useRobotStore((s) => s.setIndicator);

  return (
    <div className="device-card">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white">指示灯</span>
      </div>
      <div className="space-y-3">
        {INDICATORS.map(({ key, label, dot, btn }) => {
          const on = indicators[key];
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${on ? dot : 'bg-gray-600'}`}></span>
                <span className="text-xs font-medium text-gray-300">{label}</span>
              </div>
              <button
                className={`btn btn-sm ${on ? btn : 'btn-outline'} touch-manipulation`}
                onClick={() => setIndicator(key, !on)}
                aria-label={`${label}指示灯`}
              >
                {on ? '熄灭' : '点亮'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
