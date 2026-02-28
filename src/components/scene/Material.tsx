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

  useEffect(() => {
    if (!scene || !visible) return;

    const material = new THREE.Mesh(
      geometries.material,
      color === 'blue' ? materials.materialBlue : materials.materialBlack
    );
    material.position.set(...position);
    material.castShadow = true;
    material.receiveShadow = true;
    meshRef.current = material;

    scene.add(material);

    return () => {
      scene.remove(material);
    };
  }, [scene, position, color, visible]);

  useEffect(() => {
    if (meshRef.current && visible) {
      meshRef.current.position.set(...position);
    }
  }, [position, visible]);

  return null;
};

export default Material;
