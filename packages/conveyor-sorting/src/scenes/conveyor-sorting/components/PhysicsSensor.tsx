import { useMemo } from 'react';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { VISUAL, COMPONENT } from '../constants';

const COLLIDERS_ONLY = false;

export function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const sensors = useDeviceStore((s) => s.sensors);
  const active = sensors[name as keyof typeof sensors];

  const labelMaterial = useMemo(() => {
    if (name === 'color') return materials.sensorLabelColor;
    if (name === 'material') return materials.sensorLabelMaterial;
    return materials.sensorLabelFeed;
  }, [name]);

  return (
    <group position={position}>
      <group visible={!COLLIDERS_ONLY}>
        <mesh geometry={geometries.sensorBracket} material={materials.sensorBracket} position={[0, -0.075, 0]} />
        <mesh geometry={geometries.sensor} material={materials.sensor} position={[0, 0.03, 0]} />
        <mesh position={[0, COMPONENT.SENSOR_BULB_OFFSET_Y, COMPONENT.SENSOR_BULB_OFFSET_Z]} scale={[COMPONENT.SENSOR_BULB_SCALE, COMPONENT.SENSOR_BULB_SCALE, COMPONENT.SENSOR_BULB_SCALE]}>
          <sphereGeometry args={[COMPONENT.SENSOR_BULB_RADIUS, 8, 8]} />
          <meshStandardMaterial
            color={active ? VISUAL.SENSOR_ACTIVE_COLOR : VISUAL.SENSOR_INACTIVE_COLOR}
            emissive={active ? VISUAL.SENSOR_ACTIVE_COLOR : 0x000000}
            emissiveIntensity={active ? VISUAL.SENSOR_EMISSIVE_INTENSITY : 0}
          />
        </mesh>
        <mesh geometry={geometries.sensorLabel} material={labelMaterial} position={[0, 0.03, -0.05]} />
      </group>
    </group>
  );
}
