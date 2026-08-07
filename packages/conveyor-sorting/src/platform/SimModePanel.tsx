import { ConveyorPlcConnection } from './ConveyorPlcConnection';
import { SimPanel } from '../components/panels';
import { useSimMode } from '../hooks/useSimMode';

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
    <>
      <ConveyorPlcConnection modeLabel="仿真模式" />
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
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
    </>
  );
}
