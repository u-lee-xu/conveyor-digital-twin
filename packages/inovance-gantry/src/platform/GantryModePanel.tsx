/**
 * 龙门场景操作面板：position 坐标变量、点动、气缸/吸盘、棋盘格选取、自动吸取流程、
 * 棋子状态与 ETHERCAT 变量/信号映射（只读）。不堆说明段落，只放控件与数值。
 */
import { useState, type CSSProperties } from 'react';
import { useGantryStore } from '../stores/useGantryStore';
import { useGantryAppStore } from '../stores/useGantryAppStore';
import { GANTRY_AXIS, CHESS_POSITIONS, cellToMm } from '../constants/gantryConstants';
import { ETHERCAT_PDO_MAP, GANTRY_PHASE } from '../constants/gantryVariables';

const PHASE_LABEL: Record<number, string> = {
  [GANTRY_PHASE.IDLE]: '待机', [GANTRY_PHASE.MOVE_TO_PICK]: '移向吸取位',
  [GANTRY_PHASE.Z_DOWN_PICK]: '气缸下降', [GANTRY_PHASE.VACUUM_ON]: '吸取',
  [GANTRY_PHASE.Z_UP_PICK]: '抬升', [GANTRY_PHASE.MOVE_TO_PLACE]: '移向放置位',
  [GANTRY_PHASE.Z_DOWN_PLACE]: '下降放置', [GANTRY_PHASE.VACUUM_OFF]: '释放',
  [GANTRY_PHASE.Z_UP_PLACE]: '抬升复位', [GANTRY_PHASE.DONE]: '完成',
};

const box: CSSProperties = { background: 'rgba(30,41,59,.9)', border: '1px solid rgba(100,116,139,.4)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 };
const btn: CSSProperties = { padding: '3px 7px', borderRadius: 5, cursor: 'pointer', background: 'rgba(71,85,105,.6)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0', fontSize: 11 };

function CellRow({ kind }: { kind: 'pick' | 'place' }) {
  const pickCell = useGantryStore((s) => s.pickCell);
  const placeCell = useGantryStore((s) => s.placeCell);
  const selectPick = useGantryStore((s) => s.selectPick);
  const selectPlace = useGantryStore((s) => s.selectPlace);
  const active = kind === 'pick' ? pickCell : placeCell;
  const select = kind === 'pick' ? selectPick : selectPlace;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 5 }}>
      {CHESS_POSITIONS.map((c) => (
        <button key={c.label} type="button" aria-label={`${kind === 'pick' ? '吸取格' : '放置格'} ${c.label}`}
          onClick={() => select(c.row, c.col)}
          style={{ ...btn, background: active.row === c.row && active.col === c.col ? '#1d4ed8' : 'rgba(71,85,105,.5)' }}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function GantryModePanel() {
  const mode = useGantryAppStore((s) => s.mode);
  const x = useGantryStore((s) => s.x);
  const y = useGantryStore((s) => s.y);
  const z = useGantryStore((s) => s.z);
  const cylinder = useGantryStore((s) => s.cylinder);
  const suction = useGantryStore((s) => s.suction);
  const pieces = useGantryStore((s) => s.pieces);
  const heldPieceId = useGantryStore((s) => s.heldPieceId);
  const phase = useGantryStore((s) => s.phase);
  const pickCell = useGantryStore((s) => s.pickCell);
  const placeCell = useGantryStore((s) => s.placeCell);
  const autoRunning = useGantryStore((s) => s.autoRunning);
  const estop = useGantryStore((s) => s.estop);
  const [showMap, setShowMap] = useState(false);
  const [varX, setVarX] = useState('120');
  const [varY, setVarY] = useState('120');

  const s = useGantryStore.getState();
  const pushVar = () => s.setPlcFrame({ xPos: Number(varX), yPos: Number(varY) });

  return (
    <div data-dt-gantry-panel style={{ fontSize: 12, color: '#e2e8f0' }}>
      <div style={box}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <b style={{ flex: 1 }}>position 坐标变量</b>
          <span style={{ color: '#94a3b8' }}>{mode === 'sim' ? '上位机写入' : '本地点动'}</span>
        </div>
        <div data-dt-gantry-pos style={{ fontFamily: 'monospace', lineHeight: 1.7 }}>
          X {x.position.toFixed(1)} / {GANTRY_AXIS.X_TRAVEL} mm Y {y.position.toFixed(1)} / {GANTRY_AXIS.Y_TRAVEL} mm Z {z.toFixed(1)} mm
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button aria-label="X轴左移" style={btn} onClick={() => s.setXTarget(x.position - 10)}>X −10</button>
          <button aria-label="X轴右移" style={btn} onClick={() => s.setXTarget(x.position + 10)}>X +10</button>
          <button aria-label="Y轴后退" style={btn} onClick={() => s.setYTarget(y.position - 10)}>Y −10</button>
          <button aria-label="Y轴前进" style={btn} onClick={() => s.setYTarget(y.position + 10)}>Y +10</button>
          <button aria-label="两轴回零" style={btn} onClick={() => { s.setXTarget(0); s.setYTarget(0); }}>回零</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
          <button aria-label="X轴伺服使能" style={{ ...btn, background: x.enabled ? '#15803d' : undefined }}
            onClick={() => s.setServoEnable('x', !x.enabled)}>X伺服 {x.enabled ? 'ON' : 'OFF'}</button>
          <button aria-label="Y轴伺服使能" style={{ ...btn, background: y.enabled ? '#15803d' : undefined }}
            onClick={() => s.setServoEnable('y', !y.enabled)}>Y伺服 {y.enabled ? 'ON' : 'OFF'}</button>
        </div>
        {mode === 'sim' && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
            <input aria-label="X坐标变量" value={varX} onChange={(e) => setVarX(e.target.value)}
              style={{ width: 52, padding: '2px 4px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4 }} />
            <input aria-label="Y坐标变量" value={varY} onChange={(e) => setVarY(e.target.value)}
              style={{ width: 52, padding: '2px 4px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4 }} />
            <button aria-label="写入坐标变量" style={btn} onClick={pushVar}>写入</button>
            <button aria-label="回到本地控制" style={btn} onClick={() => s.setControlSource('local')}>本地</button>
          </div>
        )}
      </div>

      <div style={box}>
        <b>气缸 / 吸盘</b>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button aria-label="气缸下降" style={{ ...btn, background: cylinder.extended ? '#b45309' : undefined }}
            onClick={() => s.setCylinder(!cylinder.extended)}>{cylinder.extended ? '下降中' : '升起'}</button>
          <button aria-label="真空吸盘" style={{ ...btn, background: suction.vacuum ? '#15803d' : undefined }}
            onClick={() => s.setSuction(!suction.vacuum)}>真空 {suction.vacuum ? 'ON' : 'OFF'}</button>
        </div>
        <div data-dt-gantry-io style={{ fontFamily: 'monospace', marginTop: 5 }}>
          CYL_DOWN {cylinder.extended ? 1 : 0} VACUUM {suction.vacuum ? 1 : 0} HAS_PART {suction.hasPart ? 1 : 0}
        </div>
      </div>

      <div style={box}>
        <b>吸取格 {CHESS_POSITIONS.find((c) => c.row === pickCell.row && c.col === pickCell.col)?.label}</b>
        <CellRow kind="pick" />
        <b style={{ display: 'block', marginTop: 8 }}>放置格 {CHESS_POSITIONS.find((c) => c.row === placeCell.row && c.col === placeCell.col)?.label}</b>
        <CellRow kind="place" />
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          <button aria-label="执行自动流程" data-dt-gantry-auto={autoRunning ? '1' : '0'} style={{ ...btn, background: autoRunning ? '#1d4ed8' : undefined }}
            onClick={() => (autoRunning ? s.stopAuto() : s.startAuto())}>{autoRunning ? '停止流程' : '吸取并放置'}</button>
          <button aria-label="急停" style={{ ...btn, background: estop ? '#b91c1c' : undefined }}
            onClick={() => s.setEstop(!estop)}>急停 {estop ? 'ON' : 'OFF'}</button>
          <button aria-label="复位" style={btn} onClick={() => s.resetAll()}>复位</button>
        </div>
        <div data-dt-gantry-phase style={{ fontFamily: 'monospace', marginTop: 6 }}>
          阶段 {phase} {PHASE_LABEL[phase]} 吸持 {heldPieceId ?? '无'}
        </div>
      </div>

      <div style={box}>
        <b>棋子状态</b>
        <div data-dt-gantry-pieces style={{ fontFamily: 'monospace', marginTop: 5, lineHeight: 1.7 }}>
          {pieces.map((p) => `${p.name} ${p.label} ${p.held ? '吸取中' : '已放置'} (${p.x.toFixed(0)},${p.y.toFixed(0)})`).join('\n')}
        </div>
      </div>

      <div style={box}>
        <button aria-label="ETHERCAT映射表" style={{ ...btn, width: '100%' }} onClick={() => setShowMap((v) => !v)}>
          ETHERCAT 变量 / 信号映射 {showMap ? '收起' : '展开'}
        </button>
        {showMap && (
          <table data-dt-gantry-ethercat style={{ width: '100%', marginTop: 6, fontSize: 10, borderCollapse: 'collapse' }}>
            <tbody>
              {ETHERCAT_PDO_MAP.map((m) => (
                <tr key={m.pdo}>
                  <td style={{ borderBottom: '1px solid rgba(100,116,139,.3)', padding: '2px 0' }}>{m.pdo}</td>
                  <td style={{ borderBottom: '1px solid rgba(100,116,139,.3)' }}>{m.signal}</td>
                  <td style={{ borderBottom: '1px solid rgba(100,116,139,.3)' }}>{m.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <span data-dt-gantry-cellref style={{ display: 'none' }}>
        {cellToMm(pickCell.row, pickCell.col).x},{cellToMm(pickCell.row, pickCell.col).y}
      </span>
    </div>
  );
}
