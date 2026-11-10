import { isViewerRuntime } from '@digital-twin/shared';
import { useTrafficScoring } from '../scenes/traffic-light/hooks/useTrafficScoring';
import { useAppStore } from '../stores/useAppStore';
import { useTrafficStore } from '../scenes/traffic-light/useTrafficStore';

/** 评分状态机本体：只在门控通过后挂载，其它模式 / 观众端不会带上它的副作用 */
function ScoringRunner() {
  useTrafficScoring();
  return null;
}

/**
 * 平台壳常驻副作用入口。
 * useTrafficScoring() 内部已有 mode / isScoringRunning 守卫，这里再按主控角色、
 * 模式与评分运行态做外层门控：非评分态直接不挂载状态机，观众端只读镜像不跑评分。
 */
export function TrafficScoringGate() {
  const mode = useAppStore((s) => s.mode);
  const isScoringRunning = useTrafficStore((s) => s.isScoringRunning);
  if (isViewerRuntime()) return null;
  if (mode !== 'scoring' || !isScoringRunning) return null;
  return <ScoringRunner />;
}
