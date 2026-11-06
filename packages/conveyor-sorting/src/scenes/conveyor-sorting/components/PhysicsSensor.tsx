import { useMemo } from 'react';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { COMPONENT, SURFACE_GAP } from '../constants';

const COLLIDERS_ONLY = false;

/**
 * 光电传感器：安装支架 + 方形壳体 + 前透镜 + 状态 LED + 类型色标。
 * 颜色统一走 VISUAL（共享工业令牌），灭态是暗玻璃而不是纯黑球。
 */
export function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const active = useDeviceStore((s) => s.sensors[name as keyof typeof s.sensors]);

  const labelMaterial = useMemo(() => {
    if (name === 'color') return materials.sensorLabelColor;
    if (name === 'material') return materials.sensorLabelMaterial;
    return materials.sensorLabelFeed;
  }, [name]);

  return (
    <group position={position}>
      <group visible={!COLLIDERS_ONLY}>
        {/* 支架立杆 + 底部安装板 */}
        <mesh geometry={geometries.sensorBracket} material={materials.sensorBracket} position={[0, -0.075, 0]} />
        <mesh position={[0, -0.15 - SURFACE_GAP, 0]} material={materials.base}>
          <boxGeometry args={[0.07, 0.012, 0.05]} />
        </mesh>
        <mesh position={[0, -0.15 + 0.012 / 2 + SURFACE_GAP, 0]} material={materials.decal}>
          <boxGeometry args={[0.05, SURFACE_GAP, 0.032]} />
        </mesh>

        {/* 传感器壳体：浅灰工业塑料，前脸贴深色透镜环 */}
        <mesh geometry={geometries.sensor} material={materials.sensor} position={[0, 0.03, 0]} />
        <mesh position={[0, 0.03, 0.04 + SURFACE_GAP]} material={materials.decalDark}>
          <boxGeometry args={[0.03, 0.045, SURFACE_GAP]} />
        </mesh>

        {/* 状态 LED：亮绿 / 灭态暗玻璃 */}
        <mesh
          position={[0, COMPONENT.SENSOR_BULB_OFFSET_Y, COMPONENT.SENSOR_BULB_OFFSET_Z]}
          scale={[COMPONENT.SENSOR_BULB_SCALE, COMPONENT.SENSOR_BULB_SCALE, COMPONENT.SENSOR_BULB_SCALE]}
          material={active ? materials.sensorDetected : materials.lampDark}
        >
          <sphereGeometry args={[COMPONENT.SENSOR_BULB_RADIUS, 10, 10]} />
        </mesh>

        {/* 类型色标 + 出线接头 */}
        <mesh geometry={geometries.sensorLabel} material={labelMaterial} position={[0, 0.03, -0.05]} />
        <mesh position={[0, -0.005, -0.045]} rotation={[Math.PI / 2, 0, 0]} material={materials.brass}>
          <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
        </mesh>
        <mesh position={[0.02, 0.03, 0.041 + SURFACE_GAP]} material={materials.decal}>
          <boxGeometry args={[0.008, 0.008, SURFACE_GAP]} />
        </mesh>
      </group>
    </group>
  );
}
