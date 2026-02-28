import { useEffect } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';

interface MaterialTableProps {
  position: [number, number, number];
}

export const MaterialTable: React.FC<MaterialTableProps> = ({ position }) => {
  const { scene } = useScene();

  useEffect(() => {
    if (!scene) return;

    const group = new THREE.Group();
    group.position.set(...position);

    // 物料台桌面
    const tableTop = new THREE.Mesh(geometries.tableTop, materials.wood);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    group.add(tableTop);

    // 四条桌腿
    const legPositions = [
      [-0.12, -0.5, -0.12],
      [0.12, -0.5, -0.12],
      [-0.12, -0.5, 0.12],
      [0.12, -0.5, 0.12],
    ];

    legPositions.forEach((pos) => {
      const leg = new THREE.Mesh(geometries.tableLeg, materials.darkMetal);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.castShadow = true;
      group.add(leg);
    });

    scene.add(group);

    return () => {
      scene.remove(group);
    };
  }, [scene, position]);

  return null;
};

export default MaterialTable;
