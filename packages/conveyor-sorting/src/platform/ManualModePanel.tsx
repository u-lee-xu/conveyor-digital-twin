import { ControlPanel } from '../components/panels';
import { StatusPanel } from '../components/panels';

export function ManualModePanel({ isMobile }: { isMobile?: boolean }) {
  return (
    <div className="space-y-6">
      <ControlPanel isMobile={isMobile} />
      <StatusPanel />
    </div>
  );
}
