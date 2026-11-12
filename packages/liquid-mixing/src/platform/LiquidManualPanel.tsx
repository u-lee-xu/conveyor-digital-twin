/** 手动模式：5 执行器切换 / 配方设定 / 四罐去皮与任意读数 / 调试主令 + 只读读数 */
import { useState } from 'react';
import { useLiquidStore } from '../stores/useLiquidStore';
import {
  TANK_IDS, LIQUID_INITIAL_VOLUMES, LIQUID_TANKS, type TankId, type Outputs,
} from '../constants/liquidConstants';
import {
  box, btn, inputStyle,
  LiquidLevelReadout, LiquidStatusPanel, LiquidAlarmPanel, LiquidRecipeEditor,
} from './LiquidPanelParts';

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

  const toggles: { key: keyof Outputs; label: string }[] = [
    { key: 'valveA', label: 'A 进料阀' },
    { key: 'valveB', label: 'B 进料阀' },
    { key: 'stirForward', label: '搅拌正转点动' },
    { key: 'stirReverse', label: '搅拌反转点动' },
    { key: 'discharge', label: '出料阀' },
  ];

  return (
    <div data-dt-liquid-manual>
      <div style={box}>
        <b>执行器</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {toggles.map((t) => (
            <button key={t.key} type="button" aria-label={t.label}
              style={{ ...btn, background: outputs[t.key] ? '#1d4ed8' : undefined }}
              onClick={() => setOutput(t.key, !outputs[t.key])}>
              {t.label} {outputs[t.key] ? 'ON' : 'OFF'}
            </button>
          ))}
        </div>
      </div>

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

      <LiquidLevelReadout />
      <LiquidStatusPanel />
      <LiquidAlarmPanel />
    </div>
  );
}
