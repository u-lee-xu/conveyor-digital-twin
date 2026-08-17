import { useDispensingStore } from '../../../stores/useDispensingStore';
import { CABINET_POSITION, LIGHT_TOWER_X, LIGHT_POLE_H, LIGHT_POLE_Y, VISUAL } from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/** 面板按钮（按下-释放语义：pointerdown 置 1，pointerup/leave 置 0） */
function PanelButton({
  color, active, onDown, onUp,
}: {
  color: string;
  active: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <mesh
      position={[0, 0, 0.115]}
      onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
      onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
      onPointerOut={onUp}
    >
      <cylinderGeometry args={[0.035, 0.035, 0.018, 16]} />
      <meshStandardMaterial
        color={active ? '#f8fafc' : color}
        emissive={active ? '#ffffff' : '#000000'}
        emissiveIntensity={active ? 0.6 : 0}
      />
    </mesh>
  );
}

const BTNS: { name: keyof ReturnType<typeof useDispensingStore.getState>['buttons']; color: string; x: number; label: string }[] = [
  { name: 'start', color: '#16a34a', x: -0.11, label: '启动' },
  { name: 'stop', color: '#dc2626', x: -0.055, label: '停止' },
  { name: 'reset', color: '#f59e0b', x: 0, label: '复位' },
  { name: 'estop', color: '#111827', x: 0.055, label: '急停' },
  { name: 'confirm', color: '#3b82f6', x: 0.11, label: '取药确认' },
];

/** 控制柜面板：启动/停止/复位/急停/取药确认 + 状态灯排 */
export function ControlCabinet() {
  const buttons = useDispensingStore((s) => s.buttons);
  const lamp = useDispensingStore((s) => s.lamp);
  const setButton = useDispensingStore((st) => st.setButton);

  const lampColors: Record<'green' | 'yellow' | 'red', string> = {
    green: VISUAL.LAMP_GREEN, yellow: VISUAL.LAMP_YELLOW, red: VISUAL.LAMP_RED,
  };

  return (
    <group position={[...CABINET_POSITION]}>
      {/* 柜体（含柜脚） */}
      <mesh position={[0, 0.26, 0]} castShadow material={materials.cabinet}>
        <boxGeometry args={[0.34, 0.5, 0.2]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={materials.darkMetal}>
        <boxGeometry args={[0.34, 0.02, 0.2]} />
      </mesh>
      {/* 面板（柜门） */}
      <mesh position={[0, 0.26, 0.105]} material={materials.sleeve}>
        <boxGeometry args={[0.3, 0.4, 0.006]} />
      </mesh>
      {/* 按钮排 */}
      <group position={[0, 0.34, 0]}>
        {BTNS.map((b) => (
          <group key={b.name} position={[b.x, 0, 0]}>
            <PanelButton
              color={b.color}
              active={!!buttons[b.name]}
              onDown={() => setButton(b.name, true)}
              onUp={() => setButton(b.name, false)}
            />
          </group>
        ))}
      </group>
      {/* 状态灯排（绿/黄/红，与灯塔联动） */}
      <group position={[0, 0.16, 0]}>
        {(['green', 'yellow', 'red'] as const).map((c, i) => (
          <mesh key={c} position={[-0.06 + i * 0.06, 0, 0.115]}>
            <sphereGeometry args={[0.02, 10, 10]} />
            <meshStandardMaterial
              color={lamp[c] ? lampColors[c] : VISUAL.LAMP_DARK}
              emissive={lamp[c] ? lampColors[c] : '#000000'}
              emissiveIntensity={lamp[c] ? 2.2 : 0}
            />
          </mesh>
        ))}
      </group>
      {/* 面板标签条 */}
      <mesh position={[0, 0.05, 0.111]} material={materials.darkMetal}>
        <boxGeometry args={[0.26, 0.035, 0.004]} />
      </mesh>
    </group>
  );
}

/** 三色信号灯塔（立杆 + 绿/黄/红灯头） */
export function LightTower() {
  const lamp = useDispensingStore((s) => s.lamp);
  const lampColors: Record<'green' | 'yellow' | 'red', string> = {
    green: VISUAL.LAMP_GREEN, yellow: VISUAL.LAMP_YELLOW, red: VISUAL.LAMP_RED,
  };
  const colors = [
    { key: 'green' as const, y: LIGHT_POLE_Y + 0.09 },
    { key: 'yellow' as const, y: LIGHT_POLE_Y + 0.045 },
    { key: 'red' as const, y: LIGHT_POLE_Y },
  ];
  return (
    <group position={[LIGHT_TOWER_X, 0, 0]}>
      <mesh position={[0, LIGHT_POLE_H / 2, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[0.012, 0.02, LIGHT_POLE_H, 8]} />
      </mesh>
      {colors.map((c) => (
        <mesh key={c.key} position={[0, c.y, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial
            color={lamp[c.key] ? lampColors[c.key] : VISUAL.LAMP_DARK}
            emissive={lamp[c.key] ? lampColors[c.key] : '#000000'}
            emissiveIntensity={lamp[c.key] ? 2.5 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}