import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials } from './shared';
import { useDeviceStore } from '../../stores';
import type { CylinderName } from '../../types';

interface CylinderProps {
  name: CylinderName;
  position: [number, number, number];
  extended: boolean;
}

export const Cylinder: React.FC<CylinderProps> = ({ name, position, extended }) => {
  const { scene } = useScene();
  const updateCylinderExtension = useDeviceStore((state) => state.updateCylinderExtension);
  const groupRef = useRef<THREE.Group | null>(null);
  const rodRef = useRef<THREE.Group | null>(null);
  const led1Ref = useRef<THREE.Mesh | null>(null);
  const led2Ref = useRef<THREE.Mesh | null>(null);
  const targetPositionRef = useRef(0);
  const animationIdRef = useRef<number>(0);

  // 气缸参数配置 (上料与分拣区分尺寸)
  const isFeed = name === 'feed';
  const bodyGeom = isFeed ? geometries.cylinderBodyLong : geometries.cylinderBody;
  const rodGeom = isFeed ? geometries.cylinderRodLong : geometries.cylinderRod;
  const rodLen = isFeed ? 1.1 : 0.7; 
  const bodyHalfLen = isFeed ? 0.65 : 0.4;

  useEffect(() => {
    if (!scene) return;
    
    const group = new THREE.Group();
    group.position.set(...position);
    group.rotation.x = Math.PI / 2;
    group.rotation.z = Math.PI;
    groupRef.current = group;

    // --- 缸体部分 ---
    const body = new THREE.Mesh(bodyGeom, materials.cylinderBody);
    body.castShadow = true;
    group.add(body);

    const rearEndCap = new THREE.Mesh(geometries.cylinderEndCap, materials.endCap);
    rearEndCap.position.set(0, -bodyHalfLen, 0);
    rearEndCap.castShadow = true;
    group.add(rearEndCap);

    const frontEndCap = new THREE.Mesh(geometries.cylinderEndCap, materials.endCap);
    frontEndCap.position.set(0, bodyHalfLen, 0);
    frontEndCap.castShadow = true;
    group.add(frontEndCap);

    // --- 节流阀 ---
    const createValve = (yPos: number) => {
      const valveGroup = new THREE.Group();
      valveGroup.position.set(0.1, yPos, 0);
      valveGroup.add(new THREE.Mesh(geometries.valveBody, materials.endCap));
      
      const vConnector = new THREE.Mesh(geometries.tubeConnector, materials.darkMetal);
      vConnector.position.set(0.04, 0, 0);
      vConnector.rotation.z = Math.PI / 2;
      valveGroup.add(vConnector);
      
      const vCap = new THREE.Mesh(geometries.valveCap, materials.darkMetal);
      vCap.position.set(0, 0.04, 0);
      valveGroup.add(vCap);
      return valveGroup;
    };
    group.add(createValve(bodyHalfLen - 0.05));
    group.add(createValve(-bodyHalfLen + 0.05));

    // --- 磁性开关 ---
    const createSwitch = (yPos: number) => {
      const swBody = new THREE.Mesh(geometries.magneticSwitch, materials.magneticSwitch);
      swBody.position.set(0, yPos, -0.1);
      const led = new THREE.Mesh(geometries.led, materials.ledInactive.clone());
      led.position.set(0, 0.01, -0.03);
      swBody.add(led);
      return { body: swBody, led };
    };
    const swExt = createSwitch(bodyHalfLen - 0.1);
    const swRet = createSwitch(-bodyHalfLen + 0.1);
    group.add(swExt.body);
    group.add(swRet.body);
    led1Ref.current = swExt.led;
    led2Ref.current = swRet.led;

    // --- 活塞杆组件 ---
    const rodGroup = new THREE.Group();
    // 头部世界 Z = pos.z - (ext + rodLen + plateOffset)
    let initialY: number;
    if (isFeed) {
      // Base Z=1.5, Rod=1.1, Offset=0.01
      // Retracted (Z=0.8): 1.5 - (ext + 1.11) = 0.8 => ext = -0.41
      // Extended (Z=0.075): 1.5 - (ext + 1.11) = 0.075 => ext = 0.315
      initialY = extended ? 0.315 : -0.41;
    } else {
      // Base Z=0.8, Rod=0.7, Offset=0.02
      // Retracted (Z=0.4): 0.8 - (ext + 0.72) = 0.4 => ext = -0.32
      // Extended (Z=-0.25): 0.8 - (ext + 0.72) = -0.25 => ext = 0.33
      initialY = extended ? 0.33 : -0.32;
    }
    
    rodGroup.position.set(0, initialY, 0);
    group.add(rodGroup);
    rodRef.current = rodGroup;

    const rodMesh = new THREE.Mesh(rodGeom, materials.cylinderRod);
    rodMesh.position.y = rodLen / 2;
    rodMesh.castShadow = true;
    rodGroup.add(rodMesh);

    if (!isFeed) {
      const head = new THREE.Mesh(geometries.cylinderPushPlate, materials.endCap);
      head.position.set(0, rodLen, 0);
      head.castShadow = true;
      rodGroup.add(head);
    } else {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), materials.endCap);
      tip.position.set(0, rodLen, 0);
      rodGroup.add(tip);
    }

    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene, position, name, isFeed, bodyGeom, rodGeom, rodLen, bodyHalfLen]);

  // 动画逻辑
  useEffect(() => {
    if (!rodRef.current) return;
    
    let targetValue: number;
    if (isFeed) {
      targetValue = extended ? 0.315 : -0.41;
    } else {
      targetValue = extended ? 0.33 : -0.32;
    }
    targetPositionRef.current = targetValue;

    const animate = () => {
      if (!rodRef.current) return;
      const current = rodRef.current.position.y;
      const target = targetPositionRef.current;
      const diff = target - current;
      if (Math.abs(diff) > 0.001) {
        const nextPos = current + diff * 0.15;
        rodRef.current.position.y = nextPos;
        updateCylinderExtension(name, nextPos);
        animationIdRef.current = requestAnimationFrame(animate);
      } else {
        rodRef.current.position.y = target;
        updateCylinderExtension(name, target);
      }
    };
    animate();
    return () => cancelAnimationFrame(animationIdRef.current);
  }, [extended, name, isFeed, rodLen, updateCylinderExtension]);

  // LED 状态同步
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