/** 三模式面板共享的样式、液位读数、状态读数、变量地址表、报警与配方控件 */
/* eslint-disable react-refresh/only-export-components */
import { useState, type CSSProperties } from 'react';
import { useLiquidStore, liquidRatioA } from '../stores/useLiquidStore';
import {
  TANK_IDS, LIQUID_CAPACITY, LIQUID_TANKS, LIQUID_PHASE_LABEL,
  liquidDisplay, liquidLevelRatio, liquidAlarmText,
  liquidBlendColor, liquidProductColor, liquidValveStateColor,
  type TankId, type LiquidSensors,
} from '../constants/liquidConstants';
import {
  LIQUID_SENSOR_FEEDBACK, LIQUID_ADDRESS_ROWS, liquidSensorBits,
} from '../constants/liquidVariables';

export const box: CSSProperties = { background: 'rgba(30,41,59,.9)', border: '1px solid rgba(100,116,139,.4)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 };
export const btn: CSSProperties = { padding: '3px 7px', borderRadius: 5, cursor: 'pointer', background: 'rgba(71,85,105,.6)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0', fontSize: 11 };
export const inputStyle: CSSProperties = { width: 62, padding: '2px 5px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, fontSize: 11 };

const led = (on: boolean, color: string): CSSProperties => ({
  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
  background: on ? color : '#334155', border: '1px solid rgba(148,163,184,.45)', marginRight: 3,
});

const HIGH_LOW: Record<TankId, { high: keyof LiquidSensors; low: keyof LiquidSensors }> = {
  a: { high: 'aHigh', low: 'aLow' },
  b: { high: 'bHigh', low: 'bLow' },
  mix: { high: 'mixHigh', low: 'mixLow' },
  product: { high: 'productHigh', low: 'productLow' },
};

/** 四罐去皮后 REAL 读数 + 容量 + 百分比条 + 上下限 LED */
export function LiquidLevelReadout() {
  const volumes = useLiquidStore((s) => s.volumes);
  const tare = useLiquidStore((s) => s.tare);
  const sensors = useLiquidStore((s) => s.sensors);
  const mixA = useLiquidStore((s) => s.mixA);
  const mixB = useLiquidStore((s) => s.mixB);
  const productA = useLiquidStore((s) => s.productA);
  const productB = useLiquidStore((s) => s.productB);
  /** 混合罐 / 成品罐读数条颜色与 3D 液柱同源：成品 = 混合后的液体，同一个纯函数 */
  const tankColor = (tank: TankId) => {
    if (tank === 'mix') return liquidBlendColor(mixA, mixB);
    if (tank === 'product') return liquidProductColor(productA, productB);
    return LIQUID_TANKS[tank].color;
  };
  return (
    <div style={box}>
      <span data-dt-liquid-color style={{ display: 'none' }}>
        {`mix=${liquidBlendColor(mixA, mixB)}|product=${liquidProductColor(productA, productB)}`}
      </span>
      <div data-dt-liquid-levels style={{ marginTop: 2 }}>
        <b>液位读数 REAL 32</b>
        {TANK_IDS.map((tank) => {
          const shown = liquidDisplay(tank, volumes, tare);
          const ratio = liquidLevelRatio(tank, volumes[tank]);
          const keys = HIGH_LOW[tank];
          return (
            <div key={tank} style={{ fontFamily: 'monospace', marginTop: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                <span>{LIQUID_TANKS[tank].label}</span>
                <span style={{ color: '#93c5fd' }}>{shown.toFixed(2)} / {LIQUID_CAPACITY[tank]} L</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <div style={{ flex: 1, height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(ratio * 100).toFixed(1)}%`, height: '100%', background: tankColor(tank) }} />
                </div>
                <span style={{ width: 32, textAlign: 'right', color: '#94a3b8' }}>{(ratio * 100).toFixed(0)}%</span>
                <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8' }}>
                  <span style={led(sensors[keys.high], '#f87171')} />上限
                  <span style={{ ...led(sensors[keys.low], '#fbbf24'), marginLeft: 6 }} />下限
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 阶段 / 轮次 / 配比 A / 5 执行器 / 14 路开关量 / 搅拌方向 */
export function LiquidStatusPanel() {
  const phase = useLiquidStore((s) => s.phase);
  const round = useLiquidStore((s) => s.round);
  const mixA = useLiquidStore((s) => s.mixA);
  const mixB = useLiquidStore((s) => s.mixB);
  const outputs = useLiquidStore((s) => s.outputs);
  const sensors = useLiquidStore((s) => s.sensors);
  const stirDirection = useLiquidStore((s) => s.stirDirection);
  const mixUniformity = useLiquidStore((s) => s.mixUniformity);
  const bits = liquidSensorBits(sensors);
  return (
    <>
      <div style={box}>
        <b>状态读数</b>
        <span data-dt-liquid-valve style={{ display: 'none' }}>
          {`valveA=${outputs.valveA ? 1 : 0}:${liquidValveStateColor(outputs.valveA)}|valveB=${outputs.valveB ? 1 : 0}:${liquidValveStateColor(outputs.valveB)}|discharge=${outputs.discharge ? 1 : 0}:${liquidValveStateColor(outputs.discharge)}`}
        </span>
        <div data-dt-liquid-status style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
          <div>阶段 {phase} {LIQUID_PHASE_LABEL[phase]} 轮次 {round}</div>
          <div>配比 A {(liquidRatioA(mixA, mixB) * 100).toFixed(0)} % 搅拌方向 {stirDirection === 1 ? '正转' : stirDirection === -1 ? '反转' : '停止'}</div>
          <div>
            <span style={{ color: liquidValveStateColor(outputs.valveA) }}>A 阀 {outputs.valveA ? 'ON' : 'OFF'}</span>
            {' '}<span style={{ color: liquidValveStateColor(outputs.valveB) }}>B 阀 {outputs.valveB ? 'ON' : 'OFF'}</span>
            {' '}正转 {outputs.stirForward ? 'ON' : 'OFF'} 反转 {outputs.stirReverse ? 'ON' : 'OFF'}
            {' '}<span style={{ color: liquidValveStateColor(outputs.discharge) }}>出料 {outputs.discharge ? 'ON' : 'OFF'}</span>
          </div>
          <div data-dt-liquid-uniformity data-value={mixUniformity.toFixed(3)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ color: '#94a3b8' }}>混合均匀度</span>
            <span style={{ flex: 1, height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${(mixUniformity * 100).toFixed(1)}%`,
                height: '100%', background: '#c084fc' }} />
            </span>
            <span style={{ width: 34, textAlign: 'right', color: '#e9d5ff' }}>
              {(mixUniformity * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
      <div style={box}>
        <b>开关量状态 14 路</b>
        <div data-dt-liquid-sensors style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
          {LIQUID_SENSOR_FEEDBACK.map((r, i) => (
            <span key={r.key} style={{ display: 'inline-block', width: '50%', whiteSpace: 'nowrap' }}>
              <span style={led(bits[i], '#4ade80')} />{r.signal} {bits[i] ? 'ON' : 'OFF'}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/** 仿真模式常驻的三协议变量地址表（表头恒「信号 / 三菱 FX / Modbus TCP / Siemens S7」） */
export function LiquidVariableTable() {
  const [open, setOpen] = useState(true);
  return (
    <div style={box}>
      <button aria-label="变量地址表" style={{ ...btn, width: '100%' }} onClick={() => setOpen((v) => !v)}>
        变量地址表 {open ? '收起' : '展开'}
      </button>
      {open && (
        <table data-dt-liquid-addresses style={{ width: '100%', marginTop: 6, fontSize: 10, borderCollapse: 'collapse', fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ color: '#93c5fd' }}>
              <th style={{ textAlign: 'left', padding: '2px 3px' }}>信号</th>
              <th style={{ textAlign: 'left' }}>三菱 FX</th>
              <th style={{ textAlign: 'left' }}>Modbus TCP</th>
              <th style={{ textAlign: 'left' }}>Siemens S7</th>
            </tr>
          </thead>
          <tbody>
            {LIQUID_ADDRESS_ROWS.map((r) => (
              <tr key={r.signal} style={{ color: '#e2e8f0' }}>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)', padding: '2px 3px' }}>{r.signal}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.mitsubishi}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.modbus}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.s7}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 报警灯 + 文本 + 复位 */
export function LiquidAlarmPanel() {
  const alarm = useLiquidStore((s) => s.alarm);
  const clearAlarm = useLiquidStore((s) => s.clearAlarm);
  return (
    <div data-dt-liquid-alarm style={{ ...box, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={led(alarm !== 0, '#ef4444')} />
      <b>报警</b>
      <span style={{ fontFamily: 'monospace', color: alarm !== 0 ? '#fca5a5' : '#86efac' }}>{liquidAlarmText(alarm)}</span>
      <button aria-label="报警复位" style={{ ...btn, marginLeft: 'auto' }} onClick={() => clearAlarm()}>报警复位</button>
    </div>
  );
}

/** 四个数字输入写 setRecipe，带单位短标签 */
export function LiquidRecipeEditor() {
  const recipe = useLiquidStore((s) => s.recipe);
  const setRecipe = useLiquidStore((s) => s.setRecipe);
  return (
    <div data-dt-liquid-recipe style={box}>
      <b>配方设定</b>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center', fontFamily: 'monospace' }}>
        <span style={{ color: '#94a3b8' }}>A 目标</span>
        <input aria-label="A 目标量" type="number" style={inputStyle} value={recipe.targetA}
          onChange={(e) => setRecipe({ targetA: Number(e.target.value) })} />
        <span style={{ color: '#94a3b8' }}>L</span>
        <span style={{ color: '#94a3b8' }}>B 目标</span>
        <input aria-label="B 目标量" type="number" style={inputStyle} value={recipe.targetB}
          onChange={(e) => setRecipe({ targetB: Number(e.target.value) })} />
        <span style={{ color: '#94a3b8' }}>L</span>
        <span style={{ color: '#94a3b8' }}>正转</span>
        <input aria-label="正转时长" type="number" style={inputStyle} value={recipe.stirForwardSec}
          onChange={(e) => setRecipe({ stirForwardSec: Number(e.target.value) })} />
        <span style={{ color: '#94a3b8' }}>s</span>
        <span style={{ color: '#94a3b8' }}>反转</span>
        <input aria-label="反转时长" type="number" style={inputStyle} value={recipe.stirReverseSec}
          onChange={(e) => setRecipe({ stirReverseSec: Number(e.target.value) })} />
        <span style={{ color: '#94a3b8' }}>s</span>
      </div>
    </div>
  );
}
