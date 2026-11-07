import * as THREE from 'three';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  HOPPER, PILL_R, PILL_H, PILL_STACK_STEP, VISUAL,
  HOPPER_PILL_COLS, HOPPER_PILL_ROWS, HOPPER_PILL_CAPACITY,
  HOPPER_PILL_PITCH_X, HOPPER_PILL_PITCH_Z,
} from '../constants';
import { expandHopperStock } from '../hopperContents';
import { hopperPanels, HOPPER_PILL_SEAT_GAP } from '../hopperPanels';
import { materials } from '../../../components/scene/shared/materials';

/**
 * 取药料斗：5 面板矩形容器 + 上口四根翻边，直接锁在旋转气缸法兰盘端面上。
 *
 * 局部原点 = 料斗 -Z 侧面（安装侧壁）外表面中心点，
 * 与旋转气缸法兰盘端面中心精确重合，是两者的共同旋转基准。
 * 所有网格统一沿 +Z 让位 HOPPER.D/2，因此料斗几何中心只在旋转轴方向偏移，
 * 绕 Z 翻转时既不偏心也不产生附加平移。
 * +Y 为开口（angle=0 朝上接药），-Y 为底面。
 * 法兰盘绕 Z 轴转 -90° 后，开口朝 +X（朝取药仓倒药）。
 *
 * 板件不再在组件里现算尺寸：全部走 hopperPanels() 的榫接尺寸表，
 * 保证相邻板只相接、不互相穿入，也没有同向共面的可见面（防闪烁 / 穿模）。
 * 该表同时是 physicsGeometry.ts 落斗碰撞体的唯一来源。
 */
export function Hopper() {
  const hopperPills = useDispensingStore((s) => s.hopperPills);
  const hopperStock = useDispensingStore((s) => s.hopperStock);
  const panels = hopperPanels();

  /**
   * 斗内药片：按来源台账轮转交错展开，再按内腔容量排成 COLS × ROWS × LAYERS。
   * 容量由 HOPPER / PILL_* 推导（放大料斗会自动多放几粒），不再写死「最多 4 粒」；
   * 超过几何容量的部分只在状态面板里计数，不凭空堆出斗口。
   * 轮转的目的是让俯视可见的顶层同时出现多个仓的颜色：按仓分组时灌满 16 粒
   * 会让顶层整整一层都是 D 仓，看起来像「只装了一种药」。
   */
  const stockCount = Object.values(hopperStock).reduce((n, v) => n + v, 0);
  // 轮转交错展开：顶层一眼能看出多个仓的药，而不是整层同色
  const byMag = expandHopperStock(hopperStock, Math.max(hopperPills - stockCount, 0));
  const shown = Math.min(byMag.length, HOPPER_PILL_CAPACITY);
  // 底板顶面 + 微小净空，避免药片底盖与底板顶面精确共面闪烁
  const bottomY = -HOPPER.H / 2 + HOPPER.T + HOPPER_PILL_SEAT_GAP + PILL_H / 2;
  const perLayer = HOPPER_PILL_COLS * HOPPER_PILL_ROWS;

  return (
    <group>
      {/* 局部原点落在 -Z 侧面中心，网格整体前移半个斗深即回到原来的几何中心 */}
      <group position={[0, 0, HOPPER.D / 2]}>
        {/* 底板 / 四壁 / 上口翻边：尺寸全部来自同一张榫接尺寸表 */}
        {panels.map((p) => (
          <mesh
            key={p.key}
            position={p.center}
            castShadow={p.role === 'wall'}
            material={p.role === 'rim' ? materials.endCap : materials.hopper}
          >
            <boxGeometry args={p.size} />
          </mesh>
        ))}

        {/* 斗内药片（随料斗一起翻转，倒药时由 store 清空） */}
        {Array.from({ length: shown }, (_, i) => {
          const layer = Math.floor(i / perLayer);
          const rem = i % perLayer;
          const col = rem % HOPPER_PILL_COLS;
          const row = Math.floor(rem / HOPPER_PILL_COLS);
          return (
            <mesh
              key={`pill_${i}`}
              position={[
                (col - (HOPPER_PILL_COLS - 1) / 2) * HOPPER_PILL_PITCH_X,
                bottomY + layer * PILL_STACK_STEP,
                (row - (HOPPER_PILL_ROWS - 1) / 2) * HOPPER_PILL_PITCH_Z,
              ]}
              castShadow
            >
              <cylinderGeometry args={[PILL_R * 0.85, PILL_R * 0.85, PILL_H, 12]} />
              <meshStandardMaterial
                color={VISUAL.PILL_COLOR[byMag[i]]}
                metalness={0.15}
                roughness={0.55}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
