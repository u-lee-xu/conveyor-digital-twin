import { useState, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 浮框里的一行地址，全部由 manualIo / constants 的点位表拼出，禁止回填字面量 */
export interface HintRow {
  /** X / Y / C / HR / MD / D 等地址或线圈号 */
  addr: string;
  /** 可选的第二种编号（如 Modbus 线圈号） */
  coil?: string;
  /** 该地址对应的信号说明 */
  label: string;
}

const BOX_W = 238;

/**
 * 信号名称的 PLC 地址浮框。
 *
 * X/Y/C 地址不再直接铺在紧凑面板上（10 个输出点 + 22 个输入点会把左栏塞满），
 * 改为鼠标悬停 / 键盘聚焦到「启动」「停止」「滑台」等**信号名称**上时弹出小框；
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
    const height = 52 + rows.length * 19 + (note ? 18 : 0);
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
          <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>
            {title} · PLC 地址
          </div>
          {rows.map((row, i) => (
            <div key={`${row.addr}-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{
                fontFamily: 'ui-monospace, Consolas, monospace', color: '#7dd3fc',
                minWidth: 62, flexShrink: 0,
              }}
              >{row.addr}</span>
              {row.coil && (
                <span style={{
                  fontFamily: 'ui-monospace, Consolas, monospace', color: '#94a3b8',
                  flexShrink: 0,
                }}
                >{row.coil}</span>
              )}
              <span style={{
                color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              >{row.label}</span>
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
