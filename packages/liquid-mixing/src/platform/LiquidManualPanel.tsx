/** 手动模式：5 执行器切换 / 配方设定 / 四罐去皮与任意读数 / 调试主令 + 只读读数 */
import { useState, type CSSProperties } from 'react';
import { useLiquidStore } from '../stores/useLiquidStore';
import {
  TANK_IDS, LIQUID_INITIAL_VOLUMES, LIQUID_TANKS,
  liquidValveStateColor, type TankId, type Outputs,
} from '../constants/liquidConstants';
import {
  box, btn, inputStyle,
  LiquidLevelReadout, LiquidStatusPanel, LiquidAlarmPanel, LiquidRecipeEditor,
} from './LiquidPanelParts';
import { LiquidHint } from './LiquidAddressHint';
import { type LiquidPanelHintKey } from '../constants/liquidVariables';

/** 五个执行器按钮 → 输出线圈地址浮框键；去皮 / 调试主令是本地动作，不标地址 */
const EXECUTOR_HINT: Record<keyof Outputs, LiquidPanelHintKey> = {
  valveA: 'valveA', valveB: 'valveB',
  stirForward: 'stirForward', stirReverse: 'stirReverse', discharge: 'discharge',
};

/**
 * 面板内容契约第一块：执行器按信号类型分簇，三个阀门一排、搅拌正反转一排。
 * label 是按钮短标签（窄栏只放得下 3~4 字），title 是地址浮框里的完整信号名。
 */
const EXECUTOR_ROWS: { key: keyof Outputs; label: string; title: string }[][] = [
  [
    { key: 'valveA', label: 'A 进料阀', title: 'A 进料阀 / 泵' },
    { key: 'valveB', label: 'B 进料阀', title: 'B 进料阀 / 泵' },
    { key: 'discharge', label: '出料阀', title: '出料阀' },
  ],
  [
    { key: 'stirForward', label: '搅拌正', title: '搅拌正转' },
    { key: 'stirReverse', label: '搅拌反', title: '搅拌反转' },
  ],
];

/** 三个阀门用与 3D 同源的状态色；搅拌点动用共享语义蓝，避免与阀位混淆 */
const valveKeys: (keyof Outputs)[] = ['valveA', 'valveB', 'discharge'];
const STIR_ON_COLOR = '#3b82f6';
const STIR_OFF_COLOR = '#64748b';

/** 状态色由场景纯函数写入 CSS 变量，按钮形状仍由平台壳共享 .btn 提供 */
const stateStyle = (color: string): CSSProperties => ({ '--dt-state-color': color } as CSSProperties);

export function LiquidManualPanel() {
  const outputs = useLiquidStore((s) => s.outputs);
  const volumes = useLiquidStore((s) => s.volumes);
  const setOutput = useLiquidStore((s) => s.setOutput);
  const setVolume = useLiquidStore((s) => s.setVolume);
  const tareTo = useLiquidStore((s) => s.tareTo);
  const resetTare = useLiquidStore((s) => s.resetTare);
  const resetAll = useLiquidStore((s) => s.resetAll);
  const clearAlarm = useLiquidStore((s) => s.clearAlarm);
  const [tareInputs, setTareInputs] = useState<Record<TankId, string>>({
    a: '0.0', b: '0.0', mix: '0.0', product: '0.0',
  });

  const activeCount = EXECUTOR_ROWS.flat().filter((t) => outputs[t.key]).length;

  return (
    <div data-dt-liquid-manual>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="section-title" style={{ flex: 1, fontSize: 11, color: '#94a3b8', marginBottom: 0 }}>
            执行器
          </span>
          <span className={`badge ${activeCount ? 'badge-green' : 'badge-slate'}`}>
            {activeCount} / {EXECUTOR_ROWS.flat().length}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          {EXECUTOR_ROWS.map((row, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
              gap: 5,
            }}>
              {row.map((t) => {
                const on = outputs[t.key];
                const isValve = valveKeys.includes(t.key);
                const stateColor = liquidValveStateColor(on);
                return (
                  <button key={t.key} type="button" aria-label={t.label} aria-pressed={on}
                    data-dt-liquid-executor={t.key} data-on={on ? '1' : '0'}
                    className="btn btn-xs dt-executor touch-manipulation"
                    style={stateStyle(isValve ? stateColor : (on ? STIR_ON_COLOR : STIR_OFF_COLOR))}
                    onClick={() => setOutput(t.key, !on)}>
                    <span className="dt-state-led" />
                    <LiquidHint hintKey={EXECUTOR_HINT[t.key]} title={t.title} underline={false}>
                      {t.label}
                    </LiquidHint>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 关键读数上移：常规视口首屏就能看到四罐液位与状态，设定类控件下沉 */}
      <LiquidLevelReadout />
      <LiquidStatusPanel />
      <LiquidAlarmPanel />

      <LiquidRecipeEditor />

      <div style={box}>
        <b>去皮设定</b>
        {TANK_IDS.map((tank) => (
          <div key={tank} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 5, fontFamily: 'monospace', flexWrap: 'wrap' }}>
            <span style={{ width: 84, color: '#94a3b8' }}>{LIQUID_TANKS[tank].label}</span>
            <button aria-label={`${LIQUID_TANKS[tank].label} 设 0.0 点`} style={{ ...btn, background: '#1d4ed8' }}
              onClick={() => { tareTo(tank, 0); setTareInputs((p) => ({ ...p, [tank]: '0.0' })); }}>
              设 0.0 点
            </button>
            <input aria-label={`${LIQUID_TANKS[tank].label} 当前点读数`} type="number" style={inputStyle}
              value={tareInputs[tank]} onChange={(e) => setTareInputs((p) => ({ ...p, [tank]: e.target.value }))} />
            <button aria-label={`${LIQUID_TANKS[tank].label} 设置当前点`} style={btn}
              onClick={() => tareTo(tank, Number(tareInputs[tank]))}>设置</button>
          </div>
        ))}
        <span data-dt-liquid-tare style={{ display: 'none' }}>
          {TANK_IDS.map((tank) => volumes[tank].toFixed(3)).join(',')}
        </span>
      </div>

      <div style={box}>
        <b>调试主令</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="去皮复位" style={btn} onClick={() => resetTare()}>去皮复位</button>
          <button aria-label="回补原液" style={btn}
            onClick={() => { setVolume('a', LIQUID_INITIAL_VOLUMES.a); setVolume('b', LIQUID_INITIAL_VOLUMES.b); }}>
            回补原液
          </button>
          <button aria-label="全部复位" style={btn} onClick={() => resetAll()}>全部复位</button>
          <button aria-label="报警复位" style={btn} onClick={() => clearAlarm()}>报警复位</button>
        </div>
      </div>

    </div>
  );
}
