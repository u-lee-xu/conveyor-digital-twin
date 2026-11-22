/** 手动模式：5 个柜门按钮 + KM 直控 + 电源 / 负载 / 过载 / 复位 + 读数 */
/* eslint-disable react-refresh/only-export-components */
import { MOTOR_BUTTON_LABELS, type MotorButtons } from '../constants/motorConstants';
import { useMotorStore } from '../stores/useMotorStore';
import {
  box, btn, MotorLampBar, MotorReadout, MotorCoilStatus, MotorSensorPanel,
} from './MotorPanelParts';

export const MOTOR_BUTTON_ORDER: readonly (keyof MotorButtons)[] = [
  'fwdJog', 'revJog', 'fwdStart', 'revStart', 'stop',
];

/**
 * 柜门按钮：按住为电平 1、松开为 0。
 * 手动模式由按钮驱动线圈；仿真模式只改「设备→PLC」输入反馈，绝不直接吸合接触器。
 */
export function MotorButtonPad({ caption = '柜门按钮' }: { caption?: string }) {
  const buttons = useMotorStore((s) => s.buttons);
  const setButton = useMotorStore((s) => s.setButton);
  return (
    <div style={box}>
      <b>{caption}</b>
      <div data-dt-motor-buttons style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {MOTOR_BUTTON_ORDER.map((key) => {
          const on = buttons[key];
          const down = () => setButton(key, true);
          const up = () => setButton(key, false);
          const label = MOTOR_BUTTON_LABELS[key];
          return (
            <button
              key={key} type="button" aria-label={label} data-dt-motor-button={key}
              style={{ ...btn, background: on ? '#1d4ed8' : 'rgba(71,85,105,.6)' }}
              onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') down(); }}
              onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') up(); }}
            >
              {label} {on ? 'ON' : 'OFF'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MotorManualPanel() {
  const qf = useMotorStore((s) => s.qfClosed);
  const setQf = useMotorStore((s) => s.setQf);
  const kmDirect = useMotorStore((s) => s.kmDirect);
  const setDirectCoil = useMotorStore((s) => s.setDirectCoil);
  const load = useMotorStore((s) => s.loadPercent);
  const setLoad = useMotorStore((s) => s.setLoad);
  const frTripped = useMotorStore((s) => s.frTripped);
  const plcRun = useMotorStore((s) => s.plcRun);
  const togglePlcRun = useMotorStore((s) => s.togglePlcRun);
  const triggerOverload = useMotorStore((s) => s.triggerOverload);
  const resetFr = useMotorStore((s) => s.resetFr);
  const resetAll = useMotorStore((s) => s.resetAll);

  return (
    <div data-dt-motor-manual>
      <MotorButtonPad />
      <div style={box}>
        <b>电源与接触器直控</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="空气开关" type="button" style={{ ...btn, background: qf ? '#14382a' : '#3b1d1d' }}
            onClick={() => setQf(!qf)}>空气开关 {qf ? '合闸' : '分断'}</button>
          <button aria-label="KM1 直控" type="button" style={{ ...btn, background: kmDirect.km1 ? '#1d4ed8' : undefined }}
            onClick={() => setDirectCoil('km1', !kmDirect.km1)}>KM1 直控 {kmDirect.km1 ? 'ON' : 'OFF'}</button>
          <button aria-label="KM2 直控" type="button" style={{ ...btn, background: kmDirect.km2 ? '#1d4ed8' : undefined }}
            onClick={() => setDirectCoil('km2', !kmDirect.km2)}>KM2 直控 {kmDirect.km2 ? 'ON' : 'OFF'}</button>
          {/* 第三十七轮：PLC 运行开关，与 3D 点击 PLC 同一动作；STOP 时程序不执行 */}
          <button aria-label="PLC 运行" type="button" data-dt-plc-run={plcRun ? 'RUN' : 'STOP'}
            style={{ ...btn, background: plcRun ? '#14382a' : '#3b1d1d' }}
            onClick={() => togglePlcRun()}>PLC {plcRun ? 'RUN' : 'STOP'}</button>
        </div>
      </div>
      <div style={box}>
        <b>负载与过载</b>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', fontFamily: 'monospace' }}>
          <span style={{ color: '#94a3b8' }}>负载</span>
          <input aria-label="负载" type="range" min={0} max={100} step={1} value={load}
            style={{ flex: 1 }} onChange={(e) => setLoad(Number(e.target.value))} />
          <span style={{ width: 42, textAlign: 'right', color: '#93c5fd' }}>{load.toFixed(0)} %</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="一键过载" type="button" style={btn} onClick={() => triggerOverload()}>一键过载</button>
          <button aria-label="FR 复位" type="button" style={{ ...btn, background: frTripped ? '#7f1d1d' : undefined }}
            onClick={() => resetFr()}>FR 复位</button>
          <button aria-label="全部复位" type="button" style={btn} onClick={() => resetAll()}>全部复位</button>
        </div>
      </div>
      <MotorLampBar />
      <MotorCoilStatus />
      <MotorReadout />
      <MotorSensorPanel />
    </div>
  );
}
