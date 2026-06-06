import { Html } from '@react-three/drei';
import { useAppStore } from '../../../stores/useAppStore';
import type { CSSProperties } from 'react';

const LABEL_STYLE: CSSProperties = {
  background: 'rgba(15, 23, 42, 0.85)',
  color: '#e2e8f0',
  fontSize: '11px',
  padding: '2px 6px',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
  border: '1px solid rgba(100, 116, 139, 0.3)',
};

export function SceneLabel({ text, position, offset = [0, 0.3, 0] }: { text: string; position: [number, number, number]; offset?: [number, number, number] }) {
  const showLabels = useAppStore((s) => s.showLabels);
  if (!showLabels) return null;
  return (
    <Html position={[position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]} center>
      <div style={LABEL_STYLE}>{text}</div>
    </Html>
  );
}
