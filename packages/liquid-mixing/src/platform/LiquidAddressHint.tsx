/**
 * 面板变量名的 PLC 地址浮框 —— 与自动配药 panels/AddressHint.tsx 同一交互范式。
 *
 * 液体混装左栏同样是 overflow-y-auto 的紧凑滚动容器，23 行地址直接铺开会把
 * 液位读数、配方、开关量全部挤出屏外；因此信号名称本身做成悬停 / 键盘聚焦触发器，
 * 一次性给出三菱 FX / Modbus TCP / Siemens S7 三套地址，完整映射仍以仿真模式
 * 「变量地址表」为准。浮框必须用 portal 挂到 document.body，否则会被滚动容器裁掉。
 *
 * 地址值一律由 liquidVariables.ts 的 LIQUID_ADDRESS_ROWS / LIQUID_SENSOR_FEEDBACK
 * 经 liquidAddressRowsFor() / liquidSensorHintRow() 派生，本文件不出现任何地址字面量。
 * 纯本地教学量（混合均匀度、成品组分、阀门状态色）与本地演示主令不挂浮框 ——
 * 它们不在 PLC 链路上，标地址会误导学生。
 */
import { useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  liquidAddressRowsFor, liquidSensorHintRow,
  type LiquidHintRow, type LiquidPanelHintKey,
} from '../constants/liquidVariables';

/** 液体混装信号名比配药长（「混合罐液位 REAL」「A 进料阀 / 泵」），首列要留够中文宽度 */
const BOX_W = 380;
/** 信号名 + 三协议地址：112px 容得下 8~10 字中文标签，三列各留 ~76px 给双字地址 */
const COLS = '112px 1fr 1fr 1fr';
const MONO = 'ui-monospace, Consolas, monospace';

export function LiquidAddressHint({ title, rows, children, className, hintKey, tabIndex = 0, underline = true }: {
  title: string;
  rows: readonly LiquidHintRow[];
  children?: ReactNode;
  className?: string;
  /** 仅供验收定位，不影响渲染内容 */
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
    // 标题 + 三协议表头 + 每行 19px + 可选注释 + 底部提示 + padding
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

/** 便捷封装：按面板语义键从单一来源取地址行 */
export function LiquidHint({ hintKey, title, children, className, underline }: {
  hintKey: LiquidPanelHintKey;
  title: string;
  children?: ReactNode;
  className?: string;
  underline?: boolean;
}) {
  return (
    <LiquidAddressHint title={title} rows={liquidAddressRowsFor(hintKey)} hintKey={hintKey}
      className={className} underline={underline}>
      {children ?? title}
    </LiquidAddressHint>
  );
}

/** 14 路开关量逐路标注：地址取回写表，不取分组行 */
export function LiquidSensorHint({ sensorKey, label, className }: {
  sensorKey: string;
  label: string;
  className?: string;
}) {
  return (
    <LiquidAddressHint title={label} rows={liquidSensorHintRow(sensorKey)} hintKey={sensorKey}
      className={className}>
      {label}
    </LiquidAddressHint>
  );
}
