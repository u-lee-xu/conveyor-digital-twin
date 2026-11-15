/** 三模式面板分发器：外壳按 useLiquidAppStore.mode 分发，data-dt-liquid-panel 锚点唯一 */
import { useLiquidAppStore } from '../stores/useLiquidAppStore';
import { LiquidManualPanel } from './LiquidManualPanel';
import { LiquidDemoPanel } from './LiquidDemoPanel';
import { LiquidSimPanel } from './LiquidSimPanel';

export function LiquidModePanel() {
  const mode = useLiquidAppStore((s) => s.mode);
  return (
    <div data-dt-liquid-panel style={{
      fontSize: 12, color: '#e2e8f0',
      // 900px 级视口下读数区曾被截断：面板自身可滚动，关键读数同时上移到顶部
      maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
      paddingRight: 4, scrollbarWidth: 'thin',
    }}>
      {mode === 'auto' ? <LiquidDemoPanel />
        : mode === 'sim' ? <LiquidSimPanel /> : <LiquidManualPanel />}
    </div>
  );
}
