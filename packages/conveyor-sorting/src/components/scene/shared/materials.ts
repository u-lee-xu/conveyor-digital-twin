import * as THREE from 'three';

export const materials = {
  endCap: new THREE.MeshStandardMaterial({
    color: 0xD4D4D4,
    metalness: 0.85,
    roughness: 0.2,
  }),

  cylinderBody: new THREE.MeshStandardMaterial({
    color: 0x64748B,
    metalness: 0.7,
    roughness: 0.35,
  }),

  cylinderRod: new THREE.MeshStandardMaterial({
    color: 0xF0F0F0,
    metalness: 0.95,
    roughness: 0.05,
  }),

  cylinderPort: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.6,
    roughness: 0.4,
  }),

  magneticSwitch: new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.5,
    roughness: 0.5,
  }),

  ledActive: new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.1,
  }),

  ledInactive: new THREE.MeshStandardMaterial({
    color: 0x1F2937,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.7,
    metalness: 0.3,
  }),

  roller: new THREE.MeshStandardMaterial({
    color: 0x6B7280,
    metalness: 0.6,
    roughness: 0.4,
  }),

  rollerRunning: new THREE.MeshStandardMaterial({
    color: 0x9CA3AF,
    metalness: 0.75,
    roughness: 0.25,
  }),

  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.65,
    roughness: 0.35,
  }),

  sensor: new THREE.MeshStandardMaterial({
    color: 0x94A3B8,
    metalness: 0.5,
    roughness: 0.5,
  }),

  sensorActive: new THREE.MeshStandardMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),

  sensorDetected: new THREE.MeshStandardMaterial({
    color: 0x22C55E,
    emissive: 0x22C55E,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.2,
  }),

  sensorBracket: new THREE.MeshStandardMaterial({
    color: 0x1F2937,
    metalness: 0.55,
    roughness: 0.45,
  }),

  sensorLabelFeed: new THREE.MeshStandardMaterial({
    color: 0x10B981,
    emissive: 0x10B981,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  sensorLabelColor: new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    emissive: 0x3B82F6,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  sensorLabelMaterial: new THREE.MeshStandardMaterial({
    color: 0xF59E0B,
    emissive: 0xF59E0B,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  }),

  materialBlue: new THREE.MeshStandardMaterial({
    color: 0x3B82F6,
    metalness: 0.15,
    roughness: 0.5,
  }),

  materialBlack: new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.15,
    roughness: 0.7,
  }),

  wood: new THREE.MeshStandardMaterial({
    color: 0xA0522D,
    metalness: 0.05,
    roughness: 0.85,
  }),

  ground: new THREE.MeshStandardMaterial({
    color: 0xE5E7EB,
    metalness: 0.0,
    roughness: 0.85,
  }),
};
