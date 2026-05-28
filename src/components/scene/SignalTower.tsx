import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useScene } from './Scene';

interface SignalTowerProps {
  position: [number, number, number];
  red: boolean;
  green: boolean;
  yellow: boolean;
}

const MODULE_RADIUS = 0.065;
const MODULE_HEIGHT = 0.13;
const DOME_RADIUS = 0.065;
const DOME_HEIGHT = 0.05;
const BASE_RADIUS_TOP = 0.075;
const BASE_RADIUS_BOTTOM = 0.09;
const BASE_HEIGHT = 0.04;
const POLE_RADIUS = 0.025;
const POLE_HEIGHT = 0.22;
const GAP = 0.015;

const COLOR_RED = 0xEF4444;
const COLOR_YELLOW = 0xEAB308;
const COLOR_GREEN = 0x22C55E;
const COLOR_DARK_RED = 0x3B1111;
const COLOR_DARK_YELLOW = 0x3B2F08;
const COLOR_DARK_GREEN = 0x0B3B1A;

export const SignalTower: React.FC<SignalTowerProps> = ({ position, red, green, yellow }) => {
  const { scene } = useScene();
  const groupRef = useRef<THREE.Group | null>(null);
  const redRefs = useRef<{ body: THREE.Mesh; dome: THREE.Mesh; light: THREE.PointLight | null } | null>(null);
  const yellowRefs = useRef<{ body: THREE.Mesh; dome: THREE.Mesh; light: THREE.PointLight | null } | null>(null);
  const greenRefs = useRef<{ body: THREE.Mesh; dome: THREE.Mesh; light: THREE.PointLight | null } | null>(null);
  const disposablesRef = useRef<THREE.Material[]>([]);
  const geomDisposablesRef = useRef<THREE.BufferGeometry[]>([]);
  const lightsReadyRef = useRef(false);

  const setLight = (
    refs: React.MutableRefObject<{ body: THREE.Mesh; dome: THREE.Mesh; light: THREE.PointLight | null } | null>,
    active: boolean,
    activeColor: number,
    darkColor: number,
  ) => {
    const r = refs.current;
    if (!r) return;
    const bodyMat = r.body.material as THREE.MeshStandardMaterial;
    const domeMat = r.dome.material as THREE.MeshStandardMaterial;
    if (active) {
      bodyMat.color.set(activeColor);
      bodyMat.emissive.set(activeColor);
      bodyMat.emissiveIntensity = 2.0;
      bodyMat.opacity = 1.0;
      domeMat.color.set(activeColor);
      domeMat.emissive.set(activeColor);
      domeMat.emissiveIntensity = 4.0;
      domeMat.opacity = 1.0;
      if (r.light) {
        r.light.color.set(activeColor);
        r.light.intensity = 0.8;
      }
    } else {
      bodyMat.color.set(darkColor);
      bodyMat.emissive.set(0x000000);
      bodyMat.emissiveIntensity = 0;
      bodyMat.opacity = 0.9;
      domeMat.color.set(darkColor);
      domeMat.emissive.set(0x000000);
      domeMat.emissiveIntensity = 0;
      domeMat.opacity = 0.7;
      if (r.light) {
        r.light.intensity = 0;
      }
    }
  };

  useEffect(() => {
    if (!scene) return;

    const group = new THREE.Group();
    group.position.set(...position);
    groupRef.current = group;

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1F2937,
      metalness: 0.7,
      roughness: 0.3,
    });
    disposablesRef.current.push(baseMat);

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      metalness: 0.6,
      roughness: 0.4,
    });
    disposablesRef.current.push(poleMat);

    const baseGeom = new THREE.CylinderGeometry(BASE_RADIUS_TOP, BASE_RADIUS_BOTTOM, BASE_HEIGHT, 20);
    geomDisposablesRef.current.push(baseGeom);
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = BASE_HEIGHT / 2;
    group.add(base);

    const poleGeom = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 12);
    geomDisposablesRef.current.push(poleGeom);
    const pole = new THREE.Mesh(poleGeom, poleMat);
    pole.position.y = BASE_HEIGHT + POLE_HEIGHT / 2;
    group.add(pole);

    const createModule = (yPos: number, activeColor: number) => {
      const moduleGroup = new THREE.Group();
      moduleGroup.position.y = yPos;

      const bodyGeom = new THREE.CylinderGeometry(MODULE_RADIUS, MODULE_RADIUS, MODULE_HEIGHT, 20);
      geomDisposablesRef.current.push(bodyGeom);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: activeColor,
        emissive: 0x000000,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.9,
        roughness: 0.3,
        metalness: 0.1,
      });
      disposablesRef.current.push(bodyMat);
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      moduleGroup.add(body);

      const ringGeom = new THREE.TorusGeometry(MODULE_RADIUS + 0.003, 0.004, 8, 20);
      geomDisposablesRef.current.push(ringGeom);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x6B7280,
        metalness: 0.8,
        roughness: 0.2,
      });
      disposablesRef.current.push(ringMat);
      const topRing = new THREE.Mesh(ringGeom, ringMat);
      topRing.position.y = MODULE_HEIGHT / 2;
      topRing.rotation.x = Math.PI / 2;
      moduleGroup.add(topRing);

      const bottomRing = new THREE.Mesh(ringGeom, ringMat);
      bottomRing.position.y = -MODULE_HEIGHT / 2;
      bottomRing.rotation.x = Math.PI / 2;
      moduleGroup.add(bottomRing);

      const domeGeom = new THREE.SphereGeometry(DOME_RADIUS, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.5);
      geomDisposablesRef.current.push(domeGeom);
      const domeMat = new THREE.MeshStandardMaterial({
        color: activeColor,
        emissive: 0x000000,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
        metalness: 0.0,
      });
      disposablesRef.current.push(domeMat);
      const dome = new THREE.Mesh(domeGeom, domeMat);
      dome.position.y = MODULE_HEIGHT / 2;
      moduleGroup.add(dome);

      const light = new THREE.PointLight(activeColor, 0, 1.5);
      light.position.y = MODULE_HEIGHT / 2 + DOME_HEIGHT / 2;
      moduleGroup.add(light);

      group.add(moduleGroup);
      return { body, dome, light };
    };

    const startY = BASE_HEIGHT + POLE_HEIGHT;
    const redModule = createModule(startY + MODULE_HEIGHT / 2, COLOR_RED);
    const yellowModule = createModule(startY + MODULE_HEIGHT + GAP + MODULE_HEIGHT / 2, COLOR_YELLOW);
    const greenModule = createModule(startY + (MODULE_HEIGHT + GAP) * 2 + MODULE_HEIGHT / 2, COLOR_GREEN);

    redRefs.current = redModule;
    yellowRefs.current = yellowModule;
    greenRefs.current = greenModule;

    scene.add(group);

    lightsReadyRef.current = true;
    setLight(redRefs, red, COLOR_RED, COLOR_DARK_RED);
    setLight(yellowRefs, yellow, COLOR_YELLOW, COLOR_DARK_YELLOW);
    setLight(greenRefs, green, COLOR_GREEN, COLOR_DARK_GREEN);

    return () => {
      scene.remove(group);
      disposablesRef.current.forEach(m => m.dispose());
      disposablesRef.current = [];
      geomDisposablesRef.current.forEach(g => g.dispose());
      geomDisposablesRef.current = [];
      groupRef.current = null;
      redRefs.current = null;
      yellowRefs.current = null;
      greenRefs.current = null;
      lightsReadyRef.current = false;
    };
  }, [scene, position]);

  useEffect(() => {
    if (!lightsReadyRef.current) return;

    setLight(redRefs, red, COLOR_RED, COLOR_DARK_RED);
    setLight(yellowRefs, yellow, COLOR_YELLOW, COLOR_DARK_YELLOW);
    setLight(greenRefs, green, COLOR_GREEN, COLOR_DARK_GREEN);
  }, [red, green, yellow]);

  return null;
};

export default SignalTower;
