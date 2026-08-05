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

  return (
    <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
      <DemoPanel
        demoState={demoState}
        isStarted={demoStarted}
        isPaused={demoPaused}
        onStart={startDemoMode}
        onTogglePause={demoTogglePause}
        onReset={demoReset}
      />
    </div>
  );
}
