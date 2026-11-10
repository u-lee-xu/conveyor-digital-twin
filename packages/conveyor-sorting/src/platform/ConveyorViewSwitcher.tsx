import type { CSSProperties } from 'react';
import { useDeviceStore, useConveyorViewStore } from '../stores';
import {
  VIEW_PRESETS, VIEW_BUTTONS, PART_STAGES, SENSOR_VARIANTS,
} from '../scenes/conveyor-sorting/constants';

/** 与自动配药 ViewSwitcher 同款右上角工具栏（同一套 card / btn 外观） */
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
 * 整机机位 / 部件展台 / 标签 / 面板折叠。独立 App 与平台壳共用。
 * 观众只读镜像（history.state === 'viewer'）不渲染，避免观众误操作。
 * 所有切换都是 store 驱动的运行时切换，不刷新页面；CameraRig 负责相机阻尼过渡。
 */
export function ConveyorViewSwitcher({ showPanelToggle = false }: { showPanelToggle?: boolean }) {
  const activeView = useConveyorViewStore((s) => s.activeView);
  const activeStage = useConveyorViewStore((s) => s.activeStage);
  const setView = useConveyorViewStore((s) => s.setView);
  const setStage = useConveyorViewStore((s) => s.setStage);
  const stageSensor = useConveyorViewStore((s) => s.stageSensor);
  const setStageSensor = useConveyorViewStore((s) => s.setStageSensor);
  const panelCollapsed = useConveyorViewStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useConveyorViewStore((s) => s.setPanelCollapsed);
  const showLabels = useDeviceStore((s) => s.showLabels);
  const toggleLabels = useDeviceStore((s) => s.toggleLabels);

  const isViewer = typeof window !== 'undefined' && window.history.state === 'viewer';
  if (isViewer) return null;

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
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
          data-dt-stage-select
          value={activeStage ?? ''}
          style={selectStyle}
          onChange={(e) => setStage(e.target.value || null)}
        >
          <option value="">整机</option>
          {Object.entries(PART_STAGES).map(([key, stage]) => (
            <option key={key} value={key}>{stage.label}</option>
          ))}
        </select>
        {activeStage === 'sensor' && (
          <select
            data-dt-stage-sensor
            value={stageSensor}
            style={selectStyle}
            onChange={(e) => setStageSensor(e.target.value)}
          >
            {Object.entries(SENSOR_VARIANTS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {activeStage && (
          <button type="button" data-dt-stage-back style={btn(false)} onClick={() => setStage(null)}>返回整机</button>
        )}
        <button type="button" style={btn(showLabels)} onClick={toggleLabels}>
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
        <div data-dt-stage-banner style={{ ...card, color: '#94a3b8', fontSize: 11, padding: '4px 8px' }}>
          部件展台 · {PART_STAGES[activeStage].label} · 1:1 真实尺度 · 拖拽旋转 / 滚轮缩放
        </div>
      )}
    </div>
  );
}
