import { ManualPanel } from '../scenes/pneumatic-robot/panels/ManualPanel';
import { SensorPanel } from '../scenes/pneumatic-robot/panels/SensorPanel';

export function ManualModePanel() {
  return (
    <div className="space-y-6">
      <ManualPanel />
      <SensorPanel />
    </div>
  );
}
