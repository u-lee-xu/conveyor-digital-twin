import type { CSSProperties } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { VIEW_PRESETS, PART_STAGES } from '../scenes/auto-dispensing/constants';

/** 界面上可见的机位按钮（current 是旧机位对照，不占正式入口） */
const VIEW_BUTTONS = ['overview', 'origin', 'top', 'drive', 'feed', 'dump', 'shaftEnd'];

const card: CSSProperties = {
  background: 'rgba(15,23,42,0.86)', border: '1px solid #475569', borderRadius: 10,
  padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
  justifyContent: 'flex-end', maxWidth: 560, backdropFilter: 'blur(8px)',
};

const chip: CSSProperties = { fontSize: 11, color: '#94a3b8', marginRight: 2 };

function btn(active: boolean, disabled = false): CSSProperties {
  return {
    padding: '4px 8px', fontSize: 11, borderRadius: 6, whiteSpace: 'nowrap',
    border: `1px solid ${active ? '#22c55e' : '#475569'}`,
    background: active ? 'rgba(34,197,94,0.18)' : 'rgba(15,23,42,0.6)',
    color: active ? '#86efac' : '#cbd5e1',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  };
}

const selectStyle: CSSProperties = {
  background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569',
  borderRadius: 6, padding: '4px 6px', fontSize: 11,
};

/**
 * 右上角视图工具栏：整机机位 / 部件展台 / 镜像布局 / 标签 / 面板折叠。
 * 独立 App 与平台壳共用（由 DispensingSceneWrapper 与 App 各自渲染）。
 * 所有切换都是 store 驱动的运行时切换，不刷新页面；CameraRig 负责相机阻尼过渡。
 */
export function ViewSwitcher({ showPanelToggle = false }: { showPanelToggle?: boolean }) {
  const activeView = useAppStore((s) => s.activeView);
  const activeStage = useAppStore((s) => s.activeStage);
  const mirrored = useAppStore((s) => s.mirrored);
  const showLabels = useAppStore((s) => s.showLabels);
  const panelCollapsed = useAppStore((s) => s.panelCollapsed);
  const setView = useAppStore((s) => s.setView);
  const setStage = useAppStore((s) => s.setStage);
  const setMirrored = useAppStore((s) => s.setMirrored);
  const setShowLabels = useAppStore((s) => s.setShowLabels);
  const setPanelCollapsed = useAppStore((s) => s.setPanelCollapsed);

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
      pointerEvents: 'auto',
    }}>
      <div style={card}>
        <span style={chip}>机位</span>
        {VIEW_BUTTONS.map((key) => (
          <button
            key={key}
            type="button"
            title={VIEW_PRESETS[key].desc}
            style={btn(!activeStage && activeView === key)}
            onClick={() => setView(key)}
          >
            {VIEW_PRESETS[key].label}
          </button>
        ))}
      </div>

      <div style={card}>
        <span style={chip}>部件展台</span>
        <select
          value={activeStage ?? ''}
          style={selectStyle}
          onChange={(e) => setStage(e.target.value || null)}
        >
          <option value="">整机</option>
          {Object.entries(PART_STAGES).map(([key, stage]) => (
            <option key={key} value={key}>{stage.label}</option>
          ))}
        </select>
        {activeStage && (
          <button type="button" style={btn(false)} onClick={() => setStage(null)}>返回整机</button>
        )}
        <button
          type="button"
          title="沿中轴面左右镜像：起点与按钮箱移到右手侧"
          style={btn(mirrored, !!activeStage)}
          disabled={!!activeStage}
          onClick={() => setMirrored(!mirrored)}
        >
          镜像布局 {mirrored ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          style={btn(showLabels)}
          onClick={() => setShowLabels(!showLabels)}
        >
          标签 {showLabels ? 'ON' : 'OFF'}
        </button>
        {showPanelToggle && (
          <button
            type="button"
            style={btn(panelCollapsed)}
            onClick={() => setPanelCollapsed(!panelCollapsed)}
          >
            {panelCollapsed ? '展开面板' : '收起面板'}
          </button>
        )}
      </div>

      {activeStage && (
        <div style={{ ...card, color: '#94a3b8', fontSize: 11, padding: '4px 8px' }}>
          部件展台 · {PART_STAGES[activeStage].label} · 1:1 真实尺度 · 拖拽旋转 / 滚轮缩放
        </div>
      )}
    </div>
  );
}
