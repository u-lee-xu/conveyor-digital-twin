import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';

interface ConveyorBeltProps {
  running: boolean;
}

export const ConveyorBelt: React.FC<ConveyorBeltProps> = ({ running }) => {
  const { scene } = useScene();
  const groupRef = useRef<THREE.Group | null>(null);
  const rollersRef = useRef<THREE.Mesh[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!scene) return;
    
    const group = new THREE.Group();
    groupRef.current = group;

    const conveyorLength = 3.5;
    const conveyorWidth = 0.6;  // 与滚筒长度匹配
    const conveyorHeight = 1.0;
    const rollerCount = 12;
    const rollerSpacing = (conveyorLength - 0.2) / (rollerCount - 1);

    for (let i = 0; i < rollerCount; i++) {
      const roller = new THREE.Mesh(
        geometries.roller,
        running ? materials.rollerRunning : materials.roller
      );

      roller.position.set(
        -conveyorLength / 2 + 0.1 + i * rollerSpacing,
        conveyorHeight - 0.06,
        0
      );
      roller.rotation.x = Math.PI / 2;
      roller.receiveShadow = true;

      group.add(roller);
      rollersRef.current.push(roller);
    }

    const frontRail = new THREE.Mesh(geometries.rail, materials.darkMetal);
    frontRail.position.set(0, conveyorHeight - 0.06, -conveyorWidth / 2 - 0.04);
    group.add(frontRail);

    const backRail = new THREE.Mesh(geometries.rail, materials.darkMetal);
    backRail.position.set(0, conveyorHeight - 0.06, conveyorWidth / 2 + 0.04);
    group.add(backRail);

    const leftRail = new THREE.Mesh(geometries.sideRail, materials.darkMetal);
    leftRail.position.set(-conveyorLength / 2 - 0.04, conveyorHeight - 0.06, 0);
    group.add(leftRail);

    const rightRail = new THREE.Mesh(geometries.sideRail, materials.darkMetal);
    rightRail.position.set(conveyorLength / 2 + 0.04, conveyorHeight - 0.06, 0);
    group.add(rightRail);

    const legPositions = [
      { x: -conveyorLength / 2 - 0.04, z: -conveyorWidth / 2 - 0.04 },
      { x: -conveyorLength / 2 - 0.04, z: conveyorWidth / 2 + 0.04 },
      { x: conveyorLength / 2 + 0.04, z: -conveyorWidth / 2 - 0.04 },
      { x: conveyorLength / 2 + 0.04, z: conveyorWidth / 2 + 0.04 },
    ];

    legPositions.forEach((pos) => {
      const leg = new THREE.Mesh(geometries.leg, materials.darkMetal);
      leg.position.set(pos.x, conveyorHeight / 2, pos.z);
      leg.receiveShadow = true;
      group.add(leg);
    });

    scene.add(group);

    return () => {
      scene.remove(group);
      rollersRef.current = [];
    };
  }, [scene]);

  useEffect(() => {
    rollersRef.current.forEach((roller) => {
      roller.material = running ? materials.rollerRunning : materials.roller;
    });
  }, [running]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      rollersRef.current.forEach((roller) => {
        roller.rotation.y -= 0.03;
      });
    }, 33);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  return null;
};

export default ConveyorBelt;
