import { useTrafficStore, LAMP_KEYS, type LampKey } from '../useTrafficStore';
import { LAMP_COLORS } from '../constants';

/** 灯位显示元信息 */
const LAMP_META: Record<LampKey, { group: '东西' | '南北'; label: string; color: string }> = {
  ew_green: { group: '东西', label: '绿灯', color: LAMP_COLORS.green },
  ew_yellow: { group: '东西', label: '黄灯', color: LAMP_COLORS.yellow },
  ew_red: { group: '东西', label: '红灯', color: LAMP_COLORS.red },
  ns_green: { group: '南北', label: '绿灯', color: LAMP_COLORS.green },
  ns_yellow: { group: '南北', label: '黄灯', color: LAMP_COLORS.yellow },
  ns_red: { group: '南北', label: '红灯', color: LAMP_COLORS.red },
};

export function ManualPanel() {
  const lamps = useTrafficStore((s) => s.lamps);
  const setLamp = useTrafficStore((s) => s.setLamp);
  const buttons = useTrafficStore((s) => s.buttons);
  const setButton = useTrafficStore((s) => s.setButton);

  return (
    <div className="space-y-3">
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">灯位手动测试</span>
          <span className="text-[10px] text-slate-500">本地操作 · 无 PLC</span>
        </div>
        <div className="space-y-2">
          {(['东西', '南北'] as const).map((group) => (
            <div key={group} className="rounded-lg border border-slate-700/25 bg-slate-800/25 p-2">
              <div className="text-[0.65rem] font-bold text-slate-300 mb-1.5">{group}方向</div>
              <div className="grid grid-cols-3 gap-1.5">
                {LAMP_KEYS.filter((k) => LAMP_META[k].group === group).map((key) => {
                  const meta = LAMP_META[key];
                  const on = lamps[key];
                  return (
                    <button
                      key={key}
                      className="rounded-lg border px-2 py-2 flex flex-col items-center gap-1 transition-all touch-manipulation"
                      style={{
                        backgroundColor: on ? `${meta.color}22` : '#1e293b',
                        borderColor: on ? meta.color : '#334155',
                      }}
                      onClick={() => setLamp(key, !on)}
                      aria-pressed={on}
                      aria-label={`${meta.group}${meta.label}`}
                    >
                      <span
                        className="rounded-full w-3 h-3"
                        style={{
                          backgroundColor: on ? meta.color : '#475569',
                          boxShadow: on ? `0 0 10px ${meta.color}` : 'none',
                        }}
                      />
                      <span style={{ fontSize: '0.55rem', color: on ? meta.color : '#64748b' }}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">按钮状态</span>
          <span className="text-[10px] text-slate-500">仅指示 · 不驱动 PLC</span>
        </div>
        <div className="flex gap-2">
          {([['start', '启动', '#22c55e'], ['stop', '停止', '#eab308'], ['estop', '急停', '#ef4444']] as const).map(([key, label, color]) => (
            <button
              key={key}
              className="flex-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-all touch-manipulation"
              style={{
                backgroundColor: buttons[key] ? `${color}25` : '#1e293b',
                borderColor: buttons[key] ? color : '#334155',
                color: buttons[key] ? color : '#94a3b8',
              }}
              onMouseDown={() => setButton(key, true)}
              onMouseUp={() => setButton(key, false)}
              onMouseLeave={() => setButton(key, false)}
              onTouchStart={() => setButton(key, true)}
              onTouchEnd={() => setButton(key, false)}
              aria-label={`${label}按钮`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-sm btn-ghost w-full mt-3 touch-manipulation"
          onClick={() => useTrafficStore.getState().resetAll()}
        >
          全部复位
        </button>
      </div>
    </div>
  );
}

export default ManualPanel;
