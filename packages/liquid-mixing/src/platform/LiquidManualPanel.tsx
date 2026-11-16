/** 手动模式：5 执行器 / 三色灯 / 液位读数 / 传感器信号 / 调试主令 */
import type { CSSProperties } from 'react';
import { useLiquidStore } from '../stores/useLiquidStore';
import {
  LIQUID_INITIAL_VOLUMES,
  liquidValveStateColor, liquidLampStateColor,
  type Outputs, type LiquidLampKind,
} from '../constants/liquidConstants';
import {
  box, btn,
  LiquidLevelReadout, LiquidSensorPanel, LiquidAlarmPanel,
} from './LiquidPanelParts';
import { LiquidHint } from './LiquidAddressHint';
import { type LiquidPanelHintKey } from '../constants/liquidVariables';

/** 五个执行器按钮 → 输出线圈地址浮框键；调试主令是本地动作，不标地址 */
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

/**
 * 面板内容契约第二块：三色灯独立成簇，绿 / 黄 / 红三个灯罩对应 PLC 三个输出线圈。
 * 顺序与 LIQUID_LAMP_COIL_NAMES、地址表、3D 灯塔自下而上完全一致。
 */
const LAMP_ROWS: { key: LiquidLampKind; label: string; title: string; hint: LiquidPanelHintKey }[] = [
  { key: 'green', label: '绿', title: '三色灯 绿', hint: 'lampGreen' },
  { key: 'yellow', label: '黄', title: '三色灯 黄', hint: 'lampYellow' },
  { key: 'red', label: '红', title: '三色灯 红', hint: 'lampRed' },
];

/** 三个阀门用与 3D 同源的状态色；搅拌点动用共享语义蓝，避免与阀位混淆 */
const valveKeys: (keyof Outputs)[] = ['valveA', 'valveB', 'discharge'];
const STIR_ON_COLOR = '#3b82f6';
const STIR_OFF_COLOR = '#64748b';

/** 状态色由场景纯函数写入 CSS 变量，按钮形状仍由平台壳共享 .btn 提供 */
const stateStyle = (color: string): CSSProperties => ({ '--dt-state-color': color } as CSSProperties);

export function LiquidManualPanel() {
  const outputs = useLiquidStore((s) => s.outputs);
  const lamps = useLiquidStore((s) => s.lamps);
  const setOutput = useLiquidStore((s) => s.setOutput);
  const setLamp = useLiquidStore((s) => s.setLamp);
  const setVolume = useLiquidStore((s) => s.setVolume);
  const resetAll = useLiquidStore((s) => s.resetAll);

  const activeCount = EXECUTOR_ROWS.flat().filter((t) => outputs[t.key]).length;
  const lampCount = LAMP_ROWS.filter((t) => lamps[t.key]).length;

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
        {/* 阀门状态色诊断锚点：与 3D 同一纯函数，供验收脚本核对「面板与场景同源」 */}
        <span data-dt-liquid-valve style={{ display: 'none' }}>
          {`valveA=${outputs.valveA ? 1 : 0}:${liquidValveStateColor(outputs.valveA)}|valveB=${outputs.valveB ? 1 : 0}:${liquidValveStateColor(outputs.valveB)}|discharge=${outputs.discharge ? 1 : 0}:${liquidValveStateColor(outputs.discharge)}`}
        </span>
      </div>

      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="section-title" style={{ flex: 1, fontSize: 11, color: '#94a3b8', marginBottom: 0 }}>
            三色灯
          </span>
          <span className={`badge ${lampCount ? 'badge-yellow' : 'badge-slate'}`}>
            {lampCount} / {LAMP_ROWS.length}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LAMP_ROWS.length}, minmax(0, 1fr))`, gap: 5 }}>
          {LAMP_ROWS.map((t) => {
            const on = lamps[t.key];
            return (
              <button key={t.key} type="button" aria-label={`三色灯 ${t.label}`} aria-pressed={on}
                data-dt-liquid-lamp={t.key} data-on={on ? '1' : '0'}
                className="btn btn-xs dt-executor touch-manipulation"
                style={stateStyle(liquidLampStateColor(t.key, on))}
                onClick={() => setLamp(t.key, !on)}>
                <span className="dt-state-led" />
                <LiquidHint hintKey={t.hint} title={t.title} underline={false}>
                  {t.label}
                </LiquidHint>
              </button>
            );
          })}
        </div>
        <span data-dt-liquid-lamps style={{ display: 'none' }}>
          {LAMP_ROWS.map((t) => `${t.key}=${lamps[t.key] ? 1 : 0}`).join(',')}
        </span>
      </div>

      {/* 关键读数上移：常规视口首屏就能看到四罐液位与传感器信号 */}
      <LiquidLevelReadout />
      <LiquidSensorPanel />
      <LiquidAlarmPanel />

      <div style={box}>
        <b>调试主令</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="回补原液" style={btn}
            onClick={() => { setVolume('a', LIQUID_INITIAL_VOLUMES.a); setVolume('b', LIQUID_INITIAL_VOLUMES.b); }}>
            回补原液
          </button>
          <button aria-label="全部复位" style={btn} onClick={() => resetAll()}>全部复位</button>
        </div>
      </div>

    </div>
  );
}
