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

  useEffect(() => {
    if (!scene) return;
    
    const group = new THREE.Group();
    group.position.set(...position);
    groupRef.current = group;

    // 传感器支架
    const bracket = new THREE.Mesh(geometries.sensorBracket, materials.sensorBracket);
    bracket.position.set(0, -0.075, 0);
    bracket.castShadow = true;
    group.add(bracket);

    // 传感器主体 - 光电传感器盒子
    const sensorBody = new THREE.Mesh(geometries.sensor, materials.sensor);
    sensorBody.position.set(0, 0.03, 0);
    sensorBody.castShadow = true;
    group.add(sensorBody);

    // LED指示灯
    const led = new THREE.Mesh(geometries.led, materials.ledInactive.clone());
    led.position.set(0, 0.06, 0.04);
    led.scale.set(1.5, 1.5, 1.5);
    group.add(led);
    ledRef.current = led;

    // 根据类型添加标签颜色
    let labelColor = 0x888888;
    if (type === 'feed') {
      labelColor = 0x4CAF50; // 绿色
    } else if (type === 'color') {
      labelColor = 0x2196F3; // 蓝色
    } else if (type === 'material') {
      labelColor = 0xFF9800; // 橙色
    }

    // 类型标签
    const labelGeometry = new THREE.BoxGeometry(0.015, 0.015, 0.02);
    const labelMaterial = new THREE.MeshStandardMaterial({
      color: labelColor,
      emissive: labelColor,
      emissiveIntensity: 0.3,
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(0, 0.03, -0.05);
    group.add(label);

    scene.add(group);

    return () => {
      scene.remove(group);
    };
  }, [scene, position, type]);

  // 更新LED状态
  useEffect(() => {
    if (ledRef.current) {
      if (active) {
        ledRef.current.material = materials.sensorDetected.clone();
      } else {
        ledRef.current.material = materials.ledInactive.clone();
      }
    }
  }, [active]);

  return null;
};

export default Sensor;