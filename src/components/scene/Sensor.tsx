import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';

interface SensorProps {
  position: [number, number, number];
  active: boolean;
  type?: 'feed' | 'color' | 'material';
}

export const Sensor: React.FC<SensorProps> = ({ position, active, type = 'feed' }) => {
  const { scene } = useScene();
  const groupRef = useRef<THREE.Group | null>(null);
  const ledRef = useRef<THREE.Mesh | null>(null);
  const ledMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    if (!scene) return;
    
    const group = new THREE.Group();
    group.position.set(...position);
    groupRef.current = group;

    const bracket = new THREE.Mesh(geometries.sensorBracket, materials.sensorBracket);
    bracket.position.set(0, -0.075, 0);
    group.add(bracket);

    const sensorBody = new THREE.Mesh(geometries.sensor, materials.sensor);
    sensorBody.position.set(0, 0.03, 0);
    group.add(sensorBody);

    const ledMat = materials.ledInactive.clone();
    ledMatRef.current = ledMat;
    const led = new THREE.Mesh(geometries.led, ledMat);
    led.position.set(0, 0.06, 0.04);
    led.scale.set(1.5, 1.5, 1.5);
    group.add(led);
    ledRef.current = led;

    let labelMaterial = materials.sensorLabelFeed;
    if (type === 'color') {
      labelMaterial = materials.sensorLabelColor;
    } else if (type === 'material') {
      labelMaterial = materials.sensorLabelMaterial;
    }

    const label = new THREE.Mesh(geometries.sensorLabel, labelMaterial);
    label.position.set(0, 0.03, -0.05);
    group.add(label);

    scene.add(group);

    return () => {
      scene.remove(group);
      ledMat.dispose();
      ledMatRef.current = null;
      ledRef.current = null;
      groupRef.current = null;
    };
  }, [scene, position, type]);

  // 更新LED状态
  useEffect(() => {
    if (!ledRef.current) return;
    const mat = ledRef.current.material as THREE.MeshStandardMaterial;
    if (active) {
      mat.color.set(0x22C55E);
      mat.emissive.set(0x22C55E);
      mat.emissiveIntensity = 1.5;
    } else {
      mat.color.set(0x1F2937);
      mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
    }
  }, [active]);

  return null;
};

export default Sensor;