import { Html } from '@react-three/drei';
import { LABEL_COLORS } from '../../../components/scene/shared/labelColors';
import { useAppStore } from '../../../stores/useAppStore';

/** 部件彩色标签（与传送分拣场景 PhysicsLabel 同款外观，受右上角标签开关控制） */
export function PhysicsLabel({ text, position, offset = [0, 0.5, 0], color = 'blue' }: {
  text: string; position: [number, number, number]; offset?: [number, number, number]; color?: string;
}) {
  const showLabels = useAppStore((s) => s.showLabels);
  if (!showLabels) return null;
  const c = LABEL_COLORS[color] || LABEL_COLORS.gray;
  return (
    <Html position={[position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]} center zIndexRange={[1, 0]}>
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