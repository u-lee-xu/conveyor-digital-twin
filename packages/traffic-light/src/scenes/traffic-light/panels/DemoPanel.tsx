import { useAppStore } from '../../../stores/useAppStore';
import { useDemoSim } from '../hooks/useDemoSim';
import { useTrafficStore } from '../useTrafficStore';
import { LAMP_COLORS } from '../constants';
import type { LampKey } from '../useTrafficStore';

const LAMP_META: Record<LampKey, { group: '东西' | '南北'; color: string }> = {
  ew_green: { group: '东西', color: LAMP_COLORS.green },
  ew_yellow: { group: '东西', color: LAMP_COLORS.yellow },
  ew_red: { group: '东西', color: LAMP_COLORS.red },
  ns_green: { group: '南北', color: LAMP_COLORS.green },
  ns_yellow: { group: '南北', color: LAMP_COLORS.yellow },
  ns_red: { group: '南北', color: LAMP_COLORS.red },
};

const LAMP_LABEL: Record<'red' | 'yellow' | 'green', string> = {
  red: '红灯',
  yellow: '黄灯',
  green: '绿灯',
};

/** 按方向分组的灯序（信号灯习惯：红→黄→绿 从上到下） */
const GROUP_LAMPS: { group: '东西' | '南北'; keys: LampKey[] }[] = [
  { group: '东西', keys: ['ew_red', 'ew_yellow', 'ew_green'] },
  { group: '南北', keys: ['ns_red', 'ns_yellow', 'ns_green'] },
];

export function DemoPanel() {
  const { running, start, stop, estop: triggerEstop, reset } = useDemoSim();
  const estop = useAppStore((s) => s.demoEStop);
  const demoPhase = useAppStore((s) => s.demoPhase);
  const demoCountdown = useAppStore((s) => s.demoCountdown);
  const lamps = useTrafficStore((s) => s.lamps);

  return (
    <div className="space-y-3">
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-200">参考程序</span>
          <span className={`status-badge ${
            estop ? 'bg-red-500/20 text-red-400 border-red-500/30' :
            running ? 'status-badge-active' : 'status-badge-inactive'
          }`}>
            <span className="mr-1">{estop ? '⚠' : running ? '▶' : '⏹'}</span>
            {estop ? '急停' : running ? '运行中' : '待机'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
          <span>{demoPhase}</span>
          <span className="font-mono text-slate-400">
            {running && !estop ? `东西 ${demoCountdown.ew}s · 南北 ${demoCountdown.ns}s` : '--'}
          </span>
        </div>
      </div>

      <div className="device-card">
        <div className="text-[0.65rem] font-bold text-slate-300 mb-2">当前灯态</div>
        <div className="grid grid-cols-2 gap-2">
          {GROUP_LAMPS.map(({ group, keys }) => (
            <div key={group} className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-2">
              <div className="text-[0.55rem] font-bold text-slate-400 mb-1.5">{group}方向</div>
              <div className="space-y-1">
                {keys.map((key) => {
                  const meta = LAMP_META[key];
                  const on = lamps[key];
                  const color = key.split('_')[1] as keyof typeof LAMP_LABEL;
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      <span
                        className="rounded-full w-2.5 h-2.5"
                        style={{
                          backgroundColor: on ? meta.color : '#475569',
                          boxShadow: on ? `0 0 8px ${meta.color}` : 'none',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.55rem',
                          color: on ? meta.color : '#64748b',
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {LAMP_LABEL[color]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="device-card">
        <div className="flex flex-col gap-2">
          <button
            onClick={start}
            disabled={running && !estop}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn touch-manipulation ${
              running && !estop ? 'bg-gray-600/30 text-gray-500 cursor-not-allowed' : 'btn-success'
            }`}
          >
            ▶ 启动演示
          </button>
          <div className="flex gap-2">
            {running && !estop && (
              <button
                onClick={stop}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn btn-warning touch-manipulation"
              >
                ⏹ 停止（完成当前循环）
              </button>
            )}
            {running && !estop && (
              <button
                onClick={triggerEstop}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn btn-danger touch-manipulation"
              >
                ⚠ 急停
              </button>
            )}
            {estop && (
              <button
                onClick={reset}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all btn btn-outline touch-manipulation"
              >
                ↻ 复位急停
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DemoPanel;
