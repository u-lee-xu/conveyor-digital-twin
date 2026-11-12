/** 三模式面板共享的只读状态区、变量地址表与格子选择（与配药 StatusPanel / AddressHint 同口径） */
/* eslint-disable react-refresh/only-export-components */
import { useState, type CSSProperties } from 'react';
import { useGantryStore } from '../stores/useGantryStore';
import { GANTRY_AXIS, CHESS_POSITIONS, cellToMm } from '../constants/gantryConstants';
import { ETHERCAT_PDO_MAP, GANTRY_PHASE, GANTRY_ADDRESS_ROWS } from '../constants/gantryVariables';

export const box: CSSProperties = { background: 'rgba(30,41,59,.9)', border: '1px solid rgba(100,116,139,.4)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 };
export const btn: CSSProperties = { padding: '3px 7px', borderRadius: 5, cursor: 'pointer', background: 'rgba(71,85,105,.6)', border: '1px solid rgba(100,116,139,.5)', color: '#e2e8f0', fontSize: 11 };
export const inputStyle: CSSProperties = { width: 62, padding: '2px 5px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4, fontSize: 11 };

export const PHASE_LABEL: Record<number, string> = {
  [GANTRY_PHASE.IDLE]: '待机', [GANTRY_PHASE.MOVE_TO_PICK]: '移向吸取位',
  [GANTRY_PHASE.Z_DOWN_PICK]: '气缸下降', [GANTRY_PHASE.VACUUM_ON]: '吸取',
  [GANTRY_PHASE.Z_UP_PICK]: '抬升', [GANTRY_PHASE.MOVE_TO_PLACE]: '移向放置位',
  [GANTRY_PHASE.Z_DOWN_PLACE]: '下降放置', [GANTRY_PHASE.VACUUM_OFF]: '释放',
  [GANTRY_PHASE.Z_UP_PLACE]: '抬升复位', [GANTRY_PHASE.DONE]: '完成',
};

/** 只读状态区：position、I/O、6 路传感器、棋子、阶段、EtherCAT 映射（折叠） */
export function GantryStatusPanel() {
  const x = useGantryStore((s) => s.x);
  const y = useGantryStore((s) => s.y);
  const z = useGantryStore((s) => s.z);
  const zeroX = useGantryStore((s) => s.zeroX);
  const zeroY = useGantryStore((s) => s.zeroY);
  const cylinder = useGantryStore((s) => s.cylinder);
  const suction = useGantryStore((s) => s.suction);
  const sensors = useGantryStore((s) => s.sensors);
  const pieces = useGantryStore((s) => s.pieces);
  const heldPieceId = useGantryStore((s) => s.heldPieceId);
  const phase = useGantryStore((s) => s.phase);
  const pickCell = useGantryStore((s) => s.pickCell);
  const [showMap, setShowMap] = useState(false);
  return (
    <>
      <div style={box}>
        <b>状态读数</b>
        {/* position 是工件坐标相对读数：机床坐标 - 零点偏置，越过零点即为负值 */}
        <div data-dt-gantry-pos style={{ fontFamily: 'monospace', lineHeight: 1.7, marginTop: 5, whiteSpace: 'nowrap' }}>
          X {(x.position - zeroX).toFixed(1)} / {GANTRY_AXIS.X_TRAVEL} mm Y {(y.position - zeroY).toFixed(1)} / {GANTRY_AXIS.Y_TRAVEL} mm Z {z.toFixed(1)} mm
        </div>
        {/* 机床坐标真值：供 CDP 断言「置零不产生机构位移」，不参与可见 UI */}
        <span data-dt-gantry-machine style={{ display: 'none' }}>
          {x.position.toFixed(1)},{y.position.toFixed(1)}
        </span>
        <div data-dt-gantry-io style={{ fontFamily: 'monospace', marginTop: 4 }}>
          CYL_DOWN {cylinder.extended ? 1 : 0} VACUUM {suction.vacuum ? 1 : 0} HAS_PART {suction.hasPart ? 1 : 0}
        </div>
        <div data-dt-gantry-sensors style={{ fontFamily: 'monospace', marginTop: 4 }}>
          Y 原点 {sensors.origin ? 'ON' : 'OFF'} 负终端 {sensors.endMinus ? 'ON' : 'OFF'} 正终端 {sensors.endPlus ? 'ON' : 'OFF'}
        </div>
        <div data-dt-gantry-sensors-x style={{ fontFamily: 'monospace', marginTop: 3 }}>
          X 原点 {sensors.xOrigin ? 'ON' : 'OFF'} 负终端 {sensors.xEndMinus ? 'ON' : 'OFF'} 正终端 {sensors.xEndPlus ? 'ON' : 'OFF'}
        </div>
        <div data-dt-gantry-phase style={{ fontFamily: 'monospace', marginTop: 4 }}>
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
    </>
  );
}

/** 仿真模式常驻的三协议变量地址表（表头与自动配药 AddressHint 一致） */
export function GantryVariableTable() {
  const [open, setOpen] = useState(true);
  return (
    <div style={box}>
      <button aria-label="变量地址表" style={{ ...btn, width: '100%' }} onClick={() => setOpen((v) => !v)}>
        变量地址表 {open ? '收起' : '展开'}
      </button>
      {open && (
        <table data-dt-gantry-addresses style={{ width: '100%', marginTop: 6, fontSize: 10, borderCollapse: 'collapse', fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ color: '#93c5fd' }}>
              <th style={{ textAlign: 'left', padding: '2px 3px' }}>信号</th>
              <th style={{ textAlign: 'left' }}>三菱 FX</th>
              <th style={{ textAlign: 'left' }}>Modbus TCP</th>
              <th style={{ textAlign: 'left' }}>Siemens S7</th>
            </tr>
          </thead>
          <tbody>
            {GANTRY_ADDRESS_ROWS.map((r) => (
              <tr key={r.signal} title={`${r.pdo} · ${r.direction}`} style={{ color: '#e2e8f0' }}>
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

/** 一键定位：3x3 格，点一下把两轴 target 送到格心 */
export function CellGrid({ onPick }: { onPick: (row: number, col: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 5 }}>
      {CHESS_POSITIONS.map((c) => (
        <button key={c.label} type="button" aria-label={`定位到 ${c.label}`} style={btn} onClick={() => onPick(c.row, c.col)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
