/** 仿真模式：连接外部 PLC + 柜门按钮输入 + 主令 + 三协议地址表 + 只读读数 */
import { useMotorStore } from '../stores/useMotorStore';
import {
  box, btn, MotorLampBar, MotorCoilStatus, MotorReadout,
  MotorSensorPanel, MotorVariableTable,
} from './MotorPanelParts';
import { MotorHint } from './MotorAddressHint';
import { MotorButtonPad } from './MotorManualPanel';
import {
  MotorPlcConnection, pulseMotorAction, MOTOR_ACTION_BUTTONS,
} from './MotorPlcConnection';

export function MotorSimPanel() {
  const connected = useMotorStore((s) => s.connected);
  const frTripped = useMotorStore((s) => s.frTripped);
  const resetFr = useMotorStore((s) => s.resetFr);

  return (
    <div data-dt-motor-sim>
      <MotorPlcConnection modeLabel="仿真模式" />
      {/* 仿真模式按钮只是设备→PLC 输入点，线圈由学生 PLC 程序输出决定 */}
      <MotorButtonPad caption="柜门按钮 → PLC 输入" />
      <div style={box}>
        <b><MotorHint hintKey="actionWord" title="显式动作字">主令控制</MotorHint></b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {MOTOR_ACTION_BUTTONS.map((c) => (
            <button key={c.code} type="button" aria-label={`主令 ${c.label}`} style={btn}
              onClick={() => void pulseMotorAction(c.code)}>{c.label}</button>
          ))}
          <button aria-label="FR 复位" type="button" style={{ ...btn, background: frTripped ? '#7f1d1d' : undefined }}
            onClick={() => resetFr()}>FR 复位</button>
        </div>
        <div style={{ fontFamily: 'monospace', marginTop: 6, color: connected ? '#86efac' : '#fcd34d' }}>
          连接 {connected ? 'ON' : 'OFF'} · 控制来源 {connected ? 'PLC' : '本地'}
        </div>
      </div>
      <MotorVariableTable />
      <MotorLampBar />
      <MotorCoilStatus />
      <MotorReadout />
      <MotorSensorPanel />
    </div>
  );
}
