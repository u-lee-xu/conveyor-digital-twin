import { PlcConnectionPanel, ScoringPanel } from '../components/panels';

export function ScoringModePanel() {
  return (
    <>
      <PlcConnectionPanel mode="scoring" />
      <div className="bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-xl">
        <ScoringPanel />
      </div>
    </>
  );
}
