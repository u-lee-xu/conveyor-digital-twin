/**
 * 场景内实验指导抽屉：右侧浮层，默认收成一个按钮，展开后可一边查步骤一边做实验。
 *
 * - 数据来自 docs/generate-lab-guide.cjs 生成的 labGuide.generated.ts，与打印版手册同源；
 * - 步骤勾选与当前实验只存浏览器 localStorage，是纯本地 UI，不写 store、不广播、观众零上行；
 * - 挂在变频器自己的 VfdSceneWrapper 里，不改平台壳、不占左侧 528px 真机面板、不影响其它设备；
 * - 默认折叠，3D 场景与面板布局逐像素不变；随时可收起或打开打印版手册。
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
  LABS, LAB_GROUPS, LAB_GROUP_ORDER, LAB_GROUP_COLOR,
  type LabEntry,
} from '../constants/labGuide.generated';

const STORAGE_KEY = 'md520-lab-guide-v1';

type Progress = Record<string, boolean[]>;

interface SavedState {
  current: number;
  checked: Progress;
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedState;
      if (typeof parsed.current === 'number' && parsed.checked && typeof parsed.checked === 'object') {
        return parsed;
      }
    }
  } catch {
    // 隐私模式 / 存储被禁用时退回内存态
  }
  return { current: 1, checked: {} };
}

/** 把步骤里的 `F0-08` 这类反引号片段渲染成行内 code，其余保持普通文字 */
function richText(text: string) {
  return text.split(/`([^`]+)`/g).map((part, i) => (
    i % 2 === 1
      ? <code key={i} style={{ background: 'rgba(148,163,184,.18)', padding: '0 3px', borderRadius: 3 }}>{part}</code>
      : <span key={i}>{part}</span>
  ));
}

export function VfdLabGuide() {
  const [saved, setSaved] = useState<SavedState>(loadState);
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [query, setQuery] = useState('');

  const persist = useCallback((next: SavedState) => {
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const lab: LabEntry = LABS.find((l) => l.n === saved.current) ?? LABS[0];
  const checked = saved.checked[String(lab.n)] ?? lab.steps.map(() => false);
  const done = checked.filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LABS;
    return LABS.filter((l) => [l.name, l.goal, l.expect, l.mode, LAB_GROUPS[l.g]]
      .join(' ').toLowerCase().includes(q));
  }, [query]);

  const goTo = (n: number) => {
    if (n < 1 || n > LABS.length) return;
    persist({ ...saved, current: n });
  };

  const toggleStep = (index: number) => {
    const next = [...checked];
    next[index] = !next[index];
    persist({ ...saved, checked: { ...saved.checked, [String(lab.n)]: next } });
  };

  const card: CSSProperties = {
    background: 'rgba(30,41,59,.97)',
    border: '1px solid rgba(100,116,139,.45)',
    borderRadius: 14,
    color: '#e2e8f0',
  };

  return (
    <div
      data-dt-vfd-lab
      data-dt-vfd-lab-open={open ? '1' : '0'}
      data-dt-vfd-lab-current={lab.n}
      data-dt-vfd-lab-progress={`${done}/${lab.steps.length}`}
      style={{ position: 'absolute', top: 12, right: 12, zIndex: 30, fontSize: 12 }}
    >
      {!open ? (
        <button
          type="button"
          aria-label="实验指导"
          data-dt-vfd-lab-toggle
          onClick={() => setOpen(true)}
          style={{
            padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(30,41,59,.95)', border: '1px solid rgba(100,116,139,.5)',
            color: '#e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,.28)',
          }}
        >
          实验指导 · {LABS.length} 项
        </button>
      ) : (
        <div
          data-dt-vfd-lab-panel
          style={{
            ...card,
            width: 'min(360px, calc(100vw - 24px))',
            maxHeight: 'calc(100% - 24px)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 12px 34px rgba(0,0,0,.42)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(100,116,139,.35)' }}>
            <b style={{ fontSize: 13 }}>实验指导</b>
            <span style={{ color: '#94a3b8' }}>{lab.n} / {LABS.length}</span>
            <button
              type="button"
              aria-label="收起实验指导"
              data-dt-vfd-lab-toggle
              onClick={() => setOpen(false)}
              style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: 'rgba(71,85,105,.6)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0' }}
            >
              收起
            </button>
          </div>

          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(100,116,139,.35)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <select
              aria-label="选择实验"
              data-dt-vfd-lab-select
              value={lab.n}
              onChange={(e) => goTo(Number(e.target.value))}
              style={{ width: '100%', padding: '5px 6px', borderRadius: 6, background: '#0f172a', color: '#e2e8f0', border: '1px solid rgba(100,116,139,.5)' }}
            >
              {LAB_GROUP_ORDER.map((g) => (
                <optgroup key={g} label={`${g} ${LAB_GROUPS[g]}`}>
                  {LABS.filter((l) => l.g === g).map((l) => (
                    <option key={l.n} value={l.n}>{l.n} {l.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              aria-label="搜索实验"
              data-dt-vfd-lab-search
              value={query}
              placeholder="搜索实验名称 / 参数 / 预期现象"
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '5px 7px', borderRadius: 6, background: '#0f172a', color: '#e2e8f0', border: '1px solid rgba(100,116,139,.5)' }}
            />
            <button
              type="button"
              aria-label="实验编号列表"
              onClick={() => setShowList((v) => !v)}
              style={{ alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: 'rgba(71,85,105,.5)', border: '1px solid rgba(100,116,139,.5)', color: '#cbd5e1' }}
            >
              {showList ? '收起编号' : `全部 ${LABS.length} 项`}
            </button>
            {showList && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {filtered.map((l) => (
                  <button
                    key={l.n}
                    type="button"
                    aria-label={`实验 ${l.n}`}
                    onClick={() => goTo(l.n)}
                    style={{
                      padding: '3px 0', borderRadius: 5, cursor: 'pointer',
                      background: l.n === lab.n ? '#1d4ed8' : 'rgba(71,85,105,.45)',
                      color: '#e2e8f0', border: '1px solid rgba(100,116,139,.45)',
                    }}
                  >
                    {l.n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div data-dt-vfd-lab-card style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', lineHeight: 1.65 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 10, marginRight: 6, color: '#fff', background: LAB_GROUP_COLOR[lab.g] }}>
                {lab.g} {LAB_GROUPS[lab.g]}
              </span>
              <span style={{ color: '#94a3b8' }}>{lab.mode}</span>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 5 }}>实验 {lab.n} {lab.name}</div>
            </div>

            <p style={{ margin: '6px 0' }}><b>目的</b> {richText(lab.goal)}</p>

            <div style={{ margin: '6px 0' }}>
              <b>步骤</b> <span data-dt-vfd-lab-progress-text>{done} / {lab.steps.length}</span>
              <ol style={{ margin: '5px 0 6px 18px', padding: 0 }}>
                {lab.steps.map((stepText, i) => (
                  <li key={i} style={{ marginBottom: 5 }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        aria-label={`步骤 ${i + 1}`}
                        data-dt-vfd-lab-step={i}
                        checked={!!checked[i]}
                        onChange={() => toggleStep(i)}
                      />
                      <span style={{ textDecoration: checked[i] ? 'line-through' : 'none', opacity: checked[i] ? 0.65 : 1 }}>
                        {richText(stepText)}
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
            </div>

            <p data-dt-vfd-lab-expect style={{ margin: '6px 0', padding: '6px 8px', borderRadius: 7, background: 'rgba(16,122,86,.18)', border: '1px solid rgba(16,122,86,.45)' }}>
              <b>预期现象</b> {richText(lab.expect)}
            </p>
            <p style={{ margin: '6px 0' }}><b>观察窗口</b> {richText(lab.watch)}</p>
            <p style={{ margin: '6px 0', color: '#fcd34d' }}><b>易错点</b> {richText(lab.trap)}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderTop: '1px solid rgba(100,116,139,.35)' }}>
            <button type="button" aria-label="上一个实验" onClick={() => goTo(lab.n - 1)} disabled={lab.n <= 1}
              style={{ padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: 'rgba(71,85,105,.5)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0' }}>上一项</button>
            <button type="button" aria-label="下一个实验" data-dt-vfd-lab-next onClick={() => goTo(lab.n + 1)} disabled={lab.n >= LABS.length}
              style={{ padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: 'rgba(71,85,105,.5)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0' }}>下一项</button>
            <button type="button" aria-label="重置本实验进度" onClick={() => persist({ ...saved, checked: { ...saved.checked, [String(lab.n)]: lab.steps.map(() => false) } })}
              style={{ padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(100,116,139,.5)', color: '#cbd5e1' }}>重置</button>
            <a href="/docs/MD520实验指导书.html" target="_blank" rel="noreferrer"
              style={{ marginLeft: 'auto', color: '#93c5fd' }}>打印版</a>
          </div>
        </div>
      )}
    </div>
  );
}
