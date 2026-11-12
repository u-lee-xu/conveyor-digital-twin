/**
 * 三模式面板分发器：与配药 PlatformModePanels 同款，模式状态只从视图 store 读。
 * 只读状态区由各模式面板共享 GantryStatusPanel，控件与数值不堆说明段落。
 */
import { useGantryAppStore } from '../stores/useGantryAppStore';
import { GantryManualPanel } from './GantryManualPanel';
import { GantryDemoPanel } from './GantryDemoPanel';
import { GantrySimPanel } from './GantrySimPanel';

export function GantryModePanel() {
  const mode = useGantryAppStore((s) => s.mode);
  return (
    <div data-dt-gantry-panel style={{ fontSize: 12, color: '#e2e8f0' }}>
      {mode === 'auto' ? <GantryDemoPanel />
        : mode === 'sim' ? <GantrySimPanel /> : <GantryManualPanel />}
    </div>
  );
}
