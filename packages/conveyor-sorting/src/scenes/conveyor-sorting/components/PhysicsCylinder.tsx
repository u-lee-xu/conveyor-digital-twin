import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { type CylinderName } from '../../../types/device';
import {
  CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
  VISUAL, COMPONENT,
} from '../constants';
import { getPushPlateWorldZ } from './helpers';

const COLLIDERS_ONLY = false;

function DebugBox({ args, color = 0x00ff00, opacity = 0.25 }: {
  args: [number, number, number]; color?: number; opacity?: number;
}) {
  if (!COLLIDERS_ONLY) return null;
  return (
    <mesh>
      <boxGeometry args={[args[0] * 2, args[1] * 2, args[2] * 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
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
      if (led1Ref.current) {
        const mat = led1Ref.current.material as MeshStandardMaterial;
        if (atExtend) { mat.color.set(VISUAL.LED_ACTIVE_COLOR); mat.emissive.set(VISUAL.LED_ACTIVE_COLOR); mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY; }
        else { mat.color.set(VISUAL.LED_INACTIVE_COLOR); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      if (led2Ref.current) {
        const mat = led2Ref.current.material as MeshStandardMaterial;
        if (atRetract) { mat.color.set(VISUAL.LED_ACTIVE_COLOR); mat.emissive.set(VISUAL.LED_ACTIVE_COLOR); mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY; }
        else { mat.color.set(VISUAL.LED_INACTIVE_COLOR); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
      }
      if (pushPlateRef.current) {
        const pushPlateZ = getPushPlateWorldZ(position[2], currentExtensionRef.current) + COMPONENT.CYLINDER_PUSH_OFFSET;
        pushPlateRef.current.setNextKinematicTranslation({
          x: position[0],
          y: position[1],
          z: pushPlateZ,
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
        x: position[0],
        y: position[1],
        z: pushPlateZ,
      });
    }

    const atRetract = newExt <= CYLINDER_RETRACT_POS + 0.04;
    const atExtend = newExt >= targetExtend - 0.04;
    if (led1Ref.current) {
      const mat = led1Ref.current.material as MeshStandardMaterial;
      if (atExtend) { mat.color.set(VISUAL.LED_ACTIVE_COLOR); mat.emissive.set(VISUAL.LED_ACTIVE_COLOR); mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY; }
      else { mat.color.set(VISUAL.LED_INACTIVE_COLOR); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
    if (led2Ref.current) {
      const mat = led2Ref.current.material as MeshStandardMaterial;
      if (atRetract) { mat.color.set(VISUAL.LED_ACTIVE_COLOR); mat.emissive.set(VISUAL.LED_ACTIVE_COLOR); mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY; }
      else { mat.color.set(VISUAL.LED_INACTIVE_COLOR); mat.emissive.set(0x000000); mat.emissiveIntensity = 0; }
    }
  });

  return (
    <>
      <RigidBody ref={pushPlateRef} type="kinematicPosition" colliders={false}>
        <CuboidCollider args={[...COMPONENT.CYLINDER_PUSH_PLATE_HALF]} />
        <DebugBox args={[...COMPONENT.CYLINDER_PUSH_PLATE_HALF]} color={0xF97316} opacity={0.4} />
      </RigidBody>
      <group position={position} rotation={[Math.PI / 2, 0, Math.PI]}>
        <group visible={!COLLIDERS_ONLY}>
          <mesh geometry={geometries.cylinderBody} material={materials.cylinderBody} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, -COMPONENT.CYLINDER_BODY_HALF_LEN, 0]} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, COMPONENT.CYLINDER_BODY_HALF_LEN, 0]} />

          {[
            { y: COMPONENT.CYLINDER_BODY_HALF_LEN - 0.05, key: 'valve-top' },
            { y: -COMPONENT.CYLINDER_BODY_HALF_LEN + 0.05, key: 'valve-bottom' },
          ].map(({ y, key }) => (
            <group key={key} position={[0.1, y, 0]}>
              <mesh geometry={geometries.valveBody} material={materials.endCap} />
              <mesh geometry={geometries.tubeConnector} material={materials.darkMetal} position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
              <mesh geometry={geometries.valveCap} material={materials.darkMetal} position={[0, 0.04, 0]} />
            </group>
          ))}

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
          </group>
        </group>
      </group>
    </>
  );
}
