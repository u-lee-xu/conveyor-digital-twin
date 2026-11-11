import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DoubleSide, type Mesh } from 'three';
import { useDeviceStore } from '../../../stores';
import { useVfdStore } from '../../../stores/useVfdStore';
import { geometries, materials } from '../../../components/scene/shared';
import { COMPONENT, PHYSICS, BELT_DETAIL, SURFACE_GAP } from '../constants';

const COLLIDERS_ONLY = false;

const L = COMPONENT.CONVEYOR_LENGTH;
const W = COMPONENT.CONVEYOR_WIDTH;
const ROLLER_Y = COMPONENT.CONVEYOR_HEIGHT - 0.06;
const RAIL_Z = W / 2 + BELT_DETAIL.RAIL_OUT + BELT_DETAIL.RAIL_T / 2;

function DebugBox({ args, color = '#22c55e', opacity = 0.25 }: {
  args: [number, number, number]; color?: string; opacity?: number;
}) {
  if (!COLLIDERS_ONLY) return null;
  return (
    <mesh>
      <boxGeometry args={[args[0] * 2, args[1] * 2, args[2] * 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

/** 铝挤型侧梁：本体 + 外侧两道 T 槽贴片 + 顶部亮银挡边 */
function ProfileRail({ z }: { z: number }) {
  const outerZ = Math.sign(z) * (RAIL_Z + BELT_DETAIL.RAIL_T / 2 + SURFACE_GAP);
  return (
    <group position={[0, ROLLER_Y, z]}>
      <mesh material={materials.base}>
        <boxGeometry args={[L + 2 * BELT_DETAIL.END_PLATE_T, BELT_DETAIL.RAIL_H, BELT_DETAIL.RAIL_T]} />
      </mesh>
      {[-0.026, 0.026].map((dy) => (
        <mesh
          key={dy}
          position={[0, dy, outerZ - z]}
          material={materials.profileSlot}
        >
          <boxGeometry args={[L + 2 * BELT_DETAIL.END_PLATE_T, BELT_DETAIL.SLOT_W, BELT_DETAIL.SLOT_H]} />
        </mesh>
      ))}
      <mesh
        position={[0, BELT_DETAIL.RAIL_H / 2 + BELT_DETAIL.GUIDE_H / 2 - SURFACE_GAP, 0]}
        material={materials.brightSilver}
      >
        <boxGeometry args={[L + 2 * BELT_DETAIL.END_PLATE_T, BELT_DETAIL.GUIDE_H, BELT_DETAIL.GUIDE_T]} />
      </mesh>
    </group>
  );
}

/** 端部封板：两端各一块，四角沉头螺栓用贴面材质避免共面闪烁 */
function EndPlate({ x }: { x: number }) {
  const faceX = x + Math.sign(x) * (BELT_DETAIL.END_PLATE_T / 2 + SURFACE_GAP);
  return (
    <group position={[x, ROLLER_Y, 0]}>
      <mesh material={materials.base}>
        <boxGeometry args={[BELT_DETAIL.END_PLATE_T, BELT_DETAIL.END_PLATE_H, 2 * RAIL_Z + BELT_DETAIL.RAIL_T]} />
      </mesh>
      {[-0.032, 0.032].map((dy) => (
        <mesh key={dy} position={[faceX - x, dy, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.decal}>
          <cylinderGeometry args={[BELT_DETAIL.ROLLER_CAP_R * 0.55, BELT_DETAIL.ROLLER_CAP_R * 0.55, SURFACE_GAP, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** 单根滚筒的两端：端盖 + 外伸轴头，和配药机导轨端盖同一套材质 */
function RollerEnds({ zSign }: { zSign: 1 | -1 }) {
  const z = zSign * (W / 2 + SURFACE_GAP);
  return (
    <group position={[0, 0, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.endCap}>
        <cylinderGeometry args={[BELT_DETAIL.ROLLER_CAP_R, BELT_DETAIL.ROLLER_CAP_R, BELT_DETAIL.ROLLER_CAP_T, 12]} />
      </mesh>
      <mesh position={[0, 0, zSign * (BELT_DETAIL.ROLLER_CAP_T / 2 + 0.012)]} rotation={[Math.PI / 2, 0, 0]} material={materials.axle}>
        <cylinderGeometry args={[BELT_DETAIL.ROLLER_SHAFT_R, BELT_DETAIL.ROLLER_SHAFT_R, 0.03, 10]} />
      </mesh>
    </group>
  );
}

/** 支腿：方型材 + 可调地脚 + 两端横撑（地脚底面略微下探，避免与地面共面） */
function SupportLegs() {
  // 支腿从端部内缩：端部主动滚筒（x=L/2-0.1）与侧装电机悬出一小截，
  // 否则斜视投影会把电机压在支腿上，读成「电机挂在腿上」。
  const xs = [-L / 2 + BELT_DETAIL.LEG_INSET, L / 2 - BELT_DETAIL.LEG_INSET];
  const zs = [-RAIL_Z, RAIL_Z];
  return (
    <group>
      {xs.flatMap((x) => zs.map((z) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, COMPONENT.CONVEYOR_HEIGHT / 2, 0]} material={materials.base}>
            <boxGeometry args={[BELT_DETAIL.LEG_T, COMPONENT.CONVEYOR_HEIGHT, BELT_DETAIL.LEG_T]} />
          </mesh>
          <mesh position={[0, BELT_DETAIL.FOOT_H / 2 - SURFACE_GAP, 0]} material={materials.darkMetal}>
            <cylinderGeometry args={[BELT_DETAIL.FOOT_R, BELT_DETAIL.FOOT_R, BELT_DETAIL.FOOT_H, 16]} />
          </mesh>
          <mesh position={[0, BELT_DETAIL.FOOT_H + SURFACE_GAP, 0]} material={materials.decal}>
            <cylinderGeometry args={[BELT_DETAIL.FOOT_R * 0.72, BELT_DETAIL.FOOT_R * 0.72, SURFACE_GAP, 16]} />
          </mesh>
        </group>
      )))}
      {xs.map((x) => (
        <mesh key={`brace-${x}`} position={[x, 0.28, 0]} material={materials.darkMetal}>
          <boxGeometry args={[BELT_DETAIL.LEG_T, BELT_DETAIL.CROSS_H, 2 * RAIL_Z]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 驱动端减速电机：侧装在 +X 端主动滚筒外侧，轴线沿 Z 与滚筒同轴。
 *
 * 旧版把电机挂在端部封板正中央、轴线沿 X（输送方向），既与滚筒轴垂直、
 * 又没有减速箱或联轴器，等于悬在端头的一根黑棒，物理上驱动不了滚筒。
 * 现在法兰贴侧梁外表面，减速箱输出轴穿过侧梁与最后一根滚筒的轴头同轴，
 * 电机筒体沿 Z 向外伸出，并补顶部接线盒。
 */
function DriveMotor() {
  const M = BELT_DETAIL;
  // 最后一根滚筒即主动滚筒：与它同 X、同 Y
  const driveX = L / 2 - 0.1;
  // 侧梁外表面是安装基准，电机不再悬在端头
  const sideZ = RAIL_Z + M.RAIL_T / 2 + SURFACE_GAP;
  const plateZ = M.MOTOR_PLATE_T / 2 + SURFACE_GAP;
  const gearZ = M.MOTOR_PLATE_T + M.MOTOR_GEARBOX_LEN / 2;
  const motorZ = M.MOTOR_PLATE_T + M.MOTOR_GEARBOX_LEN + M.MOTOR_LEN / 2;
  const endZ = M.MOTOR_PLATE_T + M.MOTOR_GEARBOX_LEN + M.MOTOR_LEN + SURFACE_GAP;
  return (
    <group position={[driveX, ROLLER_Y, sideZ]}>
      {/* 方形安装法兰板贴在侧梁外侧：明确电机是装上去的、不是悬空的 */}
      <mesh position={[0, 0, plateZ]} material={materials.endCap}>
        <boxGeometry args={[M.MOTOR_PLATE_W, M.MOTOR_PLATE_H, M.MOTOR_PLATE_T]} />
      </mesh>
      <mesh position={[0, 0, M.MOTOR_PLATE_T + SURFACE_GAP]} rotation={[Math.PI / 2, 0, 0]} material={materials.decal}>
        <cylinderGeometry args={[M.MOTOR_FLANGE_R, M.MOTOR_FLANGE_R, SURFACE_GAP, 16]} />
      </mesh>
      {/* 减速箱：输出轴穿过侧梁与主动滚筒同轴 */}
      <mesh position={[0, 0, gearZ]} rotation={[Math.PI / 2, 0, 0]} material={materials.endCap}>
        <cylinderGeometry args={[M.MOTOR_GEARBOX_R, M.MOTOR_GEARBOX_R, M.MOTOR_GEARBOX_LEN, 16]} />
      </mesh>
      {/* 电机筒体沿 Z 外伸，与主动滚筒同轴 */}
      <mesh position={[0, 0, motorZ]} rotation={[Math.PI / 2, 0, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[M.MOTOR_R, M.MOTOR_R, M.MOTOR_LEN, 16]} />
      </mesh>
      {[-0.045, 0, 0.045].map((dz) => (
        <mesh key={dz} position={[0, 0, motorZ + dz]} rotation={[Math.PI / 2, 0, 0]} material={materials.decal}>
          <cylinderGeometry args={[M.MOTOR_R * 1.04, M.MOTOR_R * 1.04, M.MOTOR_FIN_T, 16]} />
        </mesh>
      ))}
      {/* 尾端盖中心亮银盘：避免纯黑端面被读成手轮 */}
      <mesh position={[0, 0, endZ]} rotation={[Math.PI / 2, 0, 0]} material={materials.decal}>
        <cylinderGeometry args={[M.MOTOR_ENDCAP_R, M.MOTOR_ENDCAP_R, SURFACE_GAP, 16]} />
      </mesh>
      {/* 顶部接线盒 */}
      <mesh position={[0, M.MOTOR_R + M.MOTOR_BOX_H / 2, motorZ]} material={materials.darkMetal}>
        <boxGeometry args={[M.MOTOR_BOX_W, M.MOTOR_BOX_H, M.MOTOR_BOX_D]} />
      </mesh>
    </group>
  );
}

export function PhysicsConveyorBelt() {
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const rollersRef = useRef<Mesh[]>([]);

  const rollerSpacing = (L - 0.2) / (COMPONENT.ROLLER_COUNT - 1);

  const rollerPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < COMPONENT.ROLLER_COUNT; i++) {
      positions.push([-L / 2 + 0.1 + i * rollerSpacing, ROLLER_Y, 0]);
    }
    return positions;
  }, [rollerSpacing]);

  useFrame(() => {
    if (!conveyorRunning) return;
    rollersRef.current.forEach((roller) => {
      if (roller) roller.rotation.y -= COMPONENT.ROLLER_SPEED * useVfdStore.getState().speedFactor();
    });
  });

  return (
    <group>
      {/* 物理面保持原样：视觉细节只做叠加，不改写碰撞体尺寸 */}
      <RigidBody type="fixed" position={[0, COMPONENT.CONVEYOR_SURFACE_Y - PHYSICS.CONVEYOR_BELT_HALF_Y, 0]} colliders={false}>
        <CuboidCollider args={[L / 2, PHYSICS.CONVEYOR_BELT_HALF_Y, W / 2]} friction={PHYSICS.CONVEYOR_BELT_FRICTION} />
        <DebugBox args={[L / 2, PHYSICS.CONVEYOR_BELT_HALF_Y, W / 2]} />
      </RigidBody>

      <group visible={!COLLIDERS_ONLY}>
        {rollerPositions.map((pos, i) => (
          <group key={`roller-${i}`} position={pos}>
            <mesh
              ref={(el) => { if (el) rollersRef.current[i] = el; }}
              geometry={geometries.roller}
              material={conveyorRunning ? materials.rollerRunning : materials.roller}
              rotation={[Math.PI / 2, 0, 0]}
            />
            <RollerEnds zSign={-1} />
            <RollerEnds zSign={1} />
          </group>
        ))}

        <ProfileRail z={-RAIL_Z} />
        <ProfileRail z={RAIL_Z} />
        <EndPlate x={-L / 2 - BELT_DETAIL.END_PLATE_T / 2} />
        <EndPlate x={L / 2 + BELT_DETAIL.END_PLATE_T / 2} />
        <SupportLegs />
        <DriveMotor />
      </group>
    </group>
  );
}
