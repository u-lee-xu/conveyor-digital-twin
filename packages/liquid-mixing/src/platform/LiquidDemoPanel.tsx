/** 演示模式：循环启停 / 暂停 / 紧急停 + 配方与只读读数 */
import { useLiquidStore } from '../stores/useLiquidStore';
import { LIQUID_PHASE_LABEL } from '../constants/liquidConstants';
import {
  box, btn,
  LiquidRecipeEditor, LiquidLevelReadout, LiquidStatusPanel, LiquidAlarmPanel,
} from './LiquidPanelParts';
import { LiquidHint, LiquidSensorHint } from './LiquidAddressHint';

export function LiquidDemoPanel() {
  const demoRunning = useLiquidStore((s) => s.demoRunning);
  const demoPaused = useLiquidStore((s) => s.demoPaused);
  const stopRequested = useLiquidStore((s) => s.stopRequested);
  const round = useLiquidStore((s) => s.round);
  const phase = useLiquidStore((s) => s.phase);
  const sensors = useLiquidStore((s) => s.sensors);
  const startDemo = useLiquidStore((s) => s.startDemo);
  const requestStopDemo = useLiquidStore((s) => s.requestStopDemo);
  const toggleDemoPause = useLiquidStore((s) => s.toggleDemoPause);
  const estop = useLiquidStore((s) => s.estop);
  const setEstop = useLiquidStore((s) => s.setEstop);
  const clearAlarm = useLiquidStore((s) => s.clearAlarm);

  return (
    <div data-dt-liquid-demo>
      <div style={box}>
        <b>主令控制</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="演示启动" data-dt-liquid-demo-running={demoRunning ? '1' : '0'}
            style={{ ...btn, background: demoRunning ? '#1d4ed8' : undefined }}
            onClick={() => startDemo()}>▶ 启动</button>
          <button aria-label="停止本轮后" style={btn} onClick={() => requestStopDemo()}>停止本轮后</button>
          <button aria-label="演示暂停" style={{ ...btn, background: demoPaused ? '#b45309' : undefined }}
            onClick={() => toggleDemoPause()}>{demoPaused ? '继续' : '⏸ 暂停'}</button>
          <button aria-label="紧急停" style={{ ...btn, background: estop ? '#b45309' : '#b91c1c' }}
            data-dt-liquid-estop={estop ? '1' : '0'}
            onClick={() => (estop ? clearAlarm() : setEstop(true))}>{estop ? '解除急停' : '紧急停'}</button>
        </div>
        <div style={{ fontFamily: 'monospace', marginTop: 6, lineHeight: 1.7 }}>
          <div data-dt-liquid-phase><LiquidHint hintKey="phase" title="工艺阶段">阶段</LiquidHint> {phase} {LIQUID_PHASE_LABEL[phase]}</div>
          <div><LiquidHint hintKey="round" title="循环轮次">轮次</LiquidHint> {round} 停止请求 {stopRequested ? 'ON' : 'OFF'}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: sensors.forward ? '#4ade80' : '#475569' }}>● <LiquidSensorHint sensorKey="LIQUID_STIR_FORWARD" label="正转" /> {sensors.forward ? 'ON' : 'OFF'}</span>
            <span style={{ color: sensors.reverse ? '#4ade80' : '#475569' }}>● <LiquidSensorHint sensorKey="LIQUID_STIR_REVERSE" label="反转" /> {sensors.reverse ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      </div>
      {/* 关键读数上移，配方设定下沉：常规视口首屏即可读全四罐液位 */}
      <LiquidLevelReadout />
      <LiquidStatusPanel />
      <LiquidAlarmPanel />
      <LiquidRecipeEditor />
    </div>
  );
}
