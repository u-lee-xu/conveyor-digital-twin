import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useScene } from './Scene';

interface LabelProps {
  text: string;
  position: [number, number, number];
  offset?: [number, number, number];
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'gray';
}

const colorStyles = {
  blue: { bg: 'rgba(59, 130, 246, 0.9)', border: 'rgba(96, 165, 250, 1)', text: '#dbeafe' },
  green: { bg: 'rgba(34, 197, 94, 0.9)', border: 'rgba(74, 222, 128, 1)', text: '#dcfce7' },
  orange: { bg: 'rgba(245, 158, 11, 0.9)', border: 'rgba(251, 191, 36, 1)', text: '#fef3c7' },
  purple: { bg: 'rgba(168, 85, 247, 0.9)', border: 'rgba(192, 132, 252, 1)', text: '#f3e8ff' },
  gray: { bg: 'rgba(107, 114, 128, 0.9)', border: 'rgba(156, 163, 175, 1)', text: '#f1f5f9' },
};

export const Label: React.FC<LabelProps> = ({ 
  text, 
  position, 
  offset = [0, 0.5, 0],
  color = 'blue' 
}) => {
  const { scene } = useScene();
  const labelRef = useRef<CSS2DObject | null>(null);

  useEffect(() => {
    if (!scene) return;

    const styles = colorStyles[color];

    // 创建HTML元素
    const div = document.createElement('div');
    div.style.cssText = `
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: 2px solid ${styles.border};
      background-color: ${styles.bg};
      color: ${styles.text};
      white-space: nowrap;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    div.textContent = text;

    // 创建CSS2D对象
    const label = new CSS2DObject(div);
    label.position.set(...position);
    
    // 设置偏移
    const [ox, oy, oz] = offset;
    const offsetVector = new THREE.Vector3(ox, oy, oz);
    label.position.add(offsetVector);

    scene.add(label);
    labelRef.current = label;

    return () => {
      if (labelRef.current) {
        scene.remove(labelRef.current);
        labelRef.current = null;
      }
    };
  }, [scene, text, position, offset, color]);

  return null;
};

export default Label;