import { ConveyorPlcConnection } from './ConveyorPlcConnection';
import { ScoringPanel } from '../components/panels';

export function ScoringModePanel() {
  return (
    <>
      <ConveyorPlcConnection modeLabel="评分模式" />
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
        <ScoringPanel />
      </div>
    </>
  );
}
