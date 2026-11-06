import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { type CylinderName } from '../../../types/device';
import {
  CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
  VISUAL, COMPONENT, CYLINDER_DETAIL, SURFACE_GAP,
} from '../constants';
import { getPushPlateWorldZ } from './helpers';

const COLLIDERS_ONLY = false;
const D = CYLINDER_DETAIL;

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

/** 缸体拟真细节：四角拉杆、侧向 T 槽贴片、端盖螺栓（与配药机机架同一套语言） */
function CylinderDetail() {
  const corners: [number, number][] = [
    [-D.TIE_ROD_XZ, -D.TIE_ROD_XZ], [-D.TIE_ROD_XZ, D.TIE_ROD_XZ],
    [D.TIE_ROD_XZ, -D.TIE_ROD_XZ], [D.TIE_ROD_XZ, D.TIE_ROD_XZ],
  ];
  return (
    <group>
      {corners.map(([x, z]) => (
        <mesh key={`rod-${x}-${z}`} position={[x, 0, z]} material={materials.brightSilver}>
          <cylinderGeometry args={[D.TIE_ROD_R, D.TIE_ROD_R, D.TIE_ROD_LEN, 8]} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`slot-${side}`}
          position={[side * (0.09 + SURFACE_GAP), 0, 0]}
          material={materials.profileSlot}
        >
          <boxGeometry args={[D.SLOT_T, 0.6, D.SLOT_W]} />
        </mesh>
      ))}
      {[-1, 1].map((end) => corners.map(([x, z]) => (
        <mesh
          key={`bolt-${end}-${x}-${z}`}
          position={[x, end * (COMPONENT.CYLINDER_BODY_HALF_LEN + 0.04 + SURFACE_GAP), z]}
          material={materials.decal}
        >
          <cylinderGeometry args={[D.BOLT_R, D.BOLT_R, D.BOLT_T, 8]} />
        </mesh>
      )))}
    </group>
  );
}

export function PhysicsCylinder({ name, position }: { name: CylinderName; position: [number, number, number] }) {
  const extended = useDeviceStore((s) => s.cylinders[name].extended);
  const updateCylinderExtension = useDeviceStore((s) => s.updateCylinderExtension);
  const rodRef = useRef<Group>(null);
  const led1Ref = useRef<Mesh>(null);
  const led2Ref = useRef<Mesh>(null);
  const pushPlateRef = useRef<RapierRigidBody>(null);

  const isFeed = name === 'feed';

  const targetExtend = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;
  const targetRetract = CYLINDER_RETRACT_POS;
  const targetValue = extended ? targetExtend : targetRetract;

  // 初始伸出位置：仅挂载时确定；后续由 useFrame 直接更新 three 对象，重渲染不会重置
  const [initialExtension] = useState(isFeed ? (extended ? 0.405 : -0.22) : (extended ? 0.33 : -0.22));
  const currentExtensionRef = useRef(initialExtension);

  // 每实例创建一次 LED 材质（useFrame 中可变修改，不能共享单例），卸载时释放
  const ledMats = useMemo(() => {
    const base = materials.ledInactive;
    return [base.clone(), base.clone()];
  }, []);

  useEffect(() => {
    return () => ledMats.forEach((m) => m.dispose());
  }, [ledMats]);

  /** 磁性开关 LED：亮态绿、灭态暗玻璃（颜色与配药机指示灯同源） */
  const paintLed = (ref: RefObject<Mesh | null>, on: boolean) => {
    if (!ref.current) return;
    const mat = ref.current.material as MeshStandardMaterial;
    if (on) {
      mat.color.set(VISUAL.LAMP_GREEN);
      mat.emissive.set(VISUAL.LAMP_GREEN);
      mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY;
    } else {
      mat.color.set(VISUAL.LAMP_DARK);
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
    }
  };

  useFrame((_, delta) => {
    if (!rodRef.current) return;

    const current = currentExtensionRef.current;
    const diff = targetValue - current;

    let newExt = current;
    if (Math.abs(diff) > COMPONENT.CYLINDER_THRESHOLD) {
      const factor = 1 - Math.pow(1 - COMPONENT.CYLINDER_SMOOTH_FACTOR, delta * 60);
      newExt = current + diff * factor;
    } else if (current !== targetValue) {
      newExt = targetValue;
    } else {
      const atRetract = currentExtensionRef.current <= CYLINDER_RETRACT_POS + 0.04;
      const atExtend = currentExtensionRef.current >= targetExtend - 0.04;
      paintLed(led1Ref, atExtend);
      paintLed(led2Ref, atRetract);
      if (pushPlateRef.current) {
        const pushPlateZ = getPushPlateWorldZ(position[2], currentExtensionRef.current) + COMPONENT.CYLINDER_PUSH_OFFSET;
        pushPlateRef.current.setNextKinematicTranslation({
          x: position[0], y: position[1], z: pushPlateZ,
        });
      }
      return;
    }

    currentExtensionRef.current = newExt;
    rodRef.current.position.y = newExt;
    updateCylinderExtension(name, newExt);

    if (pushPlateRef.current) {
      const pushPlateZ = getPushPlateWorldZ(position[2], newExt) + COMPONENT.CYLINDER_PUSH_OFFSET;
      pushPlateRef.current.setNextKinematicTranslation({
        x: position[0], y: position[1], z: pushPlateZ,
      });
    }

    paintLed(led1Ref, newExt >= targetExtend - 0.04);
    paintLed(led2Ref, newExt <= CYLINDER_RETRACT_POS + 0.04);
  });

  return (
    <>
      <RigidBody ref={pushPlateRef} type="kinematicPosition" colliders={false}>
        <CuboidCollider args={[...COMPONENT.CYLINDER_PUSH_PLATE_HALF]} />
        <DebugBox args={[...COMPONENT.CYLINDER_PUSH_PLATE_HALF]} color="#f97316" opacity={0.4} />
      </RigidBody>
      <group position={position} rotation={[Math.PI / 2, 0, Math.PI]}>
        <group visible={!COLLIDERS_ONLY}>
          <mesh geometry={geometries.cylinderBody} material={materials.cylinderBody} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, -COMPONENT.CYLINDER_BODY_HALF_LEN, 0]} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, COMPONENT.CYLINDER_BODY_HALF_LEN, 0]} />
          <CylinderDetail />

          {/* 黄铜气接头 + 黑色节流调节头 */}
          {[
            { y: COMPONENT.CYLINDER_BODY_HALF_LEN - 0.05, key: 'valve-top' },
            { y: -COMPONENT.CYLINDER_BODY_HALF_LEN + 0.05, key: 'valve-bottom' },
          ].map(({ y, key }) => (
            <group key={key} position={[0.1, y, 0]}>
              <mesh geometry={geometries.valveBody} material={materials.brass} />
              <mesh geometry={geometries.tubeConnector} material={materials.brass} position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
              <mesh geometry={geometries.valveCap} material={materials.darkMetal} position={[0, 0.04, 0]} />
            </group>
          ))}

          {/* 两只磁性开关（伸出位 / 缩回位） */}
          {[
            { y: COMPONENT.CYLINDER_BODY_HALF_LEN - 0.1, ledRef: led1Ref, mat: ledMats[0], key: 'sw-ext' },
            { y: -COMPONENT.CYLINDER_BODY_HALF_LEN + 0.1, ledRef: led2Ref, mat: ledMats[1], key: 'sw-ret' },
          ].map(({ y, ledRef: ref, mat, key }) => (
            <group key={key}>
              <mesh geometry={geometries.magneticSwitch} material={materials.magneticSwitch} position={[0, y, -0.1]}>
                <mesh ref={ref} geometry={geometries.led} material={mat} position={[0, 0.01, -0.03]} />
              </mesh>
            </group>
          ))}

          <group ref={rodRef} position={[0, initialExtension, 0]}>
            <mesh geometry={geometries.cylinderRod} material={materials.cylinderRod} position={[0, COMPONENT.CYLINDER_ROD_LEN / 2, 0]} />
            <mesh geometry={geometries.cylinderPushPlate} material={materials.endCap} position={[0, COMPONENT.CYLINDER_ROD_LEN, 0]} />
            <mesh position={[0, COMPONENT.CYLINDER_ROD_LEN + 0.021, 0]} material={materials.decalDark}>
              <boxGeometry args={[0.19, SURFACE_GAP, 0.17]} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  );
}
