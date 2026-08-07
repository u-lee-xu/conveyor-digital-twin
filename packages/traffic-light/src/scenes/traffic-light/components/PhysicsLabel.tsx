import { Html } from '@react-three/drei';

/** 标签配色（与气动机械手场景 LABEL_COLORS 一致） */
const LABEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.4)', border: 'rgba(96,165,250,0.6)', text: '#dbeafe' },
  green: { bg: 'rgba(34,197,94,0.4)', border: 'rgba(74,222,128,0.6)', text: '#dcfce7' },
  orange: { bg: 'rgba(245,158,11,0.4)', border: 'rgba(251,191,36,0.6)', text: '#fef3c7' },
  yellow: { bg: 'rgba(234,179,8,0.4)', border: 'rgba(250,204,21,0.6)', text: '#fef9c3' },
  gray: { bg: 'rgba(100,116,139,0.35)', border: 'rgba(148,163,184,0.5)', text: '#cbd5e1' },
};

export function PhysicsLabel({ text, position, offset = [0, 0.5, 0], color = 'blue' }: {
  text: string; position: [number, number, number]; offset?: [number, number, number]; color?: string;
}) {
  const c = LABEL_COLORS[color] || LABEL_COLORS.blue;
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
