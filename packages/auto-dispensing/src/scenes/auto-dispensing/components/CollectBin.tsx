import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  BIN, PILL_R, PILL_H, VISUAL, SURFACE_GAP, type MagazineId,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/**
 * 部件：取药仓（中空开口箱体 + 台座），接住翻转倒出的药片，人工取药确认后清空。
 *
 * 局部原点 = 仓体底面 / 台座顶面，y=0 为仓底；世界位姿见 ASSEMBLY.collectBin。
 * 台座局部 y 为负（向下延伸到地面 0.04）。
 * 接口面：仓口 y = BIN.H（世界 BIN_TOP_Y），倒药落点 DUMP_LAND_Y 由该高度推导。
 */
export function CollectBin() {
  const binHasDrug = useDispensingStore((s) => s.sensors.binHasDrug);
  const binPills = useDispensingStore((s) => s.binPills);
  const { W, H, D, WALL_T: T } = BIN;

  // 按各药仓实际倒出的份数生成颜色，最多示意 12 粒
  const entries = (['A', 'B', 'C', 'D'] as MagazineId[]).flatMap((m) =>
    Array.from({ length: Math.min(binPills[m], 6) }, () => m),
  ).slice(0, 12);

  return (
    <group>
      {/* 台座：从地面抬到仓底 */}
      <mesh position={[0, BIN.PEDESTAL_Y, 0]} castShadow material={materials.base}>
        <boxGeometry args={[BIN.PEDESTAL_W, BIN.PEDESTAL_H, BIN.PEDESTAL_W]} />
      </mesh>
      <mesh position={[0, BIN.FOOT_Y, 0]} castShadow material={materials.darkMetal}>
        <boxGeometry args={[BIN.FOOT_W, BIN.FOOT_H, BIN.FOOT_W]} />
      </mesh>

      {/* 底板 */}
      <mesh position={[0, T / 2, 0]} castShadow material={materials.bin}>
        <boxGeometry args={[W, T, D]} />
      </mesh>
      {/* 四壁（中空开口仓，倒进来的药片可见） */}
      {[-1, 1].map((sx) => (
        <mesh key={`wall_x_${sx}`} position={[sx * (W / 2 - T / 2), H / 2, 0]} castShadow material={materials.bin}>
          <boxGeometry args={[T, H - T, D]} />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh key={`wall_z_${sz}`} position={[0, H / 2, sz * (D / 2 - T / 2)]} castShadow material={materials.bin}>
          <boxGeometry args={[W - T * 2, H - T, T]} />
        </mesh>
      ))}
      {/* 顶框亮边：旧版 Z 向框条长度 W+0.01 会盖到 X 向框条上，
          四角两个 box 顶面同为 y=H+0.004 → 共面闪烁。
          现在 Z 向框条两端各让出 X 向框条整段宽度，四角只由一条框条覆盖。 */}
      {[-1, 1].map((sz) => (
        <mesh key={`rim_z_${sz}`} position={[0, H, sz * (D / 2 - T / 2)]} material={materials.endCap}>
          <boxGeometry args={[W - 2 * T - 0.008, 0.008, T + 0.006]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`rim_x_${sx}`} position={[sx * (W / 2 - T / 2), H, 0]} material={materials.endCap}>
          <boxGeometry args={[T + 0.006, 0.008, D]} />
        </mesh>
      ))}
      {/* 有药指示灯 */}
      <mesh position={[0, BIN.LAMP_Y, 0]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial
          color={binHasDrug ? VISUAL.LAMP_YELLOW : VISUAL.LAMP_DARK}
          emissive={binHasDrug ? VISUAL.LAMP_YELLOW : '#000000'}
          emissiveIntensity={2}
        />
      </mesh>
      {/* 仓内药片（平放，颜色按来源药仓） */}
      {entries.map((mag, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <mesh
            key={`bin_pill_${i}`}
            position={[-0.055 + col * 0.055, T + PILL_H / 2 + SURFACE_GAP, -0.07 + row * 0.045]}
            castShadow
          >
            <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 12]} />
            <meshStandardMaterial color={VISUAL.PILL_COLOR[mag]} metalness={0.15} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}
