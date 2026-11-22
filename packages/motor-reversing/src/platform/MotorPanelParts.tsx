/** 三模式面板共享的样式、读数、状态灯、14 路反馈与三协议变量地址表 */
/* eslint-disable react-refresh/only-export-components */
import { useState, type CSSProperties } from 'react';
import { MOTOR_PHASE_LABEL, MOTOR_LAMP_COLORS } from '../constants/motorConstants';
import {
  MOTOR_ADDRESS_ROWS, MOTOR_SENSOR_FEEDBACK, motorSensorBits,
} from '../constants/motorVariables';
import {
  useMotorStore, motorFeedbackOf,
} from '../stores/useMotorStore';
import { MotorHint, MotorSensorHint } from './MotorAddressHint';

export const box: CSSProperties = { background: 'rgba(30,41,59,.9)', border: '1px solid rgba(100,116,139,.4)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 };
export const btn: CSSProperties = { padding: '3px 7px', borderRadius: 5, cursor: 'pointer', background: 'rgba(71,85,105,.6)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0', fontSize: 11 };
export const inputStyle: CSSProperties = { width: 62, padding: '2px 5px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, fontSize: 11 };

const led = (on: boolean, color: string): CSSProperties => ({
  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
  background: on ? color : '#334155', border: '1px solid rgba(148,163,184,.45)', marginRight: 3,
});

/** 柜门四只指示灯的状态镜像，颜色与 3D 同源 */
export function MotorLampBar() {
  const qf = useMotorStore((s) => s.qfClosed);
  const direction = useMotorStore((s) => s.direction);
  const overload = useMotorStore((s) => s.frTripped);
  const lamps = [
    { label: '电源', on: qf, color: MOTOR_LAMP_COLORS.power },
    { label: '正转', on: direction === 1, color: MOTOR_LAMP_COLORS.forward },
    { label: '反转', on: direction === -1, color: MOTOR_LAMP_COLORS.reverse },
    { label: '过载', on: overload, color: MOTOR_LAMP_COLORS.overload },
  ];
  return (
    <div data-dt-motor-lamps style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {lamps.map((l) => (
        <span key={l.label} style={{ fontFamily: 'monospace' }}>
          <span style={led(l.on, l.color)} />{l.label} {l.on ? 'ON' : 'OFF'}
        </span>
      ))}
    </div>
  );
}

/** 过程量读数：全部由真值派生，面板不另算一遍 */
export function MotorReadout() {
  const speed = useMotorStore((s) => s.speedRpm);
  const displacement = useMotorStore((s) => s.beltDisplacement);
  const current = useMotorStore((s) => s.currentA);
  const thermal = useMotorStore((s) => s.thermal);
  const phase = useMotorStore((s) => s.phase);
  const round = useMotorStore((s) => s.round);
  const load = useMotorStore((s) => s.loadPercent);
  return (
    <div style={box}>
      <b>过程读数</b>
      <div data-dt-motor-readout style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.8 }}>
        <div><MotorHint hintKey="speed" title="电机转速">转速</MotorHint> {Math.abs(speed).toFixed(0)} r/min</div>
        <div><MotorHint hintKey="displacement" title="皮带位移">位移</MotorHint> {displacement.toFixed(1)} mm</div>
        <div><MotorHint hintKey="current" title="电机电流">电流</MotorHint> {current.toFixed(2)} A</div>
        <div><MotorHint hintKey="thermal" title="热累积">热累积</MotorHint> {(thermal * 100).toFixed(0)} % · 负载 {load.toFixed(0)} %</div>
        <div><MotorHint hintKey="phase" title="工艺阶段">阶段</MotorHint> {phase} {MOTOR_PHASE_LABEL[phase]} · 轮次 {round}</div>
      </div>
    </div>
  );
}

/** 线圈与硬件互锁状态：禁止态 / 互锁挡住都可见 */
export function MotorCoilStatus() {
  const s = useMotorStore((state) => state);
  return (
    <div style={box}>
      <b>接触器与互锁</b>
      <div data-dt-motor-coils style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.8 }}>
        <div>
          QF {s.qfClosed ? '合闸' : '分断'} ·{' '}
          <MotorHint hintKey="km1" title="KM1 线圈"><span style={{ color: s.km1On ? MOTOR_LAMP_COLORS.forward : '#94a3b8' }}>KM1 {s.km1On ? '吸合' : '释放'}</span></MotorHint> ·{' '}
          <MotorHint hintKey="km2" title="KM2 线圈"><span style={{ color: s.km2On ? MOTOR_LAMP_COLORS.reverse : '#94a3b8' }}>KM2 {s.km2On ? '吸合' : '释放'}</span></MotorHint>
        </div>
        <div>命令 KM1 {s.km1Cmd ? 'ON' : 'OFF'} · KM2 {s.km2Cmd ? 'ON' : 'OFF'}</div>
        <div>
          <span style={led(s.forbidden, MOTOR_LAMP_COLORS.overload)} />禁止态 {s.forbidden ? '保持' : '无'} ·{' '}
          <span style={led(s.interlocked, MOTOR_LAMP_COLORS.reverse)} />硬件互锁 {s.interlocked ? '挡住' : '正常'}
        </div>
        <div>
          <span style={led(s.frTripped, MOTOR_LAMP_COLORS.overload)} />
          <MotorHint hintKey="frReset" title="FR 复位">FR {s.frTripped ? '已跳闸' : '正常'}</MotorHint>
          {s.arcTimer > 0 && ` · 换向灭弧 ${s.arcTimer.toFixed(2)} s`}
        </div>
      </div>
    </div>
  );
}

/** 14 路设备→PLC 开关量反馈，与回写掩码同源同序 */
export function MotorSensorPanel() {
  const s = useMotorStore();
  const bits = motorSensorBits(motorFeedbackOf(s));
  return (
    <div style={box}>
      <b><MotorHint hintKey="sensorMask" title="开关量掩码">开关量状态 14 路</MotorHint></b>
      <div data-dt-motor-sensors style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
        {MOTOR_SENSOR_FEEDBACK.map((r, i) => (
          <span key={r.key} style={{ display: 'inline-block', width: '50%', whiteSpace: 'nowrap' }}>
            <span style={led(bits[i], '#4ade80')} />
            <MotorSensorHint sensorKey={r.key} label={r.signal} /> {bits[i] ? 'ON' : 'OFF'}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 仿真模式常驻的三协议变量地址表（表头恒「信号 / 三菱 FX / Modbus TCP / Siemens S7」） */
export function MotorVariableTable() {
  const [open, setOpen] = useState(true);
  return (
    <div style={box}>
      <button aria-label="变量地址表" style={{ ...btn, width: '100%' }} onClick={() => setOpen((v) => !v)}>
        变量地址表 {open ? '收起' : '展开'}
      </button>
      {open && (
        <table data-dt-motor-addresses style={{ width: '100%', marginTop: 6, fontSize: 10, borderCollapse: 'collapse', fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ color: '#93c5fd' }}>
              <th style={{ textAlign: 'left', padding: '2px 3px' }}>信号</th>
              <th style={{ textAlign: 'left' }}>三菱 FX</th>
              <th style={{ textAlign: 'left' }}>Modbus TCP</th>
              <th style={{ textAlign: 'left' }}>Siemens S7</th>
            </tr>
          </thead>
          <tbody>
            {MOTOR_ADDRESS_ROWS.map((r) => (
              <tr key={r.signal} style={{ color: '#e2e8f0' }}>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)', padding: '2px 3px' }}>{r.signal}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.mitsubishi}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.modbus}</td>
                <td style={{ borderBottom: '1px solid rgba(100,116,139,.25)' }}>{r.s7}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
