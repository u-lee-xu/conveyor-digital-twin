/**
 * 手动模式：点动 / 回原点 / 一键定位 / position 工件坐标系置零 / 气缸真空 / 急停复位 + 只读状态。
 *
 * position 是**相对读数**：读数 = 机床坐标 - 零点偏置。
 * 「设 0.0 点」把当前机构位置定义为 0.0，机构本身不动；之后 XY 移动读数自然增减、可为负。
 */
import { useState } from 'react';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_SENSOR, cellToMm } from '../constants/gantryConstants';
import { box, btn, inputStyle, CellGrid, GantryStatusPanel } from './GantryPanelParts';

export function GantryManualPanel() {
  const x = useGantryStore((s) => s.x);
  const y = useGantryStore((s) => s.y);
  const zeroX = useGantryStore((s) => s.zeroX);
  const zeroY = useGantryStore((s) => s.zeroY);
  const cylinder = useGantryStore((s) => s.cylinder);
  const suction = useGantryStore((s) => s.suction);
  const estop = useGantryStore((s) => s.estop);
  const [posX, setPosX] = useState('0.0');
  const [posY, setPosY] = useState('0.0');
  const s = useGantryStore.getState();
  const dispX = x.position - zeroX;
  const dispY = y.position - zeroY;

  return (
    <div data-dt-gantry-manual>
      <div style={box}>
        <b>position 坐标变量</b>
        <div data-dt-gantry-position style={{ fontFamily: 'monospace', marginTop: 5, whiteSpace: 'nowrap', color: '#93c5fd' }}>
          X {dispX.toFixed(1)} mm Y {dispY.toFixed(1)} mm
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="X轴左移" style={btn} onClick={() => s.setXTarget(x.position - 10)}>X −10</button>
          <button aria-label="X轴右移" style={btn} onClick={() => s.setXTarget(x.position + 10)}>X +10</button>
          <button aria-label="Y轴后退" style={btn} onClick={() => s.setYTarget(y.position - 10)}>Y −10</button>
          <button aria-label="Y轴前进" style={btn} onClick={() => s.setYTarget(y.position + 10)}>Y +10</button>
          <button aria-label="回原点" style={btn}
            onClick={() => { s.setXTarget(GANTRY_SENSOR.X_ORIGIN); s.setYTarget(GANTRY_SENSOR.Y_ORIGIN); }}>回原点</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#94a3b8' }}>设当前点为</span>
          <input aria-label="X位置赋值" style={inputStyle} value={posX} onChange={(e) => setPosX(e.target.value)} />
          <input aria-label="Y位置赋值" style={inputStyle} value={posY} onChange={(e) => setPosY(e.target.value)} />
          <button aria-label="position赋值" style={btn}
            onClick={() => s.setPositionZero(Number(posX), Number(posY))}>设置</button>
          <button aria-label="设0.0点" style={{ ...btn, background: '#1d4ed8' }}
            onClick={() => { setPosX('0.0'); setPosY('0.0'); s.setPositionZero(0, 0); }}>设 0.0 点</button>
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
