/**
 * 三模式面板共享的样式、四罐读数、传感器信号、操作站、变量地址表
 */
/* eslint-disable react-refresh/only-export-components */
import { useState, type CSSProperties } from 'react';
import { useLiquidStore } from '../stores/useLiquidStore';
import {
  TANK_IDS, LIQUID_CAPACITY, LIQUID_TANKS,
  liquidDisplay, liquidLevelRatio,
  liquidBlendColor, liquidProductColor,
  LIQUID_OPERATOR_BUTTONS, LIQUID_OPERATOR_SELECTOR,
  type TankId, type LiquidOperatorKey, type LiquidOperatorMode,
} from '../constants/liquidConstants';
import {
  LIQUID_SENSOR_FEEDBACK, LIQUID_ADDRESS_ROWS, liquidSensorBits,
  type LiquidPanelHintKey,
} from '../constants/liquidVariables';
import { LiquidHint, LiquidSensorHint } from './LiquidAddressHint';
import { pressLiquidOperator, selectLiquidOperatorMode } from './liquidOperator';

/**
 * 设计令牌对齐平台壳 packages/platform/src/index.css 的 .device-card / .btn-outline。
 * 液体混装左栏约 245px、信息密度高，直接套 .device-card 的 padding 20px / radius 16px
 * 会把四罐读数重新挤出 900px 视口，因此只统一配色与圆角语言，保留紧凑尺寸。
 * 后续全场景统一时改由共享类 .device-card--compact 提供，本包不再自带一份常量。
 */
export const box: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(30,41,59,.9) 0%, rgba(15,23,42,.95) 100%)',
  border: '1px solid rgba(71,85,105,.5)', borderRadius: 10,
  padding: '6px 9px', marginBottom: 6,
};
export const btn: CSSProperties = {
  padding: '3px 7px', borderRadius: 8, cursor: 'pointer',
  background: 'rgba(30,41,59,.5)', border: '1px solid rgba(71,85,105,.5)',
  color: '#cbd5e1', fontSize: 11, fontWeight: 600, transition: 'all .15s ease',
};

const led = (on: boolean, color: string): CSSProperties => ({
  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
  background: on ? color : '#334155', border: '1px solid rgba(148,163,184,.45)', marginRight: 3,
});

/** 四罐 REAL 液位读数 → 地址浮框键，键的取值由 LIQUID_PANEL_HINT_SIGNALS 校验 */
export const LEVEL_HINT: Record<TankId, LiquidPanelHintKey> = {
  a: 'levelA', b: 'levelB', mix: 'levelMix', product: 'levelProduct',
};

/**
 * 四罐去皮后 REAL 读数 + 容量 + 百分比条。
 * 液位开关不再在这里逐罐挂 LED —— 开关量统一在「传感器信号」一块里按 PLC 回写顺序列出，
 * 避免同一批信号在面板上出现两套顺序。
 */
export function LiquidLevelReadout() {
  const volumes = useLiquidStore((s) => s.volumes);
  const tare = useLiquidStore((s) => s.tare);
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
          return (
            <div key={tank} style={{ fontFamily: 'monospace', marginTop: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                <span><LiquidHint hintKey={LEVEL_HINT[tank]} title={`${LIQUID_TANKS[tank].label}液位`}>{LIQUID_TANKS[tank].label}</LiquidHint></span>
                <span style={{ color: '#93c5fd' }}>{shown.toFixed(2)} / {LIQUID_CAPACITY[tank]} L</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <div style={{ flex: 1, height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(ratio * 100).toFixed(1)}%`, height: '100%', background: tankColor(tank) }} />
                </div>
                <span style={{ width: 32, textAlign: 'right', color: '#94a3b8' }}>{(ratio * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 传感器信号：8 路液位开关，顺序与回写表 / 位掩码 / 三协议地址完全一致。
 * A/B 罐下限 + 混合罐四档（低 / 中 / 高 / 上极限）+ 成品罐上下限；
 * 搅拌运行与阀门到位不是传感器，已按用户口径剔除。
 */
export function LiquidSensorPanel() {
  const sensors = useLiquidStore((s) => s.sensors);
  const bits = liquidSensorBits(sensors);
  return (
    <div style={box}>
      <b><LiquidHint hintKey="sensorMask" title="开关量掩码">传感器信号</LiquidHint></b>
      <div data-dt-liquid-sensors style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
        {LIQUID_SENSOR_FEEDBACK.map((r, i) => (
          <span key={r.key} style={{ display: 'inline-block', width: '50%', whiteSpace: 'nowrap' }}>
            <span style={led(bits[i], '#4ade80')} />
            <LiquidSensorHint sensorKey={r.key} label={r.signal} /> {bits[i] ? 'ON' : 'OFF'}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ 操作站 ------------------------------ */

/** 操作件 → 地址浮框键，取值由 LIQUID_PANEL_HINT_SIGNALS 校验 */
const OP_HINT: Record<LiquidOperatorKey, LiquidPanelHintKey> = {
  start: 'opStart', stop: 'opStop', reset: 'opReset',
  estop: 'opEstop', release: 'opRelease',
};

/** 点动按钮的松开态：中性灰，按下时才亮该件自己的柜面颜色 */
const OP_OFF_COLOR = '#334155';
/** 手自动两档的按下色：手动中性灰、自动语义蓝，与柜面旋钮铭牌一致 */
const OP_MODE_ON_COLOR: Record<LiquidOperatorMode, string> = {
  manual: '#64748b', auto: '#2563a8',
};

/** 单个点动按钮：柜面颜色 → --dt-state-color，按下 / 松开走同一写通道 */
function OperatorPushButton({ item }: { item: (typeof LIQUID_OPERATOR_BUTTONS)[number] }) {
  const on = useLiquidStore((s) => s.operator[item.key]);
  const press = (down: boolean) => pressLiquidOperator(item.key, down);
  return (
    <button type="button" aria-label={item.label} aria-pressed={on}
      data-dt-liquid-op={item.key} data-on={on ? '1' : '0'}
      className="btn btn-xs dt-executor touch-manipulation"
      style={{ '--dt-state-color': on ? item.color : OP_OFF_COLOR } as CSSProperties}
      onPointerDown={(e) => { e.preventDefault(); press(true); }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onPointerLeave={() => { if (on) press(false); }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(true); }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') press(false);
      }}>
      <span className="dt-state-led" />
      <LiquidHint hintKey={OP_HINT[item.key]} title={item.label} underline={false}>
        {item.label}
      </LiquidHint>
    </button>
  );
}

/**
 * 操作站：五个点动按钮 + 手自动两位选择开关。
 * 与 3D 开关柜柜面同源同序（LIQUID_OPERATOR_BUTTONS 是唯一来源），
 * 按下即写 PLC 输入点（见 liquidOperator.ts），仿真模式下动作权交给学生 PLC 程序。
 */
export function LiquidOperatorPanel() {
  const operator = useLiquidStore((s) => s.operator);
  const held = LIQUID_OPERATOR_BUTTONS.filter((b) => operator[b.key]);
  const pushRow = LIQUID_OPERATOR_BUTTONS.filter((b) => b.key !== 'release');
  const release = LIQUID_OPERATOR_BUTTONS.find((b) => b.key === 'release')!;
  return (
    <div style={box} data-dt-liquid-operator>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span className="section-title" style={{ flex: 1, fontSize: 11, color: '#94a3b8', marginBottom: 0 }}>
          操作站
        </span>
        <span className={`badge ${operator.mode === 'auto' ? 'badge-blue' : 'badge-slate'}`} data-dt-liquid-op-mode-badge>
          {LIQUID_OPERATOR_SELECTOR[operator.mode]}档
        </span>
        <span className={`badge ${held.length ? 'badge-yellow' : 'badge-slate'}`}>
          {held.length} / {LIQUID_OPERATOR_BUTTONS.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5 }}>
        {pushRow.map((b) => <OperatorPushButton key={b.key} item={b} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, marginTop: 5 }}>
        {(['manual', 'auto'] as const).map((m) => {
          const on = operator.mode === m;
          const label = LIQUID_OPERATOR_SELECTOR[m];
          return (
            <button key={m} type="button" aria-label={`${label}档`} aria-pressed={on}
              data-dt-liquid-op-mode={m} data-on={on ? '1' : '0'}
              className="btn btn-xs dt-executor touch-manipulation"
              style={{ '--dt-state-color': on ? OP_MODE_ON_COLOR[m] : OP_OFF_COLOR } as CSSProperties}
              onClick={() => selectLiquidOperatorMode(m)}>
              <span className="dt-state-led" />
              <LiquidHint hintKey={m === 'auto' ? 'opAuto' : 'opManual'} title={`${label}档`} underline={false}>
                {label}
              </LiquidHint>
            </button>
          );
        })}
        <OperatorPushButton item={release} />
      </div>
      {/* 操作站真值诊断锚点：档位 + 五个点动件姿态，供验收脚本核对「面板与柜面同源」 */}
      <span data-dt-liquid-operator-state style={{ display: 'none' }}>
        {`mode=${operator.mode}|${LIQUID_OPERATOR_BUTTONS.map((b) => `${b.key}=${operator[b.key] ? 1 : 0}`).join(',')}`}
      </span>
    </div>
  );
}

/** 仿真模式常驻的三协议变量地址表（表头恒「信号 / 三菱 FX / Modbus TCP / Siemens S7」） */
export function LiquidVariableTable() {
  // 默认折叠：仿真模式首屏优先让四罐读数 / 传感器信号完整可见，需要时再展开地址表
  const [open, setOpen] = useState(false);
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

/** 报警灯 + 文本 + 复位已按用户口径整体移除：内部联锁仍在真值层，但既不进面板也不进地址表 */
