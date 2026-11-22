/** 右上角机位 / 部件展台切换器，平台壳不感知内部实现 */
import type { CSSProperties } from 'react';
import {
  MOTOR_CAMERA_GOALS, MOTOR_PART_STAGE_GOALS, MOTOR_VIEW_KEYS, MOTOR_PART_KINDS,
} from '../constants/motorConstants';
import { useMotorViewStore } from '../stores/useMotorViewStore';

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

export function MotorViewSwitcher() {
  const activeView = useMotorViewStore((s) => s.activeView);
  const activeStage = useMotorViewStore((s) => s.activeStage);
  const setView = useMotorViewStore((s) => s.setView);
  const setStage = useMotorViewStore((s) => s.setStage);

  return (
    <div data-dt-motor-view-switcher style={box}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {MOTOR_VIEW_KEYS.map((key) => (
          <button key={key} type="button" aria-label={`机位 ${MOTOR_CAMERA_GOALS[key].label}`}
            style={btn(!activeStage && activeView === key)} onClick={() => setView(key)}>
            {MOTOR_CAMERA_GOALS[key].label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ color: '#94a3b8' }}>部件展台</span>
        <select data-dt-motor-stage-select aria-label="部件展台" style={select} value={activeStage ?? ''}
          onChange={(e) => setStage(e.target.value || null)}>
          <option value="">整机</option>
          {MOTOR_PART_KINDS.map((key) => (
            <option key={key} value={key}>{MOTOR_PART_STAGE_GOALS[key].label}</option>
          ))}
        </select>
        {activeStage && (
          <button type="button" data-dt-motor-stage-back style={btn(false)} onClick={() => setStage(null)}>
            返回整机
          </button>
        )}
      </div>
    </div>
  );
}
