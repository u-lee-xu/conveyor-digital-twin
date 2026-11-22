/** 三模式面板分发器：外壳按 useMotorAppStore.mode 分发，data-dt-motor-panel 锚点唯一 */
import { useMotorAppStore } from '../stores/useMotorAppStore';
import { MotorManualPanel } from './MotorManualPanel';
import { MotorDemoPanel } from './MotorDemoPanel';
import { MotorSimPanel } from './MotorSimPanel';

export function MotorModePanel() {
  const mode = useMotorAppStore((s) => s.mode);
  return (
    <div data-dt-motor-panel style={{ fontSize: 12, color: '#e2e8f0' }}>
      {mode === 'auto' ? <MotorDemoPanel />
        : mode === 'sim' ? <MotorSimPanel /> : <MotorManualPanel />}
    </div>
  );
}
