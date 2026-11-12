/** 右上角机位 / 部件展台切换器（与传送带场景同款交互，平台壳不感知内部实现） */
import type { CSSProperties } from 'react';
import { useGantryViewStore } from '../stores/useGantryViewStore';
import { GANTRY_VIEW_PRESETS, GANTRY_PART_STAGES } from '../constants/gantryConstants';

const box: CSSProperties = {
  position: 'absolute', top: 12, right: 12, zIndex: 25,
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: '8px 10px', borderRadius: 10,
  background: 'rgba(30,41,59,.92)', border: '1px solid rgba(100,116,139,.5)',
  color: '#e2e8f0', fontSize: 11, boxShadow: '0 8px 22px rgba(0,0,0,.35)',
};
const btn = (active: boolean): CSSProperties => ({
  padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
  background: active ? '#1d4ed8' : 'rgba(71,85,105,.6)',
  border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0', fontSize: 11,
});
const select: CSSProperties = {
  padding: '3px 6px', borderRadius: 6, background: '#0f172a', color: '#e2e8f0',
  border: '1px solid rgba(100,116,139,.5)', fontSize: 11,
};

export function GantryViewSwitcher() {
  const activeView = useGantryViewStore((s) => s.activeView);
  const activeStage = useGantryViewStore((s) => s.activeStage);
  const setView = useGantryViewStore((s) => s.setView);
  const setStage = useGantryViewStore((s) => s.setStage);

  return (
    <div data-dt-gantry-view-switcher style={box}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(Object.keys(GANTRY_VIEW_PRESETS) as (keyof typeof GANTRY_VIEW_PRESETS)[]).map((key) => (
          <button key={key} type="button" aria-label={`机位 ${GANTRY_VIEW_PRESETS[key].label}`}
            title={GANTRY_VIEW_PRESETS[key].desc}
            style={btn(!activeStage && activeView === key)}
            onClick={() => setView(key)}>
            {GANTRY_VIEW_PRESETS[key].label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ color: '#94a3b8' }}>部件展台</span>
        <select data-dt-gantry-stage-select aria-label="部件展台" style={select} value={activeStage ?? ''}
          onChange={(e) => setStage(e.target.value || null)}>
          <option value="">整机</option>
          {(Object.keys(GANTRY_PART_STAGES) as (keyof typeof GANTRY_PART_STAGES)[]).map((key) => (
            <option key={key} value={key}>{GANTRY_PART_STAGES[key].label}</option>
          ))}
        </select>
        {activeStage && (
          <button type="button" data-dt-gantry-stage-back style={btn(false)} onClick={() => setStage(null)}>
            返回整机
          </button>
        )}
      </div>
      {activeStage && (
        <span style={{ color: '#93c5fd' }}>
          部件展台 · {GANTRY_PART_STAGES[activeStage].label} · 1:1 真实尺度 · 拖拽旋转 / 滚轮缩放
        </span>
      )}
    </div>
  );
}
