/** 手动模式：点动 / 回原点 / 一键定位 / position 赋值 / 气缸真空 / 急停复位 + 只读状态 */
import { useState } from 'react';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_SENSOR, cellToMm } from '../constants/gantryConstants';
import { box, btn, inputStyle, CellGrid, GantryStatusPanel } from './GantryPanelParts';

export function GantryManualPanel() {
  const x = useGantryStore((s) => s.x);
  const y = useGantryStore((s) => s.y);
  const cylinder = useGantryStore((s) => s.cylinder);
  const suction = useGantryStore((s) => s.suction);
  const estop = useGantryStore((s) => s.estop);
  const [posX, setPosX] = useState('0');
  const [posY, setPosY] = useState('0');
  const s = useGantryStore.getState();

  return (
    <div data-dt-gantry-manual>
      <div style={box}>
        <b>position 坐标变量</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="X轴左移" style={btn} onClick={() => s.setXTarget(x.position - 10)}>X −10</button>
          <button aria-label="X轴右移" style={btn} onClick={() => s.setXTarget(x.position + 10)}>X +10</button>
          <button aria-label="Y轴后退" style={btn} onClick={() => s.setYTarget(y.position - 10)}>Y −10</button>
          <button aria-label="Y轴前进" style={btn} onClick={() => s.setYTarget(y.position + 10)}>Y +10</button>
          <button aria-label="回原点" style={btn}
            onClick={() => { s.setXTarget(GANTRY_SENSOR.X_ORIGIN); s.setYTarget(GANTRY_SENSOR.Y_ORIGIN); }}>回原点</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#94a3b8' }}>赋值</span>
          <input aria-label="X位置赋值" style={inputStyle} value={posX} onChange={(e) => setPosX(e.target.value)} />
          <input aria-label="Y位置赋值" style={inputStyle} value={posY} onChange={(e) => setPosY(e.target.value)} />
          <button aria-label="position赋值" style={btn}
            onClick={() => s.setManualPosition(Number(posX), Number(posY))}>写入 position</button>
        </div>
      </div>

      <div style={box}>
        <b>一键定位</b>
        <CellGrid onPick={(row, col) => {
          const p = cellToMm(row, col);
          s.setXTarget(p.x);
          s.setYTarget(p.y);
        }} />
      </div>

      <div style={box}>
        <b>气缸 / 吸盘</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="气缸下降" style={{ ...btn, background: cylinder.extended ? '#b45309' : undefined }}
            onClick={() => s.setCylinder(!cylinder.extended)}>{cylinder.extended ? '下降中' : '升起'}</button>
          <button aria-label="真空吸盘" style={{ ...btn, background: suction.vacuum ? '#15803d' : undefined }}
            onClick={() => s.setSuction(!suction.vacuum)}>真空 {suction.vacuum ? 'ON' : 'OFF'}</button>
          <button aria-label="急停" style={{ ...btn, background: estop ? '#b91c1c' : undefined }}
            onClick={() => s.setEstop(!estop)}>急停 {estop ? 'ON' : 'OFF'}</button>
          <button aria-label="复位" style={btn} onClick={() => s.resetAll()}>复位</button>
        </div>
      </div>
      <GantryStatusPanel />
    </div>
  );
}
