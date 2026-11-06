import * as THREE from 'three';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import { HOPPER, PILL_R, PILL_H, VISUAL } from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/**
 * 取药料斗：5 面板矩形容器，通过连接支架固定在旋转气缸法兰盘上。
 *
 * 局部原点 = 料斗几何中心（由 SliderHopper 的 HOPPER_LOCAL_Y/Z 挂到法兰盘上）。
 * +Y 为开口（angle=0 朝上接药），-Y 为底面。
 * 法兰盘绕 Z 轴转 -90° 后，开口朝 +X（朝取药仓倒药）。
 * 尺寸全部取自 constants.ts 的 HOPPER，与 SliderHopper 的支架、
 * SceneContent 的药片飞行落点共用同一组常量。
 */
export function Hopper() {
  const hopperPills = useDispensingStore((s) => s.hopperPills);
  const { W, H, D, T } = HOPPER;

  /** 斗内药片：平放堆叠（圆柱轴沿 Y），最多示意 4 粒，准确数量看状态面板 */
  const shown = Math.min(Math.max(hopperPills, 0), 4);
  const bottomY = -H / 2 + T + PILL_H / 2;
  const colors = [VISUAL.PILL_COLOR.A, VISUAL.PILL_COLOR.B, VISUAL.PILL_COLOR.C, VISUAL.PILL_COLOR.D];

  return (
    <group>
      {/* 底板（-Y 面） */}
      <mesh position={[0, -H / 2, 0]} castShadow material={materials.hopper}>
        <boxGeometry args={[W, T, D]} />
      </mesh>

      {/* 前壁（+Z）/ 后壁（-Z） */}
      {[1, -1].map((side) => (
        <mesh key={`z_${side}`} position={[0, 0, side * (D / 2 - T / 2)]} castShadow material={materials.hopper}>
          <boxGeometry args={[W, H, T]} />
        </mesh>
      ))}

      {/* 左壁（-X）/ 右壁（+X） */}
      {[-1, 1].map((side) => (
        <mesh key={`x_${side}`} position={[side * (W / 2 - T / 2), 0, 0]} castShadow material={materials.hopper}>
          <boxGeometry args={[T, H, D]} />
        </mesh>
      ))}

      {/* 上口翻边：亮银，明确标出开口方向 */}
      {[1, -1].map((sz) => (
        <mesh key={`rim_z_${sz}`} position={[0, H / 2, sz * (D / 2 - T / 2)]} material={materials.endCap}>
          <boxGeometry args={[W + T, T * 0.7, T]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`rim_x_${sx}`} position={[sx * (W / 2 - T / 2), H / 2, 0]} material={materials.endCap}>
          <boxGeometry args={[T, T * 0.7, D - T * 2]} />
        </mesh>
      ))}

      {/* 斗内药片（随料斗一起翻转，倒药时由 store 清空） */}
      {Array.from({ length: shown }, (_, i) => (
        <mesh
          key={`pill_${i}`}
          position={[i % 2 === 0 ? -0.004 : 0.004, bottomY + i * (PILL_H + 0.002), 0]}
          castShadow
        >
          <cylinderGeometry args={[PILL_R * 0.85, PILL_R * 0.85, PILL_H, 12]} />
          <meshStandardMaterial
            color={colors[i % colors.length]}
            metalness={0.15}
            roughness={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
