/**
 * 场景内实验指导抽屉：右侧浮层，默认收成一个按钮，展开后可一边查步骤一边做实验。
 *
 * - 数据来自 docs/generate-lab-guide.cjs 生成的 labGuide.generated.ts，与打印版手册同源；
 * - 步骤勾选与当前实验只存浏览器 localStorage，是纯本地 UI；不写 store、不广播、观众零上行；
 * - 混合勾选：带 auto 规则的步骤只读订阅 useVfdStore 真值自动判定，观察类步骤仍手动勾；
 * - 挂在变频器自己的 VfdSceneWrapper 里，不改平台壳、不占左侧 528px 真机面板、不影响其它设备；
 * - 默认折叠，3D 场景与面板布局逐像素不变；随时可收起或打开打印版手册。
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import {
  LABS, LAB_GROUPS, LAB_GROUP_ORDER, LAB_GROUP_COLOR,
  KEY_GUIDE, MODE_GUIDE, MENU_GUIDE,
  type LabEntry,
} from '../constants/labGuide.generated';
import { useVfdStore } from '../stores/useVfdStore';
import { autoCheckedSteps } from './labAutoCheck';

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
  const [showGuide, setShowGuide] = useState(false);
  const [query, setQuery] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(true);

  // 只读订阅真值：不调用任何 setter、不碰 Modbus、不广播；观众端不启用自动判定
  const level = useVfdStore((s) => s.keypad.level);
  const params = useVfdStore((s) => s.params);
  const running = useVfdStore((s) => s.running);
  const di = useVfdStore((s) => s.di);
  const autoFacts = useMemo(() => ({ level, params, running, di }), [level, params, running, di]);
  const autoActive = autoEnabled && !isViewerRuntime();

  const persist = useCallback((next: SavedState) => {
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const lab: LabEntry = LABS.find((l) => l.n === saved.current) ?? LABS[0];
  const manualChecked = saved.checked[String(lab.n)] ?? lab.steps.map(() => false);
  // 自动勾选与手动勾选合并：自动命中即勾；自动未命中的步骤可手动勾/取消
  const autoHits = useMemo(
    () => (autoActive ? autoCheckedSteps(lab.auto, autoFacts) : []),
    [autoActive, lab.auto, autoFacts],
  );
  const checked = useMemo(
    () => manualChecked.map((v, i) => v || autoHits.includes(i)),
    [manualChecked, autoHits],
  );
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
            {!isViewerRuntime() && (
              <button
                type="button"
                aria-label="自动判定开关"
                data-dt-vfd-lab-auto
                aria-pressed={autoActive ? 'true' : 'false'}
                onClick={() => setAutoEnabled((v) => !v)}
                title={autoActive ? '已开启：能判断的步骤自动勾选' : '已关闭：全部手动勾选'}
                style={{ padding: '3px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  background: autoActive ? 'rgba(16,122,86,.55)' : 'rgba(71,85,105,.5)',
                  border: `1px solid ${autoActive ? 'rgba(52,211,153,.7)' : 'rgba(100,116,139,.5)'}`,
                  color: '#e2e8f0' }}
              >
                {autoActive ? '⚡自动判定 开' : '⚡自动判定 关'}
              </button>
            )}
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

          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(100,116,139,.35)' }}>
            <button
              type="button"
              aria-label="面板按键对照"
              data-dt-vfd-lab-guide
              onClick={() => setShowGuide((v) => !v)}
              style={{ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: 'rgba(71,85,105,.5)', border: '1px solid rgba(100,116,139,.5)', color: '#cbd5e1' }}
            >
              {showGuide ? '收起按键对照' : 'PRG 是哪个键？按键对照'}
            </button>
            {showGuide && (
              <div data-dt-vfd-lab-guide-body style={{ marginTop: 7, fontSize: 11, lineHeight: 1.55 }}>
                <div style={{ color: '#93c5fd', marginBottom: 3 }}>
                  运行模式：{MODE_GUIDE.map((m) => `${m.mode}＝${m.meaning.split('。')[0]}`).join('；')}
                </div>
                <div style={{ color: '#94a3b8', marginBottom: 4 }}>
                  三级菜单：{MENU_GUIDE.map((m) => m.level).join(' → ')}，每层 OK 进一级、PRG 退一级
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {KEY_GUIDE.map((k) => (
                      <tr key={k.code} style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>
                        <td style={{ padding: '2px 4px', color: '#fbbf24', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{k.code}</td>
                        <td style={{ padding: '2px 4px', textAlign: 'center', fontSize: 14 }}>{k.face}</td>
                        <td style={{ padding: '2px 4px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{k.name}</td>
                        <td style={{ padding: '2px 4px', color: '#94a3b8' }}>{k.where}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ color: '#94a3b8', marginTop: 4 }}>悬停按键可看「代号 · 符号 · 中文名」；完整作用见打印版「开始之前」。</div>
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
                {lab.steps.map((stepText, i) => {
                  const byAuto = autoHits.includes(i);
                  return (
                    <li key={i} style={{ marginBottom: 5 }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: byAuto ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          aria-label={`步骤 ${i + 1}`}
                          data-dt-vfd-lab-step={i}
                          data-dt-vfd-lab-auto-step={byAuto ? '1' : '0'}
                          checked={!!checked[i]}
                          disabled={byAuto}
                          onChange={() => toggleStep(i)}
                        />
                        <span style={{ textDecoration: checked[i] ? 'line-through' : 'none', opacity: checked[i] ? 0.65 : 1 }}>
                          {byAuto && <span style={{ color: '#34d399', fontSize: 10, marginRight: 4 }}>⚡自动</span>}
                          {richText(stepText)}
                        </span>
                      </label>
                    </li>
                  );
                })}
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
