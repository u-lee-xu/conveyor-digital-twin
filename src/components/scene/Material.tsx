import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';

interface MaterialProps {
  position: [number, number, number];
  color: 'blue' | 'black';
  visible: boolean;
}

export const Material: React.FC<MaterialProps> = ({ position, color, visible }) => {
  const { scene } = useScene();
  const meshRef = useRef<THREE.Mesh | null>(null);

  // 首次挂载时创建 mesh（只创建一次）
  useEffect(() => {
    if (!scene) return;

    const mesh = new THREE.Mesh(
      geometries.material,
      materials.materialBlue
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshRef.current = mesh;

    // 初始状态
    if (visible) {
      mesh.position.set(...position);
      mesh.material = color === 'blue' ? materials.materialBlue : materials.materialBlack;
      scene.add(mesh);
    }

    return () => {
      if (meshRef.current) {
        scene.remove(meshRef.current);
      }
    };
  }, [scene]); // 只依赖 scene

  // 更新可见性和位置
  useEffect(() => {
    if (!meshRef.current || !scene) return;

    if (visible) {
      meshRef.current.position.set(...position);
      if (!scene.children.includes(meshRef.current)) {
        scene.add(meshRef.current);
      }
    } else {
      if (scene.children.includes(meshRef.current)) {
        scene.remove(meshRef.current);
      }
    }
  }, [scene, visible, position]);

  // 更新颜色
  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.material = color === 'blue' ? materials.materialBlue : materials.materialBlack;
  }, [color]);

  return null;
};

export default Material;