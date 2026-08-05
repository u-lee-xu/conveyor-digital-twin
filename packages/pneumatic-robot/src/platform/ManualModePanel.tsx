import { ManualPanel } from '../scenes/pneumatic-robot/panels/ManualPanel';
import { SensorPanel } from '../scenes/pneumatic-robot/panels/SensorPanel';
import { IndicatorPanel } from '../scenes/pneumatic-robot/panels/IndicatorPanel';

export function ManualModePanel() {
  return (
    <div className="space-y-6">
      <ManualPanel />
      <IndicatorPanel />
      <SensorPanel />
    </div>
  );
}
