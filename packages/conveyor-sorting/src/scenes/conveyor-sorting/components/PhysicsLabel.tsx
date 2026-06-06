import { Html } from '@react-three/drei';
import { useDeviceStore } from '../../../stores';
import { VISUAL } from '../constants';

export function PhysicsLabel({ text, position, offset = [0, 0.5, 0], color = 'blue' }: {
  text: string; position: [number, number, number]; offset?: [number, number, number]; color?: string;
}) {
  const showLabels = useDeviceStore((s) => s.showLabels);
  if (!showLabels) return null;
  const c = VISUAL.LABEL_COLORS[color] || VISUAL.LABEL_COLORS.blue;
  return (
    <Html position={[position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]} center>
      <div style={{
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '10px',
        fontWeight: 500,
        border: `1px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.text,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        {text}
      </div>
    </Html>
  );
}
