/** 演示模式：本地状态机循环，启停 / 暂停 / 轮次 + 只读读数 */
import { MOTOR_DEMO_STEPS, useMotorStore } from '../stores/useMotorStore';
import {
  box, btn, MotorLampBar, MotorCoilStatus, MotorReadout, MotorSensorPanel,
} from './MotorPanelParts';

export function MotorDemoPanel() {
  const running = useMotorStore((s) => s.demoRunning);
  const paused = useMotorStore((s) => s.demoPaused);
  const step = useMotorStore((s) => s.demoStep);
  const round = useMotorStore((s) => s.round);
  const stopRequested = useMotorStore((s) => s.stopRequested);
  const startDemo = useMotorStore((s) => s.startDemo);
  const requestStopDemo = useMotorStore((s) => s.requestStopDemo);
  const toggleDemoPause = useMotorStore((s) => s.toggleDemoPause);

  return (
    <div data-dt-motor-demo>
      <div style={box}>
        <b>演示循环</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="启动演示" type="button" style={{ ...btn, background: running ? '#14382a' : undefined }}
            onClick={() => startDemo()}>启动演示</button>
          <button aria-label="停止演示" type="button" style={btn} onClick={() => requestStopDemo()}>停止演示</button>
          <button aria-label="暂停演示" type="button" style={btn} onClick={() => toggleDemoPause()}>
            {paused ? '继续' : '暂停'}
          </button>
        </div>
        <div data-dt-motor-demo-status style={{ fontFamily: 'monospace', marginTop: 6, lineHeight: 1.7 }}>
          <div>状态 {running ? (paused ? '暂停' : '运行') : '停止'} · 轮次 {round}</div>
          <div>当前步 {step + 1} / {MOTOR_DEMO_STEPS.length} · {MOTOR_DEMO_STEPS[step].label}</div>
          {stopRequested && <div style={{ color: '#fcd34d' }}>停止请求 · 完成本轮后停下</div>}
        </div>
      </div>
      <MotorLampBar />
      <MotorCoilStatus />
      <MotorReadout />
      <MotorSensorPanel />
    </div>
  );
}
