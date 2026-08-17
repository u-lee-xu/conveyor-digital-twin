import { useDispensingStore } from '../../../stores/useDispensingStore';
import { RECIPE_LIMIT, MAGAZINE_LABELS, SLIDER_MIN_X, PULSES_PER_M, type MagazineId } from '../constants';

/**
 * 演示模式面板：配方设定（0~9 份/仓）+ 启动/停止/复位/急停 + 取药确认
 * 演示循环由 useDispenseLoop（hook）驱动
 */
export function DispenseDemoPanel() {
  const recipe = useDispensingStore((s) => s.recipe);
  const setRecipe = useDispensingStore((s) => s.setRecipe);
  const buttons = useDispensingStore((s) => s.buttons);
  const setButton = useDispensingStore((s) => s.setButton);
  const autoPhase = useDispensingStore((s) => s.autoPhase);
  const autoCycle = useDispensingStore((s) => s.autoCycle);
  const sliderX = useDispensingStore((s) => s.sliderX);
  const magStock = useDispensingStore((s) => s.magStock);
  const hopperPills = useDispensingStore((s) => s.hopperPills);
  const sensors = useDispensingStore((s) => s.sensors);

  const mags: MagazineId[] = ['A', 'B', 'C'];
  const encoder = Math.round((sliderX - SLIDER_MIN_X) * PULSES_PER_M);
  const running = autoPhase !== 'idle';

  const phaseLabel: Record<string, string> = {
    idle: '待机', travel: '移动中', dosing: '取药中', tilt: '翻转倒药', returning: '回程', wait_confirm: '待取药确认',
  };

  return (
    <div className="space-y-2">
      {/* 配方设定 */}
      <div className="card">
        <div className="section-title">配方设定（每仓份数 0-{RECIPE_LIMIT}）</div>
        <div className="space-y-1.5">
          {mags.map((mag) => (
            <div key={mag} className="flex items-center gap-2">
              <span className="text-[0.62rem] font-medium text-slate-300 w-10">{MAGAZINE_LABELS[mag]}</span>
              <button
                className="btn btn-xs btn-outline w-6 touch-manipulation"
                style={{ fontSize: '0.7rem' }}
                disabled={running || recipe[mag] <= 0}
                onClick={() => setRecipe(mag, recipe[mag] - 1)}
              >
                −
              </button>
              <span className="text-sm font-bold text-white w-5 text-center">{recipe[mag]}</span>
              <button
                className="btn btn-xs btn-outline w-6 touch-manipulation"
                style={{ fontSize: '0.7rem' }}
                disabled={running || recipe[mag] >= RECIPE_LIMIT}
                onClick={() => setRecipe(mag, recipe[mag] + 1)}
              >
                +
              </button>
              <span className={`badge ${magStock[mag] > 0 ? 'badge-slate' : 'badge-red'}`}>余{magStock[mag]}</span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 text-[0.55rem] text-slate-500">
          配方 = A×{recipe.A} + B×{recipe.B} + C×{recipe.C}（启动后锁定）
        </div>
      </div>

      {/* 主令按钮 */}
      <div className="card">
        <div className="section-title !mb-2">主令控制</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="btn btn-xs btn-success touch-manipulation"
            style={{ fontSize: '0.62rem' }}
            disabled={running || buttons.estop}
            onClick={() => setButton('start', true)}
          >
            ▶ 启动
          </button>
          <button
            className="btn btn-xs btn-warning touch-manipulation"
            style={{ fontSize: '0.62rem' }}
            disabled={!running}
            onClick={() => setButton('stop', true)}
          >
            ■ 停止
          </button>
          <button
            className="btn btn-xs btn-danger touch-manipulation"
            style={{ fontSize: '0.62rem' }}
            onClick={() => setButton('estop', true)}
          >
            ⚠ 急停
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            className="btn btn-xs btn-outline touch-manipulation"
            style={{ fontSize: '0.62rem' }}
            onClick={() => setButton('reset', true)}
          >
            ↺ 复位（回起点）
          </button>
          <button
            className="btn btn-xs btn-blue touch-manipulation flex-1"
            style={{ fontSize: '0.62rem' }}
            disabled={autoPhase !== 'wait_confirm'}
            onClick={() => setButton('confirm', true)}
          >
            ✓ 取药确认
          </button>
        </div>
      </div>

      {/* 运行状态 */}
      <div className="card">
        <div className="section-title !mb-1">运行状态</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge ${running ? 'badge-green' : 'badge-slate'}`}>{phaseLabel[autoPhase]}</span>
          <span className="badge badge-blue">轮次 {autoCycle}</span>
          <span className="badge badge-slate">位置 {sliderX.toFixed(2)}m</span>
          <span className="badge badge-slate">编码器 {encoder}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`badge ${sensors.limitStart ? 'badge-green' : 'badge-slate'}`}>起点限位</span>
          <span className={`badge ${sensors.limitEnd ? 'badge-green' : 'badge-slate'}`}>终点限位</span>
          <span className={`badge ${sensors.binHasDrug ? 'badge-yellow' : 'badge-slate'}`}>取药仓有药</span>
          <span className="badge badge-slate">料斗 {hopperPills}</span>
        </div>
      </div>
    </div>
  );
}