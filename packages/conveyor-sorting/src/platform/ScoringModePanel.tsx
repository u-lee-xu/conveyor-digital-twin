import { ConveyorPlcConnection } from './ConveyorPlcConnection';
import { ScoringPanel } from '../components/panels';

export function ScoringModePanel() {
  return (
    <div className="space-y-2">
      <ConveyorPlcConnection modeLabel="评分模式" />
      <ScoringPanel />
    </div>
  );
}
