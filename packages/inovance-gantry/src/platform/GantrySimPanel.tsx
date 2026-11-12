/** 仿真模式：连接 PLC + 主令输入 + 变量地址表 + 位置寄存器读数 + 只读状态 */
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_WORD_VARIABLES, GANTRY_ADDRESS_ROWS } from '../constants/gantryVariables';
import { box, btn, GantryStatusPanel, GantryVariableTable } from './GantryPanelParts';
import { GantryPlcConnection, pulseGantryInput } from './GantryPlcConnection';

export function GantrySimPanel() {
  const connected = useGantryStore((s) => s.connected);
  const x = useGantryStore((s) => s.x);
  const y = useGantryStore((s) => s.y);
  const z = useGantryStore((s) => s.z);
  const estop = useGantryStore((s) => s.estop);
  const s = useGantryStore.getState();

  const mainCommands: { name: 'GANTRY_START' | 'GANTRY_STOP' | 'GANTRY_RESET' | 'GANTRY_ESTOP' | 'GANTRY_CONFIRM'; label: string }[] = [
    { name: 'GANTRY_START', label: '启动' },
    { name: 'GANTRY_STOP', label: '停止' },
    { name: 'GANTRY_RESET', label: '复位' },
    { name: 'GANTRY_CONFIRM', label: '确认' },
  ];

  return (
    <div data-dt-gantry-sim>
      <GantryPlcConnection modeLabel="仿真模式" />
      <div style={box}>
        <b>主令控制</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {mainCommands.map((c) => (
            <button key={c.name} type="button" aria-label={`主令 ${c.label}`} style={btn}
              onClick={() => void pulseGantryInput(c.name)}>{c.label}</button>
          ))}
          <button aria-label="急停" style={{ ...btn, background: estop ? '#b91c1c' : undefined }}
            onClick={() => { void pulseGantryInput('GANTRY_ESTOP'); s.setEstop(!estop); }}>急停 {estop ? 'ON' : 'OFF'}</button>
          <button aria-label="复位" style={btn} onClick={() => s.resetAll()}>全部复位</button>
        </div>
        <div data-dt-gantry-sim-hint style={{ fontFamily: 'monospace', marginTop: 6, color: connected ? '#86efac' : '#fcd34d' }}>
          {connected ? 'PLC 已连接 · 主令写入输入线圈' : '未连接 PLC：按键不会写入任何地址，请先在上方连接仿真 PLC'}
        </div>
      </div>

      <div style={box}>
        <b>位置数据寄存器 · 机床坐标</b>
        <div data-dt-gantry-registers style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
          HR200 X {Math.round(x.position)} · MW1000 · D1000
          HR202 Y {Math.round(y.position)} · MW1004 · D1002
          HR208 Z {Math.round(z)} · MW1016 · D1008
        </div>
        <div style={{ fontFamily: 'monospace', marginTop: 4, color: '#94a3b8', whiteSpace: 'nowrap' }}>
          字变量 {Object.keys(GANTRY_WORD_VARIABLES).length} · 地址行 {GANTRY_ADDRESS_ROWS.length} · 6 路传感器输入
        </div>
      </div>

      <GantryVariableTable />
      <GantryStatusPanel />
    </div>
  );
}
