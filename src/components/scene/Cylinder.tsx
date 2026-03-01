import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';

interface CylinderProps {
  position: [number, number, number];
  extended: boolean;
}

export const Cylinder: React.FC<CylinderProps> = ({ position, extended }) => {
  const { scene } = useScene();
  const groupRef = useRef<THREE.Group | null>(null);
  const rodRef = useRef<THREE.Mesh | null>(null);
  const led1Ref = useRef<THREE.Mesh | null>(null);
  const led2Ref = useRef<THREE.Mesh | null>(null);
  const targetPositionRef = useRef(0);
  const extendedRef = useRef(extended);
  const animationIdRef = useRef<number>(0);

  useEffect(() => {
    extendedRef.current = extended;
  }, [extended]);

  useEffect(() => {
    if (!scene) return;
    
    const group = new THREE.Group();
    group.position.set(...position);
    group.rotation.x = Math.PI / 2; // 气缸水平放置
    group.rotation.z = Math.PI; // 翻转180度，让活塞杆朝向正确方向
    groupRef.current = group;

    // 后端盖（底部）
    const rearEndCap = new THREE.Mesh(geometries.cylinderEndCap, materials.endCap);
    rearEndCap.position.set(0, -0.29, 0);
    rearEndCap.castShadow = true;
    group.add(rearEndCap);

    // 前端盖（顶部，活塞杆伸出侧）
    const frontEndCap = new THREE.Mesh(geometries.cylinderEndCap, materials.endCap);
    frontEndCap.position.set(0, 0.29, 0);
    frontEndCap.castShadow = true;
    group.add(frontEndCap);

    // 缸体
    const body = new THREE.Mesh(geometries.cylinderBody, materials.cylinderBody);
    body.castShadow = true;
    group.add(body);

    // 活塞杆
    const rod = new THREE.Mesh(geometries.cylinderRod, materials.cylinderRod);
    rod.position.set(0, extendedRef.current ? 0.43 : 0.18, 0);
    rod.castShadow = true;
    group.add(rod);
    rodRef.current = rod;

    // 气口1
    const port1 = new THREE.Mesh(geometries.cylinderPort, materials.cylinderPort);
    port1.position.set(0.1, 0.29, 0);
    port1.rotation.z = Math.PI / 2;
    group.add(port1);

    // 气口2
    const port2 = new THREE.Mesh(geometries.cylinderPort, materials.cylinderPort);
    port2.position.set(0.1, -0.29, 0);
    port2.rotation.z = Math.PI / 2;
    group.add(port2);

    // 磁性开关1（伸出位置检测）- 朝上
    const switch1 = new THREE.Mesh(geometries.magneticSwitch, materials.magneticSwitch);
    switch1.position.set(0, 0.2, -0.1);
    switch1.castShadow = true;
    group.add(switch1);

    // LED 1 - 根据初始状态设置材质
    const led1Mat = extendedRef.current ? materials.ledActive.clone() : materials.ledInactive.clone();
    const led1 = new THREE.Mesh(geometries.led, led1Mat);
    led1.position.set(0, 0, -0.03);
    switch1.add(led1);
    led1Ref.current = led1;

    // 磁性开关2（缩回位置检测）- 朝上
    const switch2 = new THREE.Mesh(geometries.magneticSwitch, materials.magneticSwitch);
    switch2.position.set(0, -0.2, -0.1);
    switch2.castShadow = true;
    group.add(switch2);

    // LED 2 - 根据初始状态设置材质
    const led2Mat = extendedRef.current ? materials.ledInactive.clone() : materials.ledActive.clone();
    const led2 = new THREE.Mesh(geometries.led, led2Mat);
    led2.position.set(0, 0, -0.03);
    switch2.add(led2);
    led2Ref.current = led2;

    scene.add(group);

    return () => {
      scene.remove(group);
    };
  }, [scene, position]);

  // 活塞杆动画
  useEffect(() => {
    if (!rodRef.current) return;

    targetPositionRef.current = extended ? 0.43 : 0.18;

    const animate = () => {
      if (!rodRef.current) return;

      const current = rodRef.current.position.y;
      const target = targetPositionRef.current;
      const diff = target - current;

      if (Math.abs(diff) > 0.005) {
        rodRef.current.position.y += diff * 0.15;
        animationIdRef.current = requestAnimationFrame(animate);
      } else {
        rodRef.current.position.y = target;
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationIdRef.current);
    };
  }, [extended]);

  // LED状态更新
  useEffect(() => {
    if (!led1Ref.current || !led2Ref.current) return;
    
    if (extended) {
      led1Ref.current.material = materials.ledActive.clone();
      led2Ref.current.material = materials.ledInactive.clone();
    } else {
      led1Ref.current.material = materials.ledInactive.clone();
      led2Ref.current.material = materials.ledActive.clone();
    }
  }, [extended]);

  return null;
};

export default Cylinder;