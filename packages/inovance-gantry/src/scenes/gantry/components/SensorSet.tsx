/**
 * 轴上接近开关总成（参照配药 MachineFrame.tsx 的 LimitSensor，但补齐两点）：
 *   1) 开关通过 L 形固定支架夹在模组型材的 T 槽侧面，不再悬浮在空中；
 *   2) 金属挡片（感应片）固定在移动滑块上，随滑块移动，经过开关时才触发。
 *
 * 每轴 3 个：两个终端限位在两端，原点在原点方向限位的内侧；3 个都在同一侧，
 * 一片挡片即可依次扫过。尺寸全部取自 SENSOR_DETAIL / MODULE_DETAIL。
 */
import { M, GAP } from '../../shared/gantryMaterials';
import {
  SENSOR_DETAIL as S, MODULE_DETAIL as D, GANTRY_SENSOR, toViewM,
} from '../../../constants/gantryConstants';
import { Bolt } from './IndustrialProfile';

export type SensorKind = 'origin' | 'endMinus' | 'endPlus';
export type RailAxis = 'x' | 'z';

/** 垂直长边方向的坐标：axis='z' 时是 X，axis='x' 时是 Z */
function perp(axis: RailAxis, side: number, v: number): [number, number, number] {
  return axis === 'z' ? [side * v, 0, 0] : [0, 0, side * v];
}

/** 单个接近开关 + 固定支架 */
export function LimitSensor({ kind, along, axis, side, on, mountY }: {
  kind: SensorKind;
  along: number;             // 沿模组长边的世界坐标（米）
  axis: RailAxis;
  side: 1 | -1;
  on: boolean;
  mountY: number;            // 模组中心高度
}) {
  const led = on ? (kind === 'origin' ? M.ledOrigin : M.ledEnd) : M.ledOff;
  const pos: [number, number, number] = axis === 'z'
    ? [0, mountY, along] : [along, mountY, 0];
  const armMid = (D.HALF + S.MOUNT_SIDE) / 2;
  const armLen = S.MOUNT_SIDE - D.HALF;
  const switchAt = perp(axis, side, S.MOUNT_SIDE);
  const armAt = perp(axis, side, armMid);
  return (
    <group position={pos} userData={{ sensor: kind }}>
      {/* 固定支架：水平臂从型材 T 槽侧面伸出，末端竖直吊板托住开关 */}
      <mesh position={[armAt[0], 0.014, armAt[2]]} material={M.dark}>
        <boxGeometry args={axis === 'z'
          ? [armLen, S.BRACKET_T, S.BRACKET_W]
          : [S.BRACKET_W, S.BRACKET_T, armLen]} />
      </mesh>
      <mesh position={[switchAt[0], 0.014 - S.BRACKET_RISE / 2, switchAt[2]]} material={M.dark}>
        <boxGeometry args={axis === 'z'
          ? [S.BRACKET_W, S.BRACKET_RISE, S.BRACKET_T]
          : [S.BRACKET_T, S.BRACKET_RISE, S.BRACKET_W]} />
      </mesh>
      {/* 夹在型材侧面的固定螺栓：让支架有明确锚点 */}
      <Bolt position={[perp(axis, side, D.HALF)[0], 0.018, perp(axis, side, D.HALF)[2]]} r={0.0035} h={0.004} />
      {/* 开关本体 + 感应面贴片 + LED */}
      <mesh position={[switchAt[0], -0.01, switchAt[2]]} castShadow material={M.sleeve}>
        <boxGeometry args={[S.BODY_W, S.BODY_H, S.BODY_D]} />
      </mesh>
      <mesh position={[switchAt[0], -0.01 + S.BODY_H / 2 + GAP, switchAt[2]]} material={M.decal}>
        <boxGeometry args={[S.BODY_W * 0.8, 0.002, S.BODY_D * 0.8]} />
      </mesh>
      <mesh position={[switchAt[0], -0.01, switchAt[2] + S.BODY_D / 2 + GAP]} material={led}>
        <sphereGeometry args={[S.LED_R, 12, 12]} />
      </mesh>
    </group>
  );
}

/**
 * 金属挡片：放在移动滑块组内（不放在模组上），随滑块一起移动。
 * 一片薄亮银板经 L 形伸出臂伸到开关感应面前，滑块到位时正好遮住探头。
 */
export function SensorFlag({ axis, side, mountY = 0 }: {
  axis: RailAxis; side: 1 | -1; mountY?: number;
}) {
  const armMid = (D.HALF + S.MOUNT_SIDE) / 2;
  const armLen = S.MOUNT_SIDE - D.HALF;
  const flagAt = perp(axis, side, S.MOUNT_SIDE);
  const armAt = perp(axis, side, armMid);
  return (
    <group position={[0, mountY, 0]} userData={{ part: 'sensor-flag' }}>
      <mesh position={[armAt[0], 0, armAt[2]]} material={M.dark}>
        <boxGeometry args={axis === 'z'
          ? [armLen + S.FLAG_ARM, 0.006, 0.012]
          : [0.012, 0.006, armLen + S.FLAG_ARM]} />
      </mesh>
      <mesh position={[flagAt[0], -0.01, flagAt[2]]} castShadow material={M.silver}>
        <boxGeometry args={axis === 'z'
          ? [S.FLAG_T, S.FLAG_H, S.FLAG_W]
          : [S.FLAG_W, S.FLAG_H, S.FLAG_T]} />
      </mesh>
      <Bolt position={[0, 0.006, 0]} r={0.003} h={0.003} />
    </group>
  );
}

/** 一轴 3 个固定开关：两个终端在两端，原点在原点侧限位内侧 */
export function AxisSensorSet({ axis, mountY, side, states }: {
  axis: RailAxis; mountY: number; side: 1 | -1;
  states: { origin: boolean; endMinus: boolean; endPlus: boolean };
}) {
  const s = GANTRY_SENSOR;
  const isY = axis === 'z';
  const specs: { kind: SensorKind; mm: number; on: boolean }[] = isY
    ? [
      { kind: 'endMinus', mm: s.Y_END_MINUS_MM, on: states.endMinus },
      { kind: 'origin', mm: s.Y_ORIGIN_MM, on: states.origin },
      { kind: 'endPlus', mm: s.Y_END_PLUS_MM, on: states.endPlus },
    ]
    : [
      { kind: 'endMinus', mm: s.X_END_MINUS_MM, on: states.endMinus },
      { kind: 'origin', mm: s.X_ORIGIN_MM, on: states.origin },
      { kind: 'endPlus', mm: s.X_END_PLUS_MM, on: states.endPlus },
    ];
  return (
    <>
      {specs.map((p) => (
        <LimitSensor key={`${axis}-${p.kind}`} kind={p.kind} along={toViewM(p.mm)}
          axis={axis} side={side} on={p.on} mountY={mountY} />
      ))}
    </>
  );
}
