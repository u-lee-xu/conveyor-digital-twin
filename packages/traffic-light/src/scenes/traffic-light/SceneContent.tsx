import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { Ground } from '@digital-twin/shared';
import { SceneContainer } from './components/SceneContainer';
import { PhysicsLabel } from './components/PhysicsLabel';
import { TrafficCars } from './components/TrafficCars';
import {
  ROAD_HALF_WIDTH, INTERSECTION_HALF, ROAD_LENGTH,
  POLE_CORNERS, POLE_HEIGHT, ARM_LENGTH, ARM_OFFSET,
  HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, HEAD_ROUND_RADIUS,
  LENS_RADIUS, LENS_THICKNESS, LENS_SPACING, BEZEL_RADIUS, BEZEL_TUBE,
  HOOD_RADIUS_FRONT, HOOD_RADIUS_BACK, HOOD_DEPTH, HEAD_HANG_DEPTH, HEAD_SCALE,
  LAMP_COLORS, LAMP_EMISSIVE_ON, LAMP_EMISSIVE_OFF,
  HEAD_COLOR, HOOD_COLOR, LENS_OFF_COLOR,
} from './constants';
import { useTrafficStore, type LampKey } from './useTrafficStore';

/**
 * 交通灯 3D 场景
 * - 十字路口：东西/南北两条道路 + 车道虚线 + 停止线 + 斑马线
 * - 四根灯杆立柱在路口四角，横臂垂直道路挂向路口内（逆时针：东南向北 / 西南向东 /
 *   西北向南 / 东北向西），灯头悬于横臂端（道路宽度的 1/3 处）
 * - 灯面朝向本车道来车方向：由西向东的车看东南角灯（灯面朝西）、由东向西看西北角灯
 *   （灯面朝东）、由南向北看东北角灯（灯面朝南）、由北向南看西南角灯（灯面朝北）
 * - 12 盏灯 = 6 路输出 × 2 盏：东西信号 → 东南/西北灯杆；南北信号 → 西南/东北灯杆
 * - 灯镜点亮使用自发光材质（真孪生效果，区别于触摸屏圆点）
 */

/** 灯杆定义：角点位置 + 信号方向 + 横臂方向（armDir，挂向路口内）+ 灯面朝向（facing，朝本车道来车） */
const POLE_DEFS: { corner: [number, number]; direction: 'ew' | 'ns'; armDir: number; facing: number }[] = [
  { corner: POLE_CORNERS[0], direction: 'ew', armDir: Math.PI, facing: -Math.PI / 2 },   // 东南：横臂向北，灯面朝西（由西向东车道）
  { corner: POLE_CORNERS[1], direction: 'ns', armDir: Math.PI / 2, facing: Math.PI },    // 西南：横臂向东，灯面朝北（由北向南车道）
  { corner: POLE_CORNERS[2], direction: 'ew', armDir: 0, facing: Math.PI / 2 },          // 西北：横臂向南，灯面朝东（由东向西车道）
  { corner: POLE_CORNERS[3], direction: 'ns', armDir: -Math.PI / 2, facing: 0 },         // 东北：横臂向西，灯面朝南（由南向北车道）
];

/** 单个灯镜（圆镜 + 嵌槽环 + 遮阳罩，正面朝 +Z） */
function Lens({ lampKey, color }: { lampKey: LampKey; color: string }) {
  const on = useTrafficStore((s) => s.lamps[lampKey]);
  // 灯镜略微嵌入灯壳（背面低于壳面），避免共面闪烁
  const lensZ = HEAD_DEPTH / 2 - 0.005 + LENS_THICKNESS / 2;
  return (
    <group>
      {/* 灯镜 */}
      <mesh position={[0, 0, lensZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[LENS_RADIUS, LENS_RADIUS, LENS_THICKNESS, 32]} />
        <meshStandardMaterial
          color={on ? color : LENS_OFF_COLOR}
          emissive={color}
          emissiveIntensity={on ? LAMP_EMISSIVE_ON : LAMP_EMISSIVE_OFF}
          roughness={0.3}
        />
      </mesh>
      {/* 嵌槽环（灯镜与灯壳之间的黑色压圈） */}
      <mesh position={[0, 0, HEAD_DEPTH / 2 + BEZEL_TUBE / 2]} rotation={[0, 0, 0]}>
        <torusGeometry args={[BEZEL_RADIUS, BEZEL_TUBE, 8, 40]} />
        <meshStandardMaterial color={HOOD_COLOR} roughness={0.7} />
      </mesh>
      {/* 遮阳罩（外张圆台，前端敞口） */}
      <mesh position={[0, 0, lensZ + HOOD_DEPTH / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[HOOD_RADIUS_FRONT, HOOD_RADIUS_BACK, HOOD_DEPTH, 32, 1, true]} />
        <meshStandardMaterial color={HOOD_COLOR} roughness={0.8} side={2} />
      </mesh>
    </group>
  );
}

/** 信号灯头（灯壳 + 红黄绿三灯镜，竖直排列，正面朝 +Z） */
function LampHead({ lampKeys }: { lampKeys: { red: LampKey; yellow: LampKey; green: LampKey } }) {
  const lenses: { key: LampKey; color: string; y: number }[] = [
    { key: lampKeys.red, color: LAMP_COLORS.red, y: LENS_SPACING },
    { key: lampKeys.yellow, color: LAMP_COLORS.yellow, y: 0 },
    { key: lampKeys.green, color: LAMP_COLORS.green, y: -LENS_SPACING },
  ];

  return (
    <group>
      {/* 灯壳 */}
      <RoundedBox
        args={[HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH]}
        radius={HEAD_ROUND_RADIUS}
        smoothness={4}
        position={[0, 0, 0]}
      >
        <meshStandardMaterial color={HEAD_COLOR} roughness={0.5} metalness={0.15} />
      </RoundedBox>
      {/* 三灯镜 */}
      {lenses.map((l) => (
        <group key={l.key} position={[0, l.y, 0]}>
          <Lens lampKey={l.key} color={l.color} />
        </group>
      ))}
    </group>
  );
}

function TrafficPole({ corner, direction, armDir, facing }: { corner: [number, number]; direction: 'ew' | 'ns'; armDir: number; facing: number }) {
  const [x, z] = corner;

  const lampKeys = direction === 'ew'
    ? { red: 'ew_red' as LampKey, yellow: 'ew_yellow' as LampKey, green: 'ew_green' as LampKey }
    : { red: 'ns_red' as LampKey, yellow: 'ns_yellow' as LampKey, green: 'ns_green' as LampKey };

  // 横臂端（灯头悬挂点）：本地 +z 绕 Y 旋转 armDir 后指向世界 (sin, 0, cos)
  const armEndX = x + Math.sin(armDir) * ARM_LENGTH;
  const armEndZ = z + Math.cos(armDir) * ARM_LENGTH;
  // 灯头中心高度：整体缩放后吊架顶部仍顶住横臂（横臂高度 = POLE_HEIGHT - ARM_OFFSET）
  const hangY = POLE_HEIGHT - ARM_OFFSET - HEAD_SCALE * (HEAD_HANG_DEPTH + HEAD_HEIGHT / 2);

  return (
    <group position={[x, 0, z]}>
      {/* 底座 */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.24, 0.06, 0.24]} />
        <meshStandardMaterial color="#3a4756" roughness={0.6} />
      </mesh>
      {/* 灯杆 */}
      <mesh position={[0, POLE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.04, POLE_HEIGHT, 16]} />
        <meshStandardMaterial color="#4a5868" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 横臂（垂直道路挂向路口内，沿 armDir 方向） */}
      <group position={[0, POLE_HEIGHT - ARM_OFFSET, 0]} rotation={[0, armDir, 0]}>
        <mesh position={[0, 0, ARM_LENGTH / 2]}>
          <boxGeometry args={[0.03, 0.03, ARM_LENGTH]} />
          <meshStandardMaterial color="#4a5868" roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
      {/* 吊架 + 灯头（悬于横臂端下方，灯面朝 facing = 本车道来车方向；灯头整体等比缩放） */}
      <group position={[armEndX - x, hangY, armEndZ - z]} rotation={[0, facing, 0]} scale={HEAD_SCALE}>
        {/* 吊架（顶在灯壳顶面，悬挂于横臂端） */}
        <mesh position={[0, HEAD_HEIGHT / 2 + HEAD_HANG_DEPTH / 2, 0]}>
          <boxGeometry args={[0.08, HEAD_HANG_DEPTH, 0.05]} />
          <meshStandardMaterial color="#3a4756" roughness={0.5} metalness={0.3} />
        </mesh>
        <LampHead lampKeys={lampKeys} />
      </group>
    </group>
  );
}

/** 车道中心虚线 */
function DashedLine({ axis, start, end, offset }: { axis: 'x' | 'z'; start: number; end: number; offset: number }) {
  const dashes = useMemo(() => {
    const arr: { at: number }[] = [];
    for (let v = start; v <= end; v += 0.45) arr.push({ at: v });
    return arr;
  }, [start, end]);
  return (
    <group>
      {dashes.map((d, i) => (
        <mesh key={i} position={axis === 'x' ? [d.at, 0.036, offset] : [offset, 0.036, d.at]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={axis === 'x' ? [0.2, 0.04] : [0.04, 0.2]} />
          <meshBasicMaterial color="#9aa7b4" />
        </mesh>
      ))}
    </group>
  );
}

/** 斑马线（路口四个入口：条纹沿道路走向排列、横贯路面宽度，形成斑马纹） */
function Crosswalk({ x, z, axis }: { x: number; z: number; axis: 'x' | 'z' }) {
  const span = (ROAD_HALF_WIDTH - 0.2) * 2;
  const offsets = useMemo(() => {
    const arr: number[] = [];
    for (let v = -0.5; v <= 0.5; v += 0.25) arr.push(v);
    return arr;
  }, []);
  return (
    <group>
      {offsets.map((o, i) => (
        <mesh
          key={i}
          position={axis === 'x' ? [x + o, 0.036, z] : [x, 0.036, z + o]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={axis === 'x' ? [0.14, span] : [span, 0.14]} />
          <meshBasicMaterial color="#8d9aa8" />
        </mesh>
      ))}
    </group>
  );
}

/** 停止线（横贯整条道路宽，axis 控制横贯方向） */
function StopLine({ x, z, axis }: { x: number; z: number; axis: 'x' | 'z' }) {
  const span = (ROAD_HALF_WIDTH - 0.15) * 2;
  return (
    <mesh position={[x, 0.036, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={axis === 'x' ? [0.07, span] : [span, 0.07]} />
      <meshBasicMaterial color="#9aa7b4" />
    </mesh>
  );
}

export function TrafficSceneContent() {
  const halfRoad = ROAD_LENGTH / 2;
  return (
    <SceneContainer>
      {/* 地面（统一样式） */}
      <Ground />

      {/* 东西道路 */}
      <mesh position={[0, 0.012, 0]} receiveShadow>
        <boxGeometry args={[ROAD_LENGTH, 0.03, ROAD_HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#465468" roughness={0.85} />
      </mesh>
      {/* 南北道路 */}
      <mesh position={[0, 0.016, 0]} receiveShadow>
        <boxGeometry args={[ROAD_HALF_WIDTH * 2, 0.03, ROAD_LENGTH]} />
        <meshStandardMaterial color="#465468" roughness={0.85} />
      </mesh>

      {/* 车道中心虚线 */}
      <DashedLine axis="x" start={-halfRoad} end={-INTERSECTION_HALF - 0.4} offset={0} />
      <DashedLine axis="x" start={INTERSECTION_HALF + 0.4} end={halfRoad} offset={0} />
      <DashedLine axis="z" start={-halfRoad} end={-INTERSECTION_HALF - 0.4} offset={0} />
      <DashedLine axis="z" start={INTERSECTION_HALF + 0.4} end={halfRoad} offset={0} />

      {/* 斑马线（四个入口，紧贴路口边缘外侧） */}
      <Crosswalk x={INTERSECTION_HALF + 0.8} z={0} axis="x" />
      <Crosswalk x={-INTERSECTION_HALF - 0.8} z={0} axis="x" />
      <Crosswalk x={0} z={INTERSECTION_HALF + 0.8} axis="z" />
      <Crosswalk x={0} z={-INTERSECTION_HALF - 0.8} axis="z" />

      {/* 停止线（灯杆连线位置：西北-西南角连线 / 东北-东南角连线） */}
      <StopLine x={INTERSECTION_HALF + 0.05} z={0} axis="x" />
      <StopLine x={-INTERSECTION_HALF - 0.05} z={0} axis="x" />
      <StopLine x={0} z={INTERSECTION_HALF + 0.05} axis="z" />
      <StopLine x={0} z={-INTERSECTION_HALF - 0.05} axis="z" />

      {/* 四根灯杆 */}
      {POLE_DEFS.map((def) => (
        <TrafficPole
          key={`${def.corner[0]}_${def.corner[1]}`}
          corner={def.corner}
          direction={def.direction}
          armDir={def.armDir}
          facing={def.facing}
        />
      ))}

      {/* 车辆（红灯停、绿灯行，靠右行驶，出画面回收） */}
      <TrafficCars />

      {/* 方向标签 */}
      <PhysicsLabel text="东" position={[3.1, 0.2, -1.0]} offset={[0, 0, 0]} color="yellow" />
      <PhysicsLabel text="西" position={[-3.1, 0.2, -1.0]} offset={[0, 0, 0]} color="yellow" />
      <PhysicsLabel text="南" position={[-1.0, 0.2, 3.1]} offset={[0, 0, 0]} color="yellow" />
      <PhysicsLabel text="北" position={[-1.0, 0.2, -3.1]} offset={[0, 0, 0]} color="yellow" />

      {/* 场景标签 */}
      <PhysicsLabel text="东西方向信号灯" position={[1.55, 2.15, 1.55]} offset={[0, 0, 0]} color="blue" />
      <PhysicsLabel text="南北方向信号灯" position={[-1.55, 2.15, -1.55]} offset={[0, 0, 0]} color="blue" />
    </SceneContainer>
  );
}

export default TrafficSceneContent;
