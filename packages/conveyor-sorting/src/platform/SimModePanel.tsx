import { ConveyorPlcConnection } from './ConveyorPlcConnection';
import { SimPanel } from '../components/panels';
import { useSimMode } from '../hooks/useSimMode';
import { VfdKeypadPanel } from './VfdKeypadPanel';

export function SimModePanel({ isMobile }: { isMobile?: boolean }) {
  const {
    step: simStep,
    isSimulationRunning: simRunning,
    errorMessage: simError,
    stats: simStats,
    controlSignals: simControlSignals,
    publishAllFeedback: simPublishFeedback,
    onSimulationStart: simStart,
    onSimulationStop: simStop,
    onSimulationReset: simReset,
    onSpawnMaterial: simSpawnMaterial,
    onInitialize: simInitialize,
  } = useSimMode();

  if (isMobile) {
    return <div className="text-white text-center py-4">请在电脑端运行仿真</div>;
  }

  return (
    <div className="space-y-2">
      <ConveyorPlcConnection modeLabel="仿真模式" />
      <VfdKeypadPanel />
      <SimPanel
        step={simStep}
        isSimulationRunning={simRunning}
        errorMessage={simError}
        stats={simStats}
        controlSignals={simControlSignals}
        onPublishAllFeedback={simPublishFeedback}
        onSimulationStart={simStart}
        onSimulationStop={simStop}
        onSimulationReset={simReset}
        onSpawnMaterial={simSpawnMaterial}
        onInitialize={simInitialize}
      />
    </div>
  );
}
