import { DemoPanel } from '../components/panels';
import { useDemoMode } from '../hooks/useDemoMode';

export function AutoModePanel() {
  const {
    state: demoState,
    isStarted: demoStarted,
    isPaused: demoPaused,
    startDemoMode,
    togglePause: demoTogglePause,
    resetDemo: demoReset,
  } = useDemoMode();

  // 面板自带 card / device-card，包装层不再叠玻璃卡片（与独立 App 一致）
  return (
    <DemoPanel
      demoState={demoState}
      isStarted={demoStarted}
      isPaused={demoPaused}
      onStart={startDemoMode}
      onTogglePause={demoTogglePause}
      onReset={demoReset}
    />
  );
}
