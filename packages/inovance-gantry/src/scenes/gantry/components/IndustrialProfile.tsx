/** 铝挤型材 / 螺栓：所有尺寸取自 MODULE_DETAIL，供模组、台体、支架共用 */
import type { ReactNode } from 'react';
import { M, GAP } from '../../shared/gantryMaterials';
import { MODULE_DETAIL } from '../../../constants/gantryConstants';

const D = MODULE_DETAIL;

/** 沉头安装螺栓 */
export function Bolt({ position, r = 0.004, h = 0.003 }: {
  position: [number, number, number]; r?: number; h?: number;
}) {
  return <mesh position={position} material={M.bolt}><cylinderGeometry args={[r, r, h, 10]} /></mesh>;
}

/** 沿长边等距的一排螺栓 */
export function BoltRow({ length, axis, y, x = 0, z = 0, pitch = D.BOLT_PITCH }: {
  length: number; axis: 'x' | 'z'; y: number; x?: number; z?: number; pitch?: number;
}) {
  const n = Math.max(2, Math.floor(length / pitch));
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => {
        const t = -length / 2 + 0.03 + i * pitch;
        if (t > length / 2 - 0.02) return null;
        const p: [number, number, number] = axis === 'z' ? [x, y, t] : [t, y, z];
        return <Bolt key={`bolt-${i}`} position={p} />;
      })}
    </>
  );
}

/**
 * 铝挤型材：主体 + 四面 T 槽贴面 + 两端端盖 + 顶面螺栓排。
 * 传感器固定支架就夹在这些 T 槽侧面，因此支架不再是悬空的。
 */
export function Profile({ length, section = D.SECTION, axis = 'z', position = [0, 0, 0], bolts = true }: {
  length: number; section?: number; axis?: 'x' | 'z';
  position?: [number, number, number]; bolts?: boolean;
}) {
  const half = section / 2;
  const size: [number, number, number] = axis === 'z'
    ? [section, section, length] : [length, section, section];
  const capSize: [number, number, number] = axis === 'z'
    ? [section + 0.004, section + 0.004, 0.008] : [0.008, section + 0.004, section + 0.004];
  const capAt = (side: number): [number, number, number] => axis === 'z'
    ? [0, 0, side * (length / 2 + 0.004)] : [side * (length / 2 + 0.004), 0, 0];
  const slots: ReactNode[] = [];
  for (const side of [-1, 1]) {
    const along = length - 0.012;
    const topPos: [number, number, number] = axis === 'z'
      ? [side * (half - 0.012), half + GAP, 0] : [0, half + GAP, side * (half - 0.012)];
    slots.push(
      <group key={`slot-${side}`}>
        <mesh position={topPos} material={M.slot}>
          <boxGeometry args={axis === 'z' ? [0.008, 0.0012, along] : [along, 0.0012, 0.008]} />
        </mesh>
        <mesh position={[topPos[0], topPos[1] + GAP, topPos[2]]} material={M.decal}>
          <boxGeometry args={axis === 'z' ? [0.003, 0.0012, along * 0.92] : [along * 0.92, 0.0012, 0.003]} />
        </mesh>
        <mesh position={axis === 'z' ? [side * (half + GAP), 0, 0] : [0, 0, side * (half + GAP)]} material={M.slot}>
          <boxGeometry args={axis === 'z' ? [0.0012, 0.008, along] : [along, 0.008, 0.0012]} />
        </mesh>
      </group>,
    );
  }
  return (
    <group position={position}>
      <mesh castShadow receiveShadow material={M.base}><boxGeometry args={size} /></mesh>
      {slots}
      {[-1, 1].map((s) => (
        <mesh key={`cap-${s}`} position={capAt(s)} material={M.endCap}><boxGeometry args={capSize} /></mesh>
      ))}
      {bolts && <BoltRow length={length} axis={axis} y={half + GAP * 2} x={0} z={0} />}
    </group>
  );
}
