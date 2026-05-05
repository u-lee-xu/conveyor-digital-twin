import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';
import { geometries, materials, CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT, CYLINDER_LIMIT_ZONE } from './shared';
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

  // 气缸参数配置 (全系列统一外观规格)
  const isFeed = name === 'feed';
  const bodyGeom = geometries.cylinderBody; // 统一 0.8
  const rodGeom = geometries.cylinderRod;  // 统一 0.7
  const rodLen = 0.7; 
  const bodyHalfLen = 0.4;

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
    let initialY: number;
    if (isFeed) {
      // Base Z=1.2, Rod=0.7, Offset=0.72
      // Retracted (Tip Z=0.7): 1.2 - (ext + 0.72) = 0.7 => ext = -0.22
      // Extended (Tip Z=0.075): 1.2 - (ext + 0.72) = 0.075 => ext = 0.405
      initialY = extended ? 0.405 : -0.22;
    } else {
      // Base Z=0.8, Rod=0.7, Offset=0.72
      // Retracted (Tip Z=0.3): 0.8 - (ext + 0.72) = 0.3 => ext = -0.22
      // Extended (Tip Z=-0.25): 0.8 - (ext + 0.72) = -0.25 => ext = 0.33
      initialY = extended ? 0.33 : -0.22;
    }
    
    rodGroup.position.set(0, initialY, 0);
    group.add(rodGroup);
    rodRef.current = rodGroup;

    // 立即设置初始LED状态（基于位置的限位逻辑，必须在 initialY 声明之后）
    {
      const initExtendPos = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;
      const initAtRetract = initialY <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const initAtExtend  = initialY >= initExtendPos - CYLINDER_LIMIT_ZONE;
      swExt.led.material = initAtExtend  ? materials.ledActive.clone() : materials.ledInactive.clone();
      swRet.led.material = initAtRetract ? materials.ledActive.clone() : materials.ledInactive.clone();
    }

    const rodMesh = new THREE.Mesh(rodGeom, materials.cylinderRod);
    rodMesh.position.y = rodLen / 2;
    rodMesh.castShadow = true;
    rodGroup.add(rodMesh);

    // 统一使用推板外观
    const head = new THREE.Mesh(geometries.cylinderPushPlate, materials.endCap);
    head.position.set(0, rodLen, 0);
    head.castShadow = true;
    rodGroup.add(head);

    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene, position, name, isFeed, bodyGeom, rodGeom, rodLen, bodyHalfLen]);

  // 动画逻辑（含基于物理位置的磁性开关LED更新）
  useEffect(() => {
    if (!rodRef.current) return;
    
    let targetValue: number;
    if (isFeed) {
      targetValue = extended ? 0.405 : -0.22;
    } else {
      targetValue = extended ? 0.33 : -0.22;
    }
    targetPositionRef.current = targetValue;

    const extendPos = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;

    // 根据活塞杆实际位置更新磁性开关LED
    const setLEDs = (pos: number) => {
      if (!led1Ref.current || !led2Ref.current) return;
      const atRetract = pos <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
      const atExtend  = pos >= extendPos - CYLINDER_LIMIT_ZONE;
      led1Ref.current.material = atExtend  ? materials.ledActive.clone() : materials.ledInactive.clone();
      led2Ref.current.material = atRetract ? materials.ledActive.clone() : materials.ledInactive.clone();
    };

    const animate = () => {
      if (!rodRef.current) return;
      const current = rodRef.current.position.y;
      const target = targetPositionRef.current;
      const diff = target - current;
      if (Math.abs(diff) > 0.001) {
        const nextPos = current + diff * 0.15;
        rodRef.current.position.y = nextPos;
        updateCylinderExtension(name, nextPos);
        setLEDs(nextPos);
        animationIdRef.current = requestAnimationFrame(animate);
      } else {
        rodRef.current.position.y = target;
        updateCylinderExtension(name, target);
        setLEDs(target);
      }
    };
    animate();
    return () => cancelAnimationFrame(animationIdRef.current);
  }, [extended, name, isFeed, updateCylinderExtension]);

  return null;
};

export default Cylinder;