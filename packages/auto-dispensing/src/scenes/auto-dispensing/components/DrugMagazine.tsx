import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  MAGAZINE_X, MAG_TUBE_INNER, MAG_WALL, MAG_CAPACITY, PILL_R, PILL_H,
  VISUAL, CYL_BODY, CYL_FEED_STROKE, CHUTE_Y, type MagazineId,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';

function PillStack({ mag, count }: { mag: MagazineId; count: number }) {
  const n = Math.max(0, Math.min(count, MAG_CAPACITY));
  const pills = [];
  for (let i = 0; i < n; i++) {
    pills.push(
      <mesh key={i} position={[0, CHUTE_Y + i * PILL_H, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 12]} />
        <meshStandardMaterial color={VISUAL.PILL_COLOR[mag]} />
      </mesh>,
    );
  }
  return <group>{pills}</group>;
}

/**
 * 药仓（A/B/C）：竖直堆叠通道 + 送药气缸（-X 侧） + 出药口（正对下方料斗）
 * 气缸伸出 → 把最底 1 粒药从出口推出 → 药片垂直落入料斗
 */
export function DrugMagazine({ mag }: { mag: MagazineId }) {
  const stock = useDispensingStore((s) => s.magStock[mag]);
  const magEmpty = useDispensingStore((s) => s.sensors.magEmpty[mag]);
  const cyl = useDispensingStore((s) => s.sendCyl[mag]);
  const x = MAGAZINE_X[mag];
  const tubeH = MAG_CAPACITY * PILL_H * 1.15 + 0.1;
  const tubeCY = CHUTE_Y + tubeH / 2 - 0.05;

  return (
    <group position={[x, 0, 0]}>
      {/* 支撑柱 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.75, s * 0.16]} material={materials.base}>
          <boxGeometry args={[0.03, 1.5, 0.03]} />
        </mesh>
      ))}
      {/* 药仓通道（半透明） */}
      <mesh position={[0, tubeCY, 0]}>
        <boxGeometry args={[MAG_TUBE_INNER[0] + MAG_WALL * 2, tubeH, MAG_TUBE_INNER[2] + MAG_WALL * 2]} />
        <meshStandardMaterial
          color={VISUAL.MAG_COLOR[mag]}
          transparent
          opacity={0.28}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* 通道内药片堆 */}
      <PillStack mag={mag} count={stock} />
      {/* 药仓底座（色标） */}
      <mesh position={[0, CHUTE_Y - 0.1, 0]}>
        <boxGeometry args={[0.1, 0.03, 0.1]} />
        <meshStandardMaterial color={VISUAL.MAG_COLOR[mag]} />
      </mesh>
      {/* 空仓指示灯 */}
      <mesh position={[0.07, CHUTE_Y - 0.06, 0]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color={magEmpty ? VISUAL.LAMP_RED : VISUAL.LAMP_DARK} emissive={magEmpty ? VISUAL.LAMP_RED : '#000000'} emissiveIntensity={2} />
      </mesh>
      {/* 送药气缸（-X 侧，水平推杆向 +X） */}
      <group position={[-0.09, CHUTE_Y, 0]}>
        {/* 缸体 */}
        <mesh position={[-CYL_BODY[0] / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.cylinderBody}>
          <boxGeometry args={CYL_BODY} />
        </mesh>
        {/* 推杆（伸出位移 = 行程 × position） */}
        <mesh position={[CYL_FEED_STROKE * cyl.position / 2, 0, 0]} material={materials.cylinderRod}>
          <boxGeometry args={[CYL_FEED_STROKE * cyl.position + 0.005, 0.012, 0.012]} />
        </mesh>
      </group>
    </group>
  );
}