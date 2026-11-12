/** 演示模式：循环搬运（轮次设定 + 启停/暂停/复位/急停），不连 PLC，只驱动 position 坐标变量 */
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_DEMO_SEQUENCE } from '../constants/gantryConstants';
import { box, btn, inputStyle, PHASE_LABEL, GantryStatusPanel } from './GantryPanelParts';

export function GantryDemoPanel() {
  const demoRunning = useGantryStore((s) => s.demoRunning);
  const demoPaused = useGantryStore((s) => s.demoPaused);
  const demoRounds = useGantryStore((s) => s.demoRounds);
  const demoRound = useGantryStore((s) => s.demoRound);
  const demoIndex = useGantryStore((s) => s.demoIndex);
  const demoCompleted = useGantryStore((s) => s.demoCompleted);
  const phase = useGantryStore((s) => s.phase);
  const estop = useGantryStore((s) => s.estop);
  const s = useGantryStore.getState();

  return (
    <div data-dt-gantry-demo>
      <div style={box}>
        <b>循环搬运设定</b>
        <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'center' }}>
          <span style={{ color: '#94a3b8' }}>轮次</span>
          <input aria-label="演示轮次" type="number" min={1} max={20} style={inputStyle}
            value={demoRounds} onChange={(e) => s.setDemoRounds(Number(e.target.value))} />
          <span style={{ color: '#94a3b8' }}>每轮 {GANTRY_DEMO_SEQUENCE.length} 次搬运</span>
        </div>
      </div>

      <div style={box}>
        <b>主令控制</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="演示启动" data-dt-gantry-demo-running={demoRunning ? '1' : '0'}
            style={{ ...btn, background: demoRunning ? '#1d4ed8' : undefined }}
            onClick={() => (demoRunning ? s.stopDemo() : s.startDemo())}>
            {demoRunning ? '■ 停止' : '▶ 启动'}
          </button>
          <button aria-label="演示暂停" style={{ ...btn, background: demoPaused ? '#b45309' : undefined }}
            onClick={() => s.toggleDemoPause()}>{demoPaused ? '继续' : '⏸ 暂停'}</button>
          <button aria-label="演示复位" style={btn} onClick={() => s.resetAll()}>↺ 复位</button>
          <button aria-label="急停" style={{ ...btn, background: estop ? '#b91c1c' : undefined }}
            onClick={() => s.setEstop(!estop)}>急停 {estop ? 'ON' : 'OFF'}</button>
        </div>
        <div data-dt-gantry-demo-state style={{ fontFamily: 'monospace', marginTop: 6, lineHeight: 1.7 }}>
          轮次 {demoRound + 1} / {demoRounds} 当前 {GANTRY_DEMO_SEQUENCE[demoIndex]?.label ?? '—'} 完成 {demoCompleted} 次
        </div>
        <div data-dt-gantry-demo-phase style={{ fontFamily: 'monospace', marginTop: 3 }}>
          阶段 {phase} {PHASE_LABEL[phase]} {demoPaused ? '已暂停' : demoRunning ? '运行中' : '待机'}
        </div>
      </div>
      <GantryStatusPanel />
    </div>
  );
}
