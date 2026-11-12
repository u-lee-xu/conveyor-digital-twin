/**
 * 液体混装场景部件层。
 *
 * 所有几何尺寸取自 LIQUID_GEOM / LIQUID_TANKS，不在组件里散落魔法数字；
 * 相邻可见面一律由 GAP / WINDOW_GAP / LIQUID_GAP / CAP_GAP / PIPE_INSET 错开 ≥ GAP，
 * 不使用带 polygonOffset 的薄贴面，杜绝共面闪烁与贴面埋入本体。
 *
 * 真值只从 useLiquidStore 读：液面高度由 liquidLevelHeight(tank, volume) 纯函数派生、
 * 混合色由 liquidMixColor(mixA, mixB) 纯函数派生、读数由 liquidDisplay 纯函数派生，
 * 组件内不另算体积 / 液面 / 配比。
 *
 * 每个罐的局部原点在罐底中心，上层按 LIQUID_TANKS[tank].position 摆放，
 * 因此整机与 1:1 部件展台可复用同一批组件。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  LIQUID_TANKS, LIQUID_GEOM, LIQUID_CAPACITY, LIQUID_PROCESS,
  LIQUID_VIEW_PRESETS,
  liquidLevelHeight, liquidMixColor, liquidDisplay,
  type TankId, type LiquidSensors, type LiquidPartKind,
} from '../../constants/liquidConstants';
import { useLiquidStore } from '../../stores/useLiquidStore';
import { useLiquidViewStore } from '../../stores/useLiquidViewStore';
import { LM, GAP } from '../shared/liquidMaterials';

export type Vec3 = [number, number, number];

const G = LIQUID_GEOM;
const {
  PIPE_R, PIPE_INSET, VALVE_R, PUMP_R, STIR_SHAFT_R, STIR_BLADE_L,
  WINDOW_W, WINDOW_INSET, SCALE_W, TICK_LEN,
  WINDOW_GAP, LIQUID_GAP, CAP_GAP, PLATFORM_Y, PLATFORM_H, LEG_H,
} = G;

/* 全部由几何常量派生，不再出现裸尺寸数字 */
const SURFACE_H = PIPE_INSET;            // 液面圆盘厚度（≥ GAP）
const FLANGE_OUT = PIPE_R;               // 法兰外径增量
const FLANGE_TUBE = PIPE_R * 0.5;        // 法兰环 / 散热筋管半径
const MANHOLE_NECK_H = PIPE_R * 3;       // 人孔颈高
const MANHOLE_X = PUMP_R + PIPE_R;       // 人孔偏心 X：把罐顶中心让给搅拌轴
const BOLT_R = PIPE_R * 0.35;
const TICK_COUNT = 10;                   // 约 10 道刻线
const TICK_H = GAP * 2;                  // 刻线高
const TICK_T = GAP;                      // 刻线厚
const SCALE_T = WINDOW_INSET;            // 刻度板厚

const SENSOR_HIGH: Record<TankId, keyof LiquidSensors> = {
  a: 'aHigh', b: 'bHigh', mix: 'mixHigh', product: 'productHigh',
};
const SENSOR_LOW: Record<TankId, keyof LiquidSensors> = {
  a: 'aLow', b: 'bLow', mix: 'mixLow', product: 'productLow',
};
const LIQUID_MAT: Record<TankId, THREE.MeshStandardMaterial> = {
  a: LM.liquidA, b: LM.liquidB, mix: LM.liquidMix, product: LM.liquidProduct,
};
const SURFACE_MAT: Record<TankId, THREE.MeshStandardMaterial> = {
  a: LM.surfaceA, b: LM.surfaceB, mix: LM.surfaceMix, product: LM.surfaceProduct,
};

/* --------------------------------------------------------------------------
 * ② 液体柱：高度只能由 liquidLevelHeight(tank, volume) 派生，
 *    scale.y + position.y 实现；体积为 0 时柱与液面盘都不可见。
 * ------------------------------------------------------------------------ */
export function LiquidColumn({ tank }: { tank: TankId }) {
  const columnRef = useRef<THREE.Mesh>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const lastMix = useRef('');
  const g = LIQUID_TANKS[tank];
  const liquidR = g.radius - LIQUID_GAP;   // 与玻璃内壁错开 ≥ GAP

  useFrame(() => {
    const s = useLiquidStore.getState();
    const h = liquidLevelHeight(tank, s.volumes[tank]);
    const column = columnRef.current;
    const surface = surfaceRef.current;
    if (!column || !surface) return;
    const visible = h > 0;
    column.visible = visible;
    surface.visible = visible;
    if (!visible) return;
    // 单位高度圆柱 → scale.y = 液面高度；柱底 = LIQUID_GAP
    column.scale.y = h;
    column.position.y = LIQUID_GAP + h / 2;
    const top = LIQUID_GAP + h;
    // 液面圆盘底面 = 柱顶 + CAP_GAP（≥ GAP），与柱顶错开
    surface.position.y = top + CAP_GAP + SURFACE_H / 2;
    // 混合罐颜色由 A/B 组分经官方纯函数派生，不另算配比
    if (tank === 'mix') {
      const c = liquidMixColor(s.mixA, s.mixB);
      if (c !== lastMix.current) {
        lastMix.current = c;
        LM.liquidMix.color.set(c);
        LM.liquidMix.emissive.set(c);
        LM.surfaceMix.color.set(c);
        LM.surfaceMix.emissive.set(c);
      }
    }
  });

  return (
    <group>
      <mesh ref={columnRef} material={LIQUID_MAT[tank]}>
        <cylinderGeometry args={[liquidR, liquidR, 1, 32]} />
      </mesh>
      <mesh ref={surfaceRef} material={SURFACE_MAT[tank]}>
        <cylinderGeometry args={[liquidR, liquidR, SURFACE_H, 32]} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------------
 * ① 半透明玻璃主壳 + 不锈钢上下封头 / 法兰 + 支腿 + 顶部偏心人孔
 * ------------------------------------------------------------------------ */
export function TankShell({ tank }: { tank: TankId }) {
  const g = LIQUID_TANKS[tank];
  const r = g.radius;
  const h = g.height;
  // 支腿两端分别插入罐底封头与机架台面，避免与相邻面精确共面
  const standH = g.baseY - (PLATFORM_Y + PLATFORM_H / 2);
  const legH = standH + 2 * GAP;
  const legY = -standH / 2;
  const legD = (r - PIPE_R) / Math.SQRT2;
  const legs: Vec3[] = [
    [legD, legY, legD], [-legD, legY, legD],
    [legD, legY, -legD], [-legD, legY, -legD],
  ];
  return (
    <group>
      {/* 玻璃主壳：openEnded，能看穿内部彩色液柱 */}
      <mesh position={[0, h / 2, 0]} material={LM.glass}>
        <cylinderGeometry args={[r, r, h, 40, 1, true]} />
      </mesh>
      {/* 罐底碟形封头：顶 y=0，与玻璃壳侧面相接但不共面 */}
      <mesh position={[0, -GAP, 0]} material={LM.steel}>
        <cylinderGeometry args={[r, r, GAP * 2, 32]} />
      </mesh>
      {/* 上下法兰环：内缘与罐壁错开 ≥ GAP，中间通透不挡液面 */}
      <mesh position={[0, CAP_GAP, 0]} rotation={[Math.PI / 2, 0, 0]} material={LM.steel}>
        <torusGeometry args={[r + FLANGE_OUT, FLANGE_TUBE, 10, 40]} />
      </mesh>
      <mesh position={[0, h - CAP_GAP, 0]} rotation={[Math.PI / 2, 0, 0]} material={LM.steel}>
        <torusGeometry args={[r + FLANGE_OUT, FLANGE_TUBE, 10, 40]} />
      </mesh>
      {/* 顶部人孔：偏心布置，把罐顶中心让给搅拌轴 / 电机 */}
      <mesh position={[MANHOLE_X, h + CAP_GAP + MANHOLE_NECK_H / 2, 0]} material={LM.steel}>
        <cylinderGeometry args={[PUMP_R, PUMP_R, MANHOLE_NECK_H, 24]} />
      </mesh>
      <mesh position={[MANHOLE_X, h + CAP_GAP + MANHOLE_NECK_H - GAP, 0]}
        rotation={[Math.PI / 2, 0, 0]} material={LM.cap}>
        <torusGeometry args={[PUMP_R + FLANGE_TUBE + GAP, FLANGE_TUBE, 8, 24]} />
      </mesh>
      {/* 人孔盖螺栓：底面与盖面错开 ≥ GAP */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i}
            position={[
              MANHOLE_X + Math.cos(a) * (PUMP_R - BOLT_R),
              h + CAP_GAP + MANHOLE_NECK_H + 2 * GAP,
              Math.sin(a) * (PUMP_R - BOLT_R),
            ]}
            material={LM.bolt}>
            <cylinderGeometry args={[BOLT_R, BOLT_R, GAP * 2, 8]} />
          </mesh>
        );
      })}
      {/* 四根支腿 */}
      {legs.map((p, i) => (
        <mesh key={i} position={p} material={LM.frame}>
          <cylinderGeometry args={[PIPE_R, PIPE_R, legH, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * ③ 罐壁竖向观察窗：半透明板 + 金属边框，全部与玻璃壳错开 ≥ GAP
 * ------------------------------------------------------------------------ */
export function SightWindow({ tank }: { tank: TankId }) {
  const g = LIQUID_TANKS[tank];
  const r = g.radius;
  const h = g.height;
  const winH = h - 2 * WINDOW_INSET;
  const winZ = r + WINDOW_GAP + GAP;   // 板最近面 = r + WINDOW_GAP ≥ r + GAP
  const frameZ = winZ + GAP;           // 边框再前移 GAP
  return (
    <group>
      <mesh position={[0, h / 2, winZ]} material={LM.window}>
        <boxGeometry args={[WINDOW_W, winH, GAP * 2]} />
      </mesh>
      {/* 左右竖框：位于板外侧，z 与板错开 ≥ GAP */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WINDOW_W / 2 + GAP), h / 2, frameZ]} material={LM.cap}>
          <boxGeometry args={[GAP * 2, winH, GAP * 2]} />
        </mesh>
      ))}
      {/* 上下端盖 */}
      {[WINDOW_INSET, h - WINDOW_INSET].map((y, i) => (
        <mesh key={i} position={[0, y, frameZ]} material={LM.cap}>
          <boxGeometry args={[WINDOW_W + GAP * 4, GAP * 2, GAP * 2]} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * ④ 外置刻度尺：约 10 道刻线，板与刻线错开 ≥ GAP
 * ------------------------------------------------------------------------ */
export function ScaleRule({ tank }: { tank: TankId }) {
  const g = LIQUID_TANKS[tank];
  const r = g.radius;
  const h = g.height;
  const boardH = h - 2 * WINDOW_INSET;
  // 刻度板立在罐右侧，左缘与罐壁错开 ≥ GAP；板面朝 +Z，正面机位可读
  const boardX = r + WINDOW_GAP + GAP + SCALE_W / 2;
  const tickZ = SCALE_T / 2 + GAP + TICK_T / 2;   // 刻线底面 = 板前面 + GAP
  return (
    <group>
      <mesh position={[boardX, h / 2, 0]} material={LM.scale}>
        <boxGeometry args={[SCALE_W, boardH, SCALE_T]} />
      </mesh>
      {Array.from({ length: TICK_COUNT }, (_, i) => {
        const y = WINDOW_INSET + ((i + 0.5) * (h - 2 * WINDOW_INSET)) / TICK_COUNT;
        return (
          <mesh key={i} position={[boardX, y, tickZ]} material={LM.tick}>
            <boxGeometry args={[TICK_LEN, TICK_H, TICK_T]} />
          </mesh>
        );
      })}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * ⑤ 罐顶数字读数牌：drei Html，className 带 dt-viewer-label，
 *    显示去皮后读数 volumes[tank]-tare[tank] 与容量。
 * ------------------------------------------------------------------------ */
export function ReadoutPlate({ tank }: { tank: TankId }) {
  const g = LIQUID_TANKS[tank];
  const display = useLiquidStore((s) => liquidDisplay(tank, s.volumes, s.tare));
  const capacity = LIQUID_CAPACITY[tank];
  return (
    // inline display:block 覆盖观众端竖屏 .dt-viewer-label 的隐藏约定：
    // 教学场景里液位读数是「直观可见」的一部分，任何视口都不隐藏。
    <Html
      position={[0, g.height + CAP_GAP + PIPE_R * 4, 0]}
      center
      zIndexRange={[1, 0]}
      className="dt-viewer-label dt-liquid-readout"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <div className="dt-viewer-label dt-liquid-readout" style={{
        display: 'block',
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        background: 'rgba(15,23,42,.92)',
        color: '#f8fafc',
        border: `1px solid ${g.color}`,
        boxShadow: `0 0 10px ${g.color}66`,
      }}>
        {g.label} · {display.toFixed(1)} / {capacity} L
      </div>
    </Html>
  );
}

/* --------------------------------------------------------------------------
 * 开关量液位传感器：罐侧上部 / 下部，LED 亮绿 / 暗由 sensors 对应布尔驱动
 * ------------------------------------------------------------------------ */
export function LevelSensorPair({ tank }: { tank: TankId }) {
  const g = LIQUID_TANKS[tank];
  const high = useLiquidStore((s) => s.sensors[SENSOR_HIGH[tank]]);
  const low = useLiquidStore((s) => s.sensors[SENSOR_LOW[tank]]);
  const r = g.radius;
  const h = g.height;
  const bodyX = -(r + WINDOW_GAP + GAP);
  const yHigh = h * LIQUID_PROCESS.HIGH_RATIO;
  const yLow = h * LIQUID_PROCESS.LOW_RATIO;
  return (
    <group>
      {([
        { y: yHigh, on: high, id: 'high' },
        { y: yLow, on: low, id: 'low' },
      ] as const).map(({ y, on, id }) => (
        <group key={id} position={[bodyX, y, 0]}>
          {/* 本体横向短圆柱，根部插入罐壁 ≥ GAP */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={LM.motor}>
            <cylinderGeometry args={[PIPE_R, PIPE_R, WINDOW_W, 12]} />
          </mesh>
          <mesh position={[-(WINDOW_W / 2 + GAP + BOLT_R), 0, 0]}
            material={on ? LM.ledOn : LM.ledOff}>
            <sphereGeometry args={[BOLT_R, 12, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 罐体总装：五件液位可视要素 + 开关量传感器，四罐共用同一份实现
 * ------------------------------------------------------------------------ */
export function TankAssembly({ tank }: { tank: TankId }) {
  return (
    <group>
      <TankShell tank={tank} />       {/* ① 半透明玻璃主壳（能看穿） */}
      <LiquidColumn tank={tank} />    {/* ② 高对比不透明彩色液柱 */}
      <SightWindow tank={tank} />     {/* ③ 罐壁竖向观察窗 */}
      <ScaleRule tank={tank} />       {/* ④ 外置刻度尺（约 10 道刻线） */}
      <ReadoutPlate tank={tank} />    {/* ⑤ 罐顶数字读数牌 */}
      <LevelSensorPair tank={tank} /> {/* 上下限开关量液位传感器 */}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 搅拌器：罐顶电机（散热筋 + 接线盒）+ 伸入罐内的轴 + 两片桨叶，
 * 按 agitatorAngle 旋转（正反转由角度符号体现）。
 * ------------------------------------------------------------------------ */
export function Agitator() {
  const g = LIQUID_TANKS.mix;
  const h = g.height;
  const spinRef = useRef<THREE.Group>(null);
  useFrame(() => {
    // 角度直接取真值 store；方向不再另算，正反转由角度符号体现
    if (spinRef.current) spinRef.current.rotation.y = useLiquidStore.getState().agitatorAngle;
  });
  const motorBase = h + CAP_GAP + MANHOLE_NECK_H + GAP;
  const motorH = PUMP_R * 1.6;
  const shaftTop = motorBase;
  const shaftBottom = h * LIQUID_PROCESS.LOW_RATIO;
  const shaftLen = shaftTop - shaftBottom;
  const shaftY = (shaftTop + shaftBottom) / 2;
  const bladeY = shaftBottom + STIR_BLADE_L * 0.25;
  return (
    <group>
      <mesh position={[0, motorBase + motorH / 2, 0]} material={LM.motor} castShadow>
        <cylinderGeometry args={[PUMP_R, PUMP_R, motorH, 24]} />
      </mesh>
      {/* 散热筋：环片内缘与电机侧面错开 ≥ GAP */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, motorBase + ((i + 0.5) * motorH) / 4, 0]}
          rotation={[Math.PI / 2, 0, 0]} material={LM.rib}>
          <torusGeometry args={[PUMP_R + GAP + FLANGE_TUBE, FLANGE_TUBE, 6, 24]} />
        </mesh>
      ))}
      {/* 接线盒放 +Z 侧，避开 -X 传感器与 +X 人孔 */}
      <mesh position={[0, motorBase + motorH / 2, PUMP_R + GAP + PIPE_R]} material={LM.bolt}>
        <boxGeometry args={[PIPE_R * 2, motorH * 0.5, PIPE_R * 2]} />
      </mesh>
      <group ref={spinRef}>
        <mesh position={[0, shaftY, 0]} material={LM.shaft}>
          <cylinderGeometry args={[STIR_SHAFT_R, STIR_SHAFT_R, shaftLen, 16]} />
        </mesh>
        {/* 两片桨叶：分列轴两侧，随旋转组一起转 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * STIR_BLADE_L / 4, bladeY, 0]} material={LM.shaft} castShadow>
            <boxGeometry args={[STIR_BLADE_L / 2, GAP * 4, PIPE_R * 1.2]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 球阀：阀体球 + 两侧短接 + 阀杆 + 手柄；开 / 关由 open 旋转手柄
 * ------------------------------------------------------------------------ */
export function BallValve({ open }: { open: boolean }) {
  return (
    <group>
      <mesh material={LM.valve} castShadow>
        <sphereGeometry args={[VALVE_R, 20, 14]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (VALVE_R + PIPE_INSET), 0, 0]}
          rotation={[0, 0, Math.PI / 2]} material={LM.pipe}>
          <cylinderGeometry args={[PIPE_R, PIPE_R, PIPE_R * 2, 12]} />
        </mesh>
      ))}
      <mesh position={[0, VALVE_R + PIPE_R, 0]} material={LM.cap}>
        <cylinderGeometry args={[PIPE_R * 0.6, PIPE_R * 0.6, PIPE_R * 2, 12]} />
      </mesh>
      {/* 开 → 手柄与管轴平行；关 → 旋转 90° */}
      <group position={[0, VALVE_R + PIPE_R * 2, 0]} rotation={[0, open ? 0 : Math.PI / 2, 0]}>
        <mesh material={LM.handle} castShadow>
          <boxGeometry args={[VALVE_R * 2.4, GAP * 4, PIPE_R * 0.8]} />
        </mesh>
      </group>
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 进料泵：蜗壳 + 端盖 + 进出口 + 电机（散热筋 / 接线盒）+ 底座
 * ------------------------------------------------------------------------ */
export function PumpUnit() {
  const shellX = -PUMP_R * 0.6;
  const motorX = PUMP_R * 1.2;
  const ribR = PUMP_R * 0.7 + GAP;   // 散热筋与电机侧面错开 ≥ GAP
  return (
    <group>
      <mesh position={[shellX, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={LM.valve} castShadow>
        <cylinderGeometry args={[PUMP_R, PUMP_R, PUMP_R * 0.9, 24]} />
      </mesh>
      {/* 端盖：半径略大，沿 X 与蜗壳端面错开 ≥ GAP */}
      <mesh position={[shellX - PUMP_R * 0.45 - GAP, 0, 0]}
        rotation={[0, 0, Math.PI / 2]} material={LM.cap}>
        <cylinderGeometry args={[PUMP_R + FLANGE_TUBE, PUMP_R + FLANGE_TUBE, GAP * 2, 24]} />
      </mesh>
      <mesh position={[PUMP_R * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={LM.pipe}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, PUMP_R, 12]} />
      </mesh>
      <mesh position={[motorX, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={LM.motor} castShadow>
        <cylinderGeometry args={[PUMP_R * 0.7, PUMP_R * 0.7, PUMP_R * 1.6, 20]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[PUMP_R * 0.6 + i * PUMP_R * 0.5, 0, 0]}
          rotation={[0, 0, Math.PI / 2]} material={LM.rib}>
          <cylinderGeometry args={[ribR, ribR, GAP * 3, 20]} />
        </mesh>
      ))}
      <mesh position={[motorX, ribR + GAP + PIPE_R * 0.75, 0]} material={LM.bolt}>
        <boxGeometry args={[PUMP_R * 0.9, PIPE_R * 1.5, PIPE_R * 1.5]} />
      </mesh>
      {/* 底座顶面插入泵体 ≥ GAP，不与泵体共面 */}
      <mesh position={[0, -PUMP_R - GAP * 2, 0]} material={LM.frame}>
        <boxGeometry args={[PUMP_R * 3.4, GAP * 6, PUMP_R * 1.6]} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 管路：相邻点之间用圆柱拼接，拐点用小球接头，避免端面共面 / 留缝
 * ------------------------------------------------------------------------ */
export function PipeRun({ points }: { points: Vec3[] }) {
  const segments = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const out: { mid: Vec3; len: number; quat: THREE.Quaternion }[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = new THREE.Vector3(...points[i]);
      const b = new THREE.Vector3(...points[i + 1]);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len <= 0) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      out.push({ mid: [mid.x, mid.y, mid.z], len, quat });
    }
    return out;
  }, [points]);
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={s.mid} quaternion={s.quat} material={LM.pipe} castShadow>
          <cylinderGeometry args={[PIPE_R, PIPE_R, s.len, 12]} />
        </mesh>
      ))}
      {points.map((p, i) => (
        <mesh key={`joint-${i}`} position={p} material={LM.pipe}>
          <sphereGeometry args={[PIPE_R, 12, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 机架：台面 + 四立柱 + 横撑，尺寸由四罐 LIQUID_TANKS 包围盒派生
 * ------------------------------------------------------------------------ */
export function PlatformFrame() {
  const tanks = [LIQUID_TANKS.a, LIQUID_TANKS.b, LIQUID_TANKS.mix, LIQUID_TANKS.product];
  const minX = Math.min(...tanks.map((t) => t.position[0] - t.radius)) - PIPE_R * 2;
  const maxX = Math.max(...tanks.map((t) => t.position[0] + t.radius)) + PIPE_R * 2;
  const minZ = Math.min(...tanks.map((t) => t.position[2] - t.radius)) - PIPE_R * 2;
  const maxZ = Math.max(...tanks.map((t) => t.position[2] + t.radius)) + PIPE_R * 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const inset = PIPE_R * 2;
  const legs: Vec3[] = [
    [minX + inset, LEG_H / 2, minZ + inset],
    [maxX - inset, LEG_H / 2, minZ + inset],
    [minX + inset, LEG_H / 2, maxZ - inset],
    [maxX - inset, LEG_H / 2, maxZ - inset],
  ];
  return (
    <group>
      <mesh position={[cx, PLATFORM_Y, cz]} material={LM.frame} receiveShadow castShadow>
        <boxGeometry args={[w, PLATFORM_H, d]} />
      </mesh>
      {/* 立柱顶端插入台面 ≥ GAP，不与台面底共面 */}
      {legs.map((p, i) => (
        <mesh key={i} position={p} material={LM.frame} castShadow>
          <cylinderGeometry args={[PIPE_R, PIPE_R, LEG_H, 12]} />
        </mesh>
      ))}
      {[minZ + inset, maxZ - inset].map((z, i) => (
        <mesh key={i} position={[cx, LEG_H * 0.4, z]} rotation={[0, 0, Math.PI / 2]} material={LM.frame}>
          <cylinderGeometry args={[PIPE_R * 0.6, PIPE_R * 0.6, w - inset * 2, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------------
 * 机位阻尼过渡：LIQUID_VIEW_PRESETS 五项用 useThree().controls 做阻尼，
 * 展台用专用近景相机短路；切换不刷新页面、不改设备真值。
 * ------------------------------------------------------------------------ */
interface RigGoal {
  camera: Vec3;
  target: Vec3;
}

/** 展台专用近景相机（1:1 尺度），与整机 LIQUID_VIEW_PRESETS 互不污染 */
const STAGE_CAMERAS: Record<LiquidPartKind, RigGoal> = {
  tank: { camera: [0.60, 0.52, 0.86], target: [0, 0.28, 0] },
  window: { camera: [0.26, 0.40, 0.58], target: [0, 0.28, 0] },
  agitator: { camera: [0.44, 0.80, 0.66], target: [0, 0.42, 0] },
  valve: { camera: [0.26, 0.22, 0.34], target: [0, 0, 0] },
  pump: { camera: [0.34, 0.26, 0.42], target: [0, 0, 0] },
  pipe: { camera: [0.52, 0.44, 0.66], target: [0, 0.14, 0] },
};

export function LiquidCameraRig() {
  const activeView = useLiquidViewStore((s) => s.activeView);
  const activeStage = useLiquidViewStore((s) => s.activeStage);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const goalRef = useRef<RigGoal | null>(null);

  useEffect(() => {
    if (!controls) return;
    // 展台优先短路：整机机位 view 不参与取景，切回整机自动恢复
    if (activeStage) {
      goalRef.current = STAGE_CAMERAS[activeStage];
    } else {
      const v = LIQUID_VIEW_PRESETS[activeView] ?? LIQUID_VIEW_PRESETS.overview;
      goalRef.current = { camera: v.position, target: v.target };
    }
  }, [activeView, activeStage, controls]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-5 * Math.min(dt, 0.05));
    const camGoal = new THREE.Vector3(...goal.camera);
    const targetGoal = new THREE.Vector3(...goal.target);
    camera.position.lerp(camGoal, alpha);
    controls.target.lerp(targetGoal, alpha);
    controls.update();
    // 到位即停，之后用户拖拽 / 缩放不会被拉回
    if (camera.position.distanceTo(camGoal) < 0.003
      && controls.target.distanceTo(targetGoal) < 0.003) {
      goalRef.current = null;
    }
  });

  return null;
}
