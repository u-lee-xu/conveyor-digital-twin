import { useState, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 浮框里的一行：一个信号在三种协议下的地址。
 * 全部由 manualIo 的 ioAddressRows() / pointAddressRow() / DINT_ADDRESS_ROWS 拼出，
 * 组件不允许自己回填 'Y2' / 'C32' / 'M30.2' 这类地址字面量。
 */
export interface HintRow {
  label: string;
  /** 三菱 FX X/Y（八进制）或 D 寄存器 */
  mitsubishi: string;
  /** Modbus TCP 线圈号或保持寄存器 */
  modbus: string;
  /** Siemens S7 M 区位地址或 MD 寄存器 */
  s7: string;
}

/** 宽度要容得下「HR120·HR121」这类双字地址，否则 nowrap 会溢出列、挤到相邻协议 */
const BOX_W = 336;
/** 信号名 + 三协议地址 */
const COLS = '62px 1fr 1fr 1fr';
const MONO = 'ui-monospace, Consolas, monospace';

/**
 * 信号名称的 PLC 地址浮框：一次给出三菱 / Modbus / S7 三套地址。
 *
 * 地址不再直接铺在紧凑面板上（10 个输出点 + 22 个输入点会把左栏塞满），
 * 改为鼠标悬停 / 键盘聚焦到「启动」「停止」「滑台」「A 缸」等**信号名称**上弹出小框；
 * 表头固定三协议，双点行（滑台正/反转、三色灯）每个点各占一行。
 * 完整地址映射仍以「使用说明 ❓」为准。
 *
 * 必须用 portal 挂到 document.body：左栏是 overflow-y-auto 滚动容器，
 * absolute 浮层会被裁掉，fixed + portal 才能完整显示。
 */
export function AddressHint({ title, rows, note, children, className, tabIndex = 0, underline = true }: {
  title: string;
  rows: readonly HintRow[];
  note?: string;
  children?: ReactNode;
  className?: string;
  tabIndex?: number;
  underline?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

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

  return (
    <>
      <span
        ref={ref}
        data-io-hint-trigger=""
        tabIndex={tabIndex}
        aria-label={`${title}，悬停查看 PLC 地址`}
        className={className}
        style={{
          cursor: 'help',
          borderBottom: underline ? '1px dotted rgba(148,163,184,.45)' : undefined,
        }}
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
              key={`${row.mitsubishi}-${i}`}
              data-io-hint-row=""
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'baseline', lineHeight: '19px' }}
            >
              <span
                data-addr="label"
                style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >{row.label}</span>
              <span data-addr="mitsubishi" style={{ fontFamily: MONO, color: '#7dd3fc', whiteSpace: 'nowrap' }}>{row.mitsubishi}</span>
              <span data-addr="modbus" style={{ fontFamily: MONO, color: '#a5b4fc', whiteSpace: 'nowrap' }}>{row.modbus}</span>
              <span data-addr="s7" style={{ fontFamily: MONO, color: '#86efac', whiteSpace: 'nowrap' }}>{row.s7}</span>
            </div>
          ))}
          {note && <div style={{ color: '#94a3b8', marginTop: 4 }}>{note}</div>}
          <div style={{
            color: '#64748b', marginTop: 6, borderTop: '1px solid #334155', paddingTop: 4,
          }}
          >完整地址映射见「使用说明 ❓」</div>
        </div>,
        document.body,
      )}
    </>
  );
}
