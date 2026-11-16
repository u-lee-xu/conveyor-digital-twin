/** 演示模式：操作站 / 暂停 / 阶段轮次 / 只读读数与传感器信号 */
import { useLiquidStore } from '../stores/useLiquidStore';
import { LIQUID_PHASE_LABEL } from '../constants/liquidConstants';
import {
  box, btn,
  LiquidOperatorPanel, LiquidLevelReadout, LiquidSensorPanel,
} from './LiquidPanelParts';
import { LiquidHint } from './LiquidAddressHint';

export function LiquidDemoPanel() {
  const demoRunning = useLiquidStore((s) => s.demoRunning);
  const demoPaused = useLiquidStore((s) => s.demoPaused);
  const stopRequested = useLiquidStore((s) => s.stopRequested);
  const round = useLiquidStore((s) => s.round);
  const phase = useLiquidStore((s) => s.phase);
  const estop = useLiquidStore((s) => s.estop);
  const toggleDemoPause = useLiquidStore((s) => s.toggleDemoPause);

  return (
    <div data-dt-liquid-demo>
      {/* 启动 / 停止 / 复位 / 急停 统一由操作站提供，与 3D 开关柜柜面同源 */}
      <LiquidOperatorPanel />

      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="section-title" style={{ flex: 1, fontSize: 11, color: '#94a3b8', marginBottom: 0 }}>
            演示主令
          </span>
          <span className={`badge ${demoRunning ? 'badge-green' : 'badge-slate'}`}
            data-dt-liquid-demo-running={demoRunning ? '1' : '0'}>
            {demoRunning ? '运行中' : '已停止'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button aria-label="演示暂停" style={{ ...btn, background: demoPaused ? '#b45309' : undefined }}
            onClick={() => toggleDemoPause()}>{demoPaused ? '继续' : '⏸ 暂停'}</button>
          <span data-dt-liquid-estop={estop ? '1' : '0'}
            style={{ ...btn, cursor: 'default', background: estop ? '#b91c1c' : undefined, color: estop ? '#fff' : '#94a3b8' }}>
            {estop ? '急停锁定 · 按复位解除' : '急停未按下'}
          </span>
        </div>
        <div style={{ fontFamily: 'monospace', marginTop: 6, lineHeight: 1.7 }}>
          <div data-dt-liquid-phase><LiquidHint hintKey="phase" title="工艺阶段">阶段</LiquidHint> {phase} {LIQUID_PHASE_LABEL[phase]}</div>
          <div><LiquidHint hintKey="round" title="循环轮次">轮次</LiquidHint> {round} 停止请求 {stopRequested ? 'ON' : 'OFF'}</div>
        </div>
      </div>

      {/* 关键读数上移：常规视口首屏即可读全四罐液位与传感器信号 */}
      <LiquidLevelReadout />
      <LiquidSensorPanel />
    </div>
  );
}
