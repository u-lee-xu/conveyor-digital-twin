import { useMemo } from 'react';
import { VISUAL, COMPONENT } from '../constants';

const COLLIDERS_ONLY = false;

export function PhysicsSignalTower({ position, red, green, yellow }: {
  position: [number, number, number];
  red: boolean; green: boolean; yellow: boolean;
}) {
  const startY = COMPONENT.TOWER_BASE_HEIGHT + COMPONENT.TOWER_POLE_HEIGHT;

  const moduleData = useMemo(() => [
    { y: startY + COMPONENT.TOWER_MODULE_HEIGHT / 2, active: red, activeColor: VISUAL.TOWER_RED_ACTIVE, darkColor: VISUAL.TOWER_RED_DARK },
    { y: startY + COMPONENT.TOWER_MODULE_HEIGHT + COMPONENT.TOWER_GAP + COMPONENT.TOWER_MODULE_HEIGHT / 2, active: yellow, activeColor: VISUAL.TOWER_YELLOW_ACTIVE, darkColor: VISUAL.TOWER_YELLOW_DARK },
    { y: startY + (COMPONENT.TOWER_MODULE_HEIGHT + COMPONENT.TOWER_GAP) * 2 + COMPONENT.TOWER_MODULE_HEIGHT / 2, active: green, activeColor: VISUAL.TOWER_GREEN_ACTIVE, darkColor: VISUAL.TOWER_GREEN_DARK },
  ], [startY, red, yellow, green]);

  return (
    <group position={position} visible={!COLLIDERS_ONLY}>
      <mesh position={[0, COMPONENT.TOWER_BASE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[COMPONENT.TOWER_BASE_RADIUS_TOP, COMPONENT.TOWER_BASE_RADIUS_BOTTOM, COMPONENT.TOWER_BASE_HEIGHT, 20]} />
        <meshStandardMaterial color={VISUAL.TOWER_BASE_COLOR} metalness={0.7} roughness={0.3} />
      </mesh>

      <mesh position={[0, COMPONENT.TOWER_BASE_HEIGHT + COMPONENT.TOWER_POLE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[COMPONENT.TOWER_POLE_RADIUS, COMPONENT.TOWER_POLE_RADIUS, COMPONENT.TOWER_POLE_HEIGHT, 12]} />
        <meshStandardMaterial color={VISUAL.TOWER_POLE_COLOR} metalness={0.6} roughness={0.4} />
      </mesh>

      {moduleData.map(({ y, active, activeColor, darkColor }, i) => (
        <group key={i} position={[0, y, 0]}>
          <mesh>
            <cylinderGeometry args={[COMPONENT.TOWER_MODULE_RADIUS, COMPONENT.TOWER_MODULE_RADIUS, COMPONENT.TOWER_MODULE_HEIGHT, 20]} />
            <meshStandardMaterial
              color={active ? activeColor : darkColor}
              emissive={active ? activeColor : 0x000000}
              emissiveIntensity={active ? VISUAL.TOWER_GLOW_EMISSIVE_INTENSITY : 0}
              transparent
              opacity={0.9}
              roughness={0.3}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[0, COMPONENT.TOWER_MODULE_HEIGHT / 2, 0]}>
            <sphereGeometry args={[COMPONENT.TOWER_DOME_RADIUS, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.5]} />
            <meshStandardMaterial
              color={active ? activeColor : darkColor}
              emissive={active ? activeColor : 0x000000}
              emissiveIntensity={active ? VISUAL.TOWER_DOME_EMISSIVE_INTENSITY : 0}
              transparent
              opacity={active ? 1.0 : 0.7}
              roughness={0.1}
              metalness={0}
            />
          </mesh>
          {active && (
            <mesh position={[0, COMPONENT.TOWER_MODULE_HEIGHT / 2 + COMPONENT.TOWER_GLOW_OFFSET, 0]}>
              <sphereGeometry args={[COMPONENT.TOWER_GLOW_RADIUS, 8, 8]} />
              <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={VISUAL.TOWER_GLOW_EMISSIVE_INTENSITY} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
