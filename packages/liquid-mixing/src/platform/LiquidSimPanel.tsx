/** 仿真模式：连接 PLC + 三个主令 + 四罐 REAL 寄存器读数 + 变量地址表 + 只读读数 */
import { useLiquidStore } from '../stores/useLiquidStore';
import { LIQUID_ADDRESS_ROWS } from '../constants/liquidVariables';
import { TANK_IDS, LIQUID_TANKS } from '../constants/liquidConstants';
import {
  box, btn, LEVEL_HINT,
  LiquidVariableTable, LiquidLevelReadout, LiquidStatusPanel, LiquidAlarmPanel,
} from './LiquidPanelParts';
import { LiquidHint } from './LiquidAddressHint';
import { LiquidPlcConnection, pulseLiquidAction, LIQUID_ACTION_BUTTONS } from './LiquidPlcConnection';

export function LiquidSimPanel() {
  const volumes = useLiquidStore((s) => s.volumes);
  const connected = useLiquidStore((s) => s.connected);

  return (
    <div data-dt-liquid-sim>
      <LiquidPlcConnection modeLabel="仿真模式" />
      <div style={box}>
        <b><LiquidHint hintKey="actionWord" title="显式动作字">主令控制</LiquidHint></b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {LIQUID_ACTION_BUTTONS.map((c) => (
            <button key={c.code} type="button" aria-label={`主令 ${c.label}`} style={btn}
              onClick={() => void pulseLiquidAction(c.code)}>{c.label}</button>
          ))}
        </div>
        <div style={{ fontFamily: 'monospace', marginTop: 6, color: connected ? '#86efac' : '#fcd34d' }}>
          连接 {connected ? 'ON' : 'OFF'}
        </div>
      </div>

      <div style={box}>
        <b>REAL 寄存器读数</b>
        <div data-dt-liquid-registers style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
          {TANK_IDS.map((tank, i) => (
            <div key={tank}>
              {LIQUID_ADDRESS_ROWS[i].modbus} <LiquidHint hintKey={LEVEL_HINT[tank]} title={`${LIQUID_TANKS[tank].label}液位`}>{LIQUID_TANKS[tank].label}</LiquidHint> {volumes[tank].toFixed(2)} L
            </div>
          ))}
        </div>
      </div>

      <LiquidVariableTable />
      <LiquidLevelReadout />
      <LiquidStatusPanel />
      <LiquidAlarmPanel />
    </div>
  );
}
