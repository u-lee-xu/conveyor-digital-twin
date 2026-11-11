/**
 * MD520 独立场景模式面板：手动模式直接操作变频器，仿真模式额外提供 PLC 连接。
 * 面板本体只加控件与只读数值，不写说明段落。
 */
import { VfdKeypadPanel } from './VfdKeypadPanel';
import { VfdPlcConnection } from './VfdPlcConnection';
import { useVfdAppStore } from '../stores/useVfdAppStore';

export function VfdModePanel() {
  const mode = useVfdAppStore((s) => s.mode);
  return (
    <div className="space-y-3">
      {mode === 'sim' && <VfdPlcConnection modeLabel="仿真模式" />}
      <VfdKeypadPanel />
    </div>
  );
}
