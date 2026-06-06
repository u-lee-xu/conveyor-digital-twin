import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
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

export function PhysicsCylinder({ name, position }: { name: string; position: [number, number, number] }) {
  const cylinders = useDeviceStore((s) => s.cylinders);
  const cylinder = cylinders[name as keyof typeof cylinders];
  const updateCylinderExtension = useDeviceStore((s) => s.updateCylinderExtension);
  const rodRef = useRef<Group>(null);
  const led1Ref = useRef<Mesh>(null);
  const led2Ref = useRef<Mesh>(null);
  const pushPlateRef = useRef<RapierRigidBody>(null);

  const isFeed = name === 'feed';

  const targetExtend = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;
  const targetRetract = CYLINDER_RETRACT_POS;
  const targetValue = cylinder.extended ? targetExtend : targetRetract;

  const currentExtensionRef = useRef(isFeed ? (cylinder.extended ? 0.405 : -0.22) : (cylinder.extended ? 0.33 : -0.22));

  useFrame(() => {
    if (!rodRef.current) return;

    const current = currentExtensionRef.current;
    const diff = targetValue - current;

    let newExt = current;
    if (Math.abs(diff) > COMPONENT.CYLINDER_THRESHOLD) {
      newExt = current + diff * COMPONENT.CYLINDER_SMOOTH_FACTOR;
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
    updateCylinderExtension(name as any, newExt);

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
            { y: COMPONENT.CYLINDER_BODY_HALF_LEN - 0.1, ledRef: led1Ref, key: 'sw-ext' },
            { y: -COMPONENT.CYLINDER_BODY_HALF_LEN + 0.1, ledRef: led2Ref, key: 'sw-ret' },
          ].map(({ y, ledRef: ref, key }) => (
            <group key={key}>
              <mesh geometry={geometries.magneticSwitch} material={materials.magneticSwitch} position={[0, y, -0.1]}>
                <mesh ref={ref} geometry={geometries.led} material={materials.ledInactive.clone()} position={[0, 0.01, -0.03]} />
              </mesh>
            </group>
          ))}

          <group ref={rodRef} position={[0, currentExtensionRef.current, 0]}>
            <mesh geometry={geometries.cylinderRod} material={materials.cylinderRod} position={[0, COMPONENT.CYLINDER_ROD_LEN / 2, 0]} />
            <mesh geometry={geometries.cylinderPushPlate} material={materials.endCap} position={[0, COMPONENT.CYLINDER_ROD_LEN, 0]} />
          </group>
        </group>
      </group>
    </>
  );
}
