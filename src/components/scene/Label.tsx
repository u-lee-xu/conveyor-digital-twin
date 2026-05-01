import { useEffect, useRef } from 'react';
import React from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useScene } from './Scene';
import { useDeviceStore } from '../../stores/useDeviceStore';

interface LabelProps {
  text: string;
  position: [number, number, number];
  offset?: [number, number, number];
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'gray';
}

const colorStyles = {
  blue: { bg: 'rgba(59, 130, 246, 0.4)', border: 'rgba(96, 165, 250, 0.6)', text: '#dbeafe' },
  green: { bg: 'rgba(34, 197, 94, 0.4)', border: 'rgba(74, 222, 128, 0.6)', text: '#dcfce7' },
  orange: { bg: 'rgba(245, 158, 11, 0.4)', border: 'rgba(251, 191, 36, 0.6)', text: '#fef3c7' },
  purple: { bg: 'rgba(168, 85, 247, 0.4)', border: 'rgba(192, 132, 252, 0.6)', text: '#f3e8ff' },
  gray: { bg: 'rgba(107, 114, 128, 0.4)', border: 'rgba(156, 163, 175, 0.6)', text: '#f1f5f9' },
};

export const Label: React.FC<LabelProps> = React.memo(({ 
  text, 
  position, 
  offset = [0, 0.5, 0],
  color = 'blue' 
}) => {
  const { scene } = useScene();
  const showLabels = useDeviceStore(state => state.showLabels);
  const labelRef = useRef<CSS2DObject | null>(null);
  
  useEffect(() => {
    if (!scene) return;

    const styles = colorStyles[color];
    const isMobile = window.innerWidth < 640;
    const fontSize = isMobile ? '9px' : '10px';
    const padding = isMobile ? '2px 6px' : '4px 10px';
    const borderRadius = '6px';

    const div = document.createElement('div');
    div.style.cssText = `
      padding: ${padding};
      border-radius: ${borderRadius};
      font-size: ${fontSize};
      font-weight: 500;
      border: 1px solid ${styles.border};
      background-color: ${styles.bg};
      color: ${styles.text};
      white-space: nowrap;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
      opacity: ${showLabels ? '1' : '0'};
      transform: scale(${showLabels ? '1' : '0.8'});
    `;
    div.textContent = text;

    const label = new CSS2DObject(div);
    label.position.set(...position);
    
    const [ox, oy, oz] = offset;
    label.position.add(new THREE.Vector3(ox, oy, oz));

    scene.add(label);
    labelRef.current = label;

    return () => {
      if (labelRef.current && scene) {
        scene.remove(labelRef.current);
      }
    };
  }, [scene, text, color]);

  // 更新显示状态
  useEffect(() => {
    if (labelRef.current) {
      const div = labelRef.current.element as HTMLDivElement;
      div.style.opacity = showLabels ? '1' : '0';
      div.style.transform = `scale(${showLabels ? '1' : '0.8'})`;
    }
  }, [showLabels]);

  useEffect(() => {
    if (!labelRef.current) return;
    const newPos = new THREE.Vector3(...position).add(new THREE.Vector3(...offset));
    labelRef.current.position.copy(newPos);
  }, [position, offset]);

  return null;
}, (prev, next) => {
  return prev.text === next.text && 
         prev.color === next.color && 
         prev.position.every((v, i) => v === next.position[i]) &&
         (prev.offset || [0, 0.5, 0]).every((v, i) => v === (next.offset || [0, 0.5, 0])[i]);
});

export default Label;