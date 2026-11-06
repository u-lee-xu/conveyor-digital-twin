import { useMemo } from 'react';
import * as THREE from 'three';
import { VISUAL, COMPONENT, SURFACE_GAP } from '../constants';
import { materials } from '../../../components/scene/shared';

const COLLIDERS_ONLY = false;

/**
 * 三色灯塔：与自动配药场景 LightTower 同一套工业造型语言——
 * 底座法兰 + 立杆 + 分层圆柱灯罩 + 层间黑色隔离环 + 顶盖。
 * 旧版的半球灯罩 + 悬浮发光球属于「特效球」，不是实物警示灯，已移除。
 * 灭态用各自色相压暗 0.3 的玻璃质感，而不是纯黑。
 */
export function PhysicsSignalTower({ position, red, green, yellow }: {
  position: [number, number, number];
  red: boolean; green: boolean; yellow: boolean;
}) {
  const startY = COMPONENT.TOWER_BASE_HEIGHT + COMPONENT.TOWER_POLE_HEIGHT;
  const R = COMPONENT.TOWER_MODULE_RADIUS;
  const H = COMPONENT.TOWER_MODULE_HEIGHT;
  const STEP = H + COMPONENT.TOWER_GAP;

  const offColors = useMemo(() => ({
    red: new THREE.Color(VISUAL.LAMP_RED).multiplyScalar(0.3),
    yellow: new THREE.Color(VISUAL.LAMP_YELLOW).multiplyScalar(0.3),
    green: new THREE.Color(VISUAL.LAMP_GREEN).multiplyScalar(0.3),
  }), []);

  const modules = [
    { key: 'red' as const, y: startY + H / 2, active: red, color: VISUAL.LAMP_RED },
    { key: 'yellow' as const, y: startY + STEP + H / 2, active: yellow, color: VISUAL.LAMP_YELLOW },
    { key: 'green' as const, y: startY + STEP * 2 + H / 2, active: green, color: VISUAL.LAMP_GREEN },
  ];

  return (
    <group position={position} visible={!COLLIDERS_ONLY}>
      {/* 底座法兰 */}
      <mesh position={[0, COMPONENT.TOWER_BASE_HEIGHT / 2, 0]} material={materials.darkMetal}>
        <cylinderGeometry
          args={[COMPONENT.TOWER_BASE_RADIUS_TOP, COMPONENT.TOWER_BASE_RADIUS_BOTTOM, COMPONENT.TOWER_BASE_HEIGHT, 20]}
        />
      </mesh>
      <mesh position={[0, COMPONENT.TOWER_BASE_HEIGHT + SURFACE_GAP, 0]} material={materials.decal}>
        <cylinderGeometry args={[COMPONENT.TOWER_BASE_RADIUS_TOP * 0.92, COMPONENT.TOWER_BASE_RADIUS_TOP * 0.92, SURFACE_GAP, 20]} />
      </mesh>

      {/* 立杆 */}
      <mesh position={[0, COMPONENT.TOWER_BASE_HEIGHT + COMPONENT.TOWER_POLE_HEIGHT / 2, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[COMPONENT.TOWER_POLE_RADIUS, COMPONENT.TOWER_POLE_RADIUS, COMPONENT.TOWER_POLE_HEIGHT, 12]} />
      </mesh>

      {/* 灯座 */}
      <mesh position={[0, startY - 0.008, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[R * 0.92, R * 0.92, 0.016, 20]} />
      </mesh>

      {modules.map((m) => (
        <group key={m.key} position={[0, m.y, 0]}>
          <mesh>
            <cylinderGeometry args={[R, R, H, 20]} />
            <meshStandardMaterial
              color={m.active ? m.color : offColors[m.key]}
              emissive={m.active ? m.color : '#000000'}
              emissiveIntensity={m.active ? VISUAL.LAMP_EMISSIVE : 0}
              roughness={0.25}
              metalness={0.1}
            />
          </mesh>
          {/* 层间隔离环：略大于灯罩，压住相邻两层的接缝 */}
          <mesh position={[0, -H / 2 - COMPONENT.TOWER_GAP / 2, 0]} material={materials.darkMetal}>
            <cylinderGeometry args={[R * 1.04, R * 1.04, COMPONENT.TOWER_GAP + SURFACE_GAP, 20]} />
          </mesh>
        </group>
      ))}

      {/* 顶盖 */}
      <mesh position={[0, startY + STEP * 2 + H / 2 + H / 2 + SURFACE_GAP, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[R * 0.92, R, 0.012, 20]} />
      </mesh>
    </group>
  );
}
