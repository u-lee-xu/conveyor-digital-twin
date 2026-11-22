/**
 * 面板变量名的 PLC 地址浮框：hover / focus 触发，createPortal 挂 document.body。
 * 地址值一律由 motorVariables.ts 的 MOTOR_ADDRESS_ROWS / MOTOR_SENSOR_FEEDBACK
 * 经 motorAddressRowsFor() / motorSensorHintRow() 派生，本文件不出现地址字面量。
 * 纯本地教学量（负载档位、演示主令、机位）不挂浮框：它们不在 PLC 链路上。
 */
import { useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  motorAddressRowsFor, motorSensorHintRow,
  type MotorHintRow, type MotorPanelHintKey,
} from '../constants/motorVariables';

const BOX_W = 380;
const COLS = '112px 1fr 1fr 1fr';
const MONO = 'ui-monospace, Consolas, monospace';

export function MotorAddressHint({ title, rows, children, className, hintKey, tabIndex = 0, underline = true }: {
  title: string;
  rows: readonly MotorHintRow[];
  children?: ReactNode;
  className?: string;
  hintKey?: string;
  tabIndex?: number;
  underline?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const note = [...new Set(rows.map((r) => r.note).filter((v): v is string => !!v))].join('；');

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = 96 + rows.length * 19 + (note ? 18 : 0);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - BOX_W - 8));
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight
      ? Math.max(8, r.top - height - 6)
      : below;
    setPos({ left, top });
  };
  const hide = () => setPos(null);

  const trigger: CSSProperties = {
    cursor: 'help',
    borderBottom: underline ? '1px dotted rgba(148,163,184,.45)' : undefined,
  };

  return (
    <>
      <span
        ref={ref}
        data-io-hint-trigger=""
        data-hint-key={hintKey}
        tabIndex={tabIndex}
        aria-label={`${title}，悬停查看 PLC 地址`}
        className={className}
        style={trigger}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children ?? title}
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          data-io-hint=""
          data-hint-key={hintKey}
          style={{
            position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999,
            width: BOX_W, pointerEvents: 'none',
            background: '#0f172a', border: '1px solid #475569', borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,.55)', padding: '8px 10px',
            fontSize: 11, lineHeight: 1.55, color: '#e2e8f0',
          }}
        >
          <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 6 }}>
            {title} · PLC 地址
          </div>
          <div
            data-io-hint-head=""
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 6, fontSize: 10,
              color: '#64748b', borderBottom: '1px solid #334155', paddingBottom: 3, marginBottom: 3,
            }}
          >
            <span>信号</span><span data-proto="mitsubishi">三菱 FX</span>
            <span data-proto="modbus">Modbus TCP</span><span data-proto="s7">Siemens S7</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={`${row.label}-${row.modbus}-${i}`}
              data-io-hint-row=""
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'baseline', lineHeight: '19px' }}
            >
              <span data-addr="label" style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
              </span>
              <span data-addr="mitsubishi" style={{ fontFamily: MONO, color: '#7dd3fc', whiteSpace: 'nowrap' }}>{row.mitsubishi}</span>
              <span data-addr="modbus" style={{ fontFamily: MONO, color: '#a5b4fc', whiteSpace: 'nowrap' }}>{row.modbus}</span>
              <span data-addr="s7" style={{ fontFamily: MONO, color: '#86efac', whiteSpace: 'nowrap' }}>{row.s7}</span>
            </div>
          ))}
          {note && <div style={{ color: '#94a3b8', marginTop: 4 }}>{note}</div>}
          <div style={{ color: '#64748b', marginTop: 6, borderTop: '1px solid #334155', paddingTop: 4 }}>
            完整地址映射见仿真模式「变量地址表」
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function MotorHint({ hintKey, title, children, className, underline }: {
  hintKey: MotorPanelHintKey;
  title: string;
  children?: ReactNode;
  className?: string;
  underline?: boolean;
}) {
  return (
    <MotorAddressHint title={title} rows={motorAddressRowsFor(hintKey)} hintKey={hintKey}
      className={className} underline={underline}>
      {children ?? title}
    </MotorAddressHint>
  );
}

export function MotorSensorHint({ sensorKey, label, className }: {
  sensorKey: string;
  label: string;
  className?: string;
}) {
  return (
    <MotorAddressHint title={label} rows={motorSensorHintRow(sensorKey)} hintKey={sensorKey}
      className={className}>
      {label}
    </MotorAddressHint>
  );
}
