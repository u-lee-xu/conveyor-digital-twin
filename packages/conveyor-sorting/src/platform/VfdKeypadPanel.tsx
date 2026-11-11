/**
 * 汇川 MD520 变频器 LED 操作面板（UI 面板形态）。
 *
 * 外观与交互按用户手册 16.1 / 快速入门表 4-1~4-3 / 图 4-3：
 *  - 6 位辅显示区 + 5 位主显示区、单位灯、状态灯丝印、4 菜单灯
 *  - 10 个按键：菜单 / 编程返回 / 确认 / 递增递减 / 左右移位 / 运行 / 停机复位 / MF.K
 *  - 三级菜单、闪烁位编辑、ENTER 自动跳下一参数、PRG 放弃、菜单键长按切主辅显示区
 * 只读 DI/DO/STO 端子状态条按图 3-9 端子顺序；面板不写任何原理说明。
 */
import { useCallback, useMemo } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { useVfdStore } from '../stores/useVfdStore';
import { keypadDisplay, type KeypadKey } from '../vfd/md520Keypad';
import {
  MD520_DI, MD520_DO, MD520_FAULTS, MD520_MENUS, MD520_MENU_LABELS,
  MD520_PARAM_MAP, MD520_UNITS, MD520_MULTI_SPEED, MD520_AI, MD520_COMM,
} from '../vfd/md520Spec';

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', b: 'cdefg', C: 'adef', d: 'bcdeg', E: 'adefg', F: 'aefg',
  r: 'eg', H: 'bcefg', J: 'bcd', L: 'def', n: 'ceg', o: 'cdeg',
  P: 'abefg', T: 'defg', U: 'bcdef', y: 'bcdfg', '-': 'g', ' ': '',
};

const SEG_RECT: Record<string, [number, number, number, number]> = {
  a: [4, 1, 12, 2.5], b: [16, 3.5, 2.5, 10], c: [16, 17, 2.5, 10],
  d: [4, 28, 12, 2.5], e: [1.5, 17, 2.5, 10], f: [1.5, 3.5, 2.5, 10],
  g: [4, 14.5, 12, 2.5],
};

function SevenSegment({ chars, dotIndex, blinkIndex, small }: {
  chars: string; dotIndex: number | null; blinkIndex: number | null; small?: boolean;
}) {
  const list = chars.split('').slice(0, small ? 6 : 5);
  const w = small ? 17 : 22;
  const h = small ? 26 : 32;
  return (
    <div style={{ display: 'flex', gap: small ? 1 : 2 }}>
      {list.map((ch, i) => {
        const on = SEGMENTS[ch] ?? '';
        const scale = small ? 0.8 : 1;
        return (
          <svg key={i} width={w} height={h} viewBox="0 0 20 32" aria-hidden="true"
            style={{ opacity: blinkIndex === i ? 0.45 : 1 }}>
            {Object.entries(SEG_RECT).map(([seg, [x, y, sw, sh]]) => (
              <rect key={seg} x={x} y={y} width={sw} height={sh} rx={0.8 * scale}
                fill={on.includes(seg) ? '#ff6b45' : '#3a1f1c'} />
            ))}
            {dotIndex === i && (
              <circle cx={18.2} cy={29} r={1.5} fill="#ff6b45" />
            )}
          </svg>
        );
      })}
    </div>
  );
}

function Led({ label, on, blink }: { label: string; on: boolean; blink?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10,
      color: on ? '#fca5a5' : '#64748b',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: on ? '#f43f5e' : '#334155',
        boxShadow: on ? '0 0 6px #f43f5e' : 'none',
        opacity: blink && on ? 0.55 : 1,
      }} />
      {label}
    </span>
  );
}

const KEY_STYLE: React.CSSProperties = {
  background: '#1e293b', color: '#cbd5e1', border: '1px solid #475569',
  borderRadius: 6, minHeight: 30, fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function Key({ label, name, onPress, span, disabled }: {
  label: string; name: string; onPress: (k: KeypadKey) => void; span?: number; disabled?: boolean;
}) {
  return (
    <button type="button" aria-label={name} title={name} disabled={disabled}
      style={{ ...KEY_STYLE, gridColumn: span ? `span ${span}` : undefined,
        opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => onPress(label as KeypadKey)}>
      {({ MENU: '⌂', MENU_LONG: '⌂', PRG: '↩', OK: 'OK', UP: '△', DOWN: '▽', LEFT: '◀', RIGHT: '▶', RUN: '◇', STOP: '⊗', MFK: 'MF.K' } as Record<string, string>)[label] ?? label}
    </button>
  );
}

export function VfdKeypadPanel() {
  const keypad = useVfdStore((s) => s.keypad);
  const params = useVfdStore((s) => s.params);
  const running = useVfdStore((s) => s.running);
  const outputHz = useVfdStore((s) => s.outputHz);
  const direction = useVfdStore((s) => s.direction);
  const di = useVfdStore((s) => s.di);
  const doFlags = useVfdStore((s) => s.doFlags);
  const faultCode = useVfdStore((s) => s.faultCode);
  const commOnline = useVfdStore((s) => s.commOnline);
  const message = useVfdStore((s) => s.message);
  const ai1 = useVfdStore((s) => s.ai1);
  const ai2 = useVfdStore((s) => s.ai2);
  const ai2Mode = useVfdStore((s) => s.ai2Mode);
  const externalSetpointHz = useVfdStore((s) => s.externalSetpointHz);
  const command = useVfdStore((s) => s.command);
  const status = useVfdStore((s) => s.status);
  const engaged = useVfdStore((s) => s.engaged);
  const dispatchKey = useVfdStore((s) => s.dispatchKey);
  const setDi = useVfdStore((s) => s.setDi);
  const setAi1 = useVfdStore((s) => s.setAi1);
  const setAi2 = useVfdStore((s) => s.setAi2);
  const setAi2Mode = useVfdStore((s) => s.setAi2Mode);

  const display = useMemo(
    () => keypadDisplay(keypad, params, MD520_FAULTS),
    [keypad, params],
  );
  const dotIndex = display.decimals > 0 ? 5 - display.decimals - 1 : null;
  // 待机时 6 位辅显示区显示预置频率（两位小数，DP 落在第四位），与 MD520 双区显示一致
  const auxText = display.aux || faultCode || '';
  const auxChars = auxText
    || String(Math.round(Math.max(0, Math.min(999.99, Number(params['F0-08']) || 0)) * 100))
      .padStart(6, '0').slice(-6);
  const auxDotIndex = auxText ? null : 3;
  const current = keypad.level >= 2 ? MD520_PARAM_MAP[keypadDisplay({ ...keypad, level: 2 }, params, MD520_FAULTS).main] : undefined;

  const press = useCallback((k: KeypadKey) => dispatchKey(k), [dispatchKey]);
  /** 观众端只读：面板只镜像数值快照，按键/DI/AI 一律不可操作 */
  const readOnly = isViewerRuntime();

  const menuIndex = MD520_MENUS.indexOf(keypad.menu);
  const source = Math.trunc(params['F0-02']);
  const freqSource = Math.trunc(params['F0-03']);
  const multiIndex = (di.DI1 ? 1 : 0) | (di.DI2 ? 2 : 0) | (di.DI3 ? 4 : 0);
  const ai2Max = ai2Mode === 'current' ? MD520_AI.AI2.currentMax : MD520_AI.AI2.max;
  const ai2Unit = ai2Mode === 'current' ? MD520_AI.AI2.currentUnit : MD520_AI.AI2.unit;

  return (
    <div className="card" style={{ padding: 10, display: 'grid', gap: 8 }}
      data-dt-vfd-panel
      data-dt-vfd-level={keypad.level}
      data-dt-vfd-menu={keypad.menu}
      data-dt-vfd-group={keypad.groupIndex}
      data-dt-vfd-index={keypad.paramIndex}
      data-dt-vfd-edit={keypad.editValue}
      data-dt-vfd-param={current?.code ?? ''}
      data-dt-vfd-source={source}
      data-dt-vfd-freq-source={freqSource}
      data-dt-vfd-output={outputHz.toFixed(2)}
      data-dt-vfd-running={running ? 1 : 0}
      data-dt-vfd-engaged={engaged ? 1 : 0}
      data-dt-vfd-readonly={readOnly ? 1 : 0}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="section-title" style={{ margin: 0 }}>MD520</span>
        <span className="badge badge-slate" style={{ fontSize: 10 }}>
          {['面板', '端子', '通信', '自定义'][source] ?? '面板'}
          {' · '}
          {['数字', '掉电记忆', 'AI1', 'AI2', 'AI3', '脉冲', '多段', '—', 'PID', '通讯'][freqSource] ?? '数字'}
        </span>
      </div>

      <div style={{
        background: '#0b1220', border: '1px solid #334155', borderRadius: 8, padding: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>
          <span>FWD</span><span>REV</span><span>DRIVE</span><span>AXIS</span>
          <span>T</span><span>S</span><span>⚠</span><span>◇</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <Led label="FWD" on={running && direction === 1} />
          <Led label="REV" on={running && direction === -1} />
          <Led label="LOC" on={source === 0} blink={source === 2} />
          <Led label="T" on={false} />
          <Led label="S" on={source !== 3} />
          <Led label="⚠" on={!!faultCode} />
          <Led label="RUN" on={running} />
          <Led label="STOP" on={!running} />
          <Led label="COMM" on={commOnline} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: '#64748b', width: 22 }}>AUX</span>
          <SevenSegment chars={auxChars} dotIndex={auxDotIndex} blinkIndex={null} small />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#64748b', width: 22 }}>MAIN</span>
          <SevenSegment chars={display.main} dotIndex={dotIndex} blinkIndex={display.blinkDigit} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 9, color: '#64748b' }}>
          {MD520_UNITS.map((u) => (
            <span key={u} style={{ color: u === display.unit ? '#fb923c' : '#475569' }}>{u}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 9, color: '#64748b' }}>
          {MD520_MENUS.map((m, i) => (
            <span key={m} style={{ color: i === menuIndex ? '#38bdf8' : '#475569' }}>
              {MD520_MENU_LABELS[m]}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
        <Key label="MENU" name="菜单键" onPress={press} disabled={readOnly} />
        <Key label="PRG" name="编程/返回键" onPress={press} disabled={readOnly} />
        <button type="button" aria-label="菜单键长按切主辅显示区" title="菜单键长按" disabled={readOnly}
          style={{ ...KEY_STYLE, fontSize: 9, opacity: readOnly ? 0.55 : 1,
            cursor: readOnly ? 'not-allowed' : 'pointer' }}
          onClick={() => press('MENU_LONG')}>⌂ 长按</button>
        <Key label="MFK" name="多功能选择键" onPress={press} disabled={readOnly} />
        <Key label="LEFT" name="左移位键" onPress={press} disabled={readOnly} />
        <Key label="UP" name="递增键" onPress={press} disabled={readOnly} />
        <Key label="DOWN" name="递减键" onPress={press} disabled={readOnly} />
        <Key label="RIGHT" name="右移位键" onPress={press} disabled={readOnly} />
        <Key label="OK" name="确认键" onPress={press} disabled={readOnly} />
        <Key label="RUN" name="运行键" onPress={press} disabled={readOnly} />
        <Key label="STOP" name="停止键/故障复位" onPress={press} disabled={readOnly} />
        <span style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {message || (display.blinkDigit !== null ? `位 ${display.blinkDigit + 1}` : `L${keypad.level}`)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
        <span>{current ? `${current.code} ${current.name}` : `${params['F0-02'] === 2 ? '通信给定' : 'F0-08 预置频率'} ${Number(params['F0-08']).toFixed(2)} Hz`}</span>
        <span style={{ fontFamily: 'monospace' }}>
          设定 {Number(params['F0-08']).toFixed(2)} · 输出 {outputHz.toFixed(2)} Hz
        </span>
      </div>

      <div style={{ borderTop: '1px solid #26354d', paddingTop: 8, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {MD520_DI.map((d) => (
            <button key={d.key} type="button" aria-label={d.key} title={d.label} disabled={readOnly}
              onClick={() => setDi(d.key, !di[d.key])}
              style={{ ...KEY_STYLE, minHeight: 22, padding: '0 6px', fontSize: 10,
                background: di[d.key] ? '#7f1d1d' : '#1e293b', borderColor: di[d.key] ? '#f87171' : '#475569' }}>
              {d.key}
            </button>
          ))}
          <span data-dt-vfd-multi style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
            段{multiIndex} {MD520_MULTI_SPEED[multiIndex]}Hz
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 54px', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>AI1</span>
          <input data-dt-vfd-ai1 type="range" min={-10} max={10} step={0.1} value={ai1} disabled={readOnly}
            onChange={(e) => setAi1(Number(e.target.value))} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#cbd5e1' }}>{ai1.toFixed(1)}V</span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>AI2</span>
          <input data-dt-vfd-ai2 type="range" min={0} max={ai2Max} step={0.1} value={ai2} disabled={readOnly}
            onChange={(e) => setAi2(Number(e.target.value))} style={{ width: '100%' }} />
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#cbd5e1' }}>{ai2.toFixed(1)}{ai2Unit}</span>
        </div>
        <button type="button" data-dt-vfd-ai2-mode disabled={readOnly}
          style={{ ...KEY_STYLE, minHeight: 22, fontSize: 10, justifySelf: 'start',
            opacity: readOnly ? 0.55 : 1, cursor: readOnly ? 'not-allowed' : 'pointer' }}
          onClick={() => setAi2Mode(ai2Mode === 'voltage' ? 'current' : 'voltage')}>
          {ai2Mode === 'voltage' ? '0~10V' : '0~20mA'}
        </button>

        <div data-dt-vfd-rs485 style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10,
          fontFamily: 'monospace', color: '#94a3b8' }}>
          <span>485</span>
          <span>站{params['FD-02']}</span>
          <span>FD-00 {params['FD-00']}</span>
          <span>2000H 命令 {command}</span>
          <span>3000H 状态 {status}</span>
          <span>1000H {((externalSetpointHz / (params['F0-10'] || 50)) * 10000).toFixed(0)}</span>
          <span>{MD520_COMM.FREQ2.toString(16).toUpperCase()}H {externalSetpointHz.toFixed(2)}Hz</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MD520_DO.map((d) => (
            <span key={d.key} style={{ fontSize: 10, color: doFlags[d.key] ? '#fca5a5' : '#64748b',
              border: '1px solid #334155', borderRadius: 4, padding: '1px 5px' }}>
              {d.key} {doFlags[d.key] ? 'ON' : 'OFF'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
