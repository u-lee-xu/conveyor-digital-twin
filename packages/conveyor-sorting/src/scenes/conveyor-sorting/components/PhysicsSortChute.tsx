import { useDeviceStore, type SortedItem } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { SORT_CHUTE, type SortSlot, SURFACE_GAP } from '../constants';
import {
  CHUTE_PLATE, CHUTE_PLATE_ROTATION, BIN_CENTER_Z, BIN_REST_Y, sortSlotX, chuteSurfaceY,
} from '../sortChute';

/**
 * 分拣斜槽 + 收集盒（参照自动配药「斜槽 → 取药仓」的落料语言）。
 *
 * 在途工件由 sortChute.ts 的脚本轨迹驱动（kinematic），不依赖斜面碰撞，
 * 这样既不会和推板穿模，也不会因为斜面求解抖动而卡住；收集盒仍带
 * 轴对齐固定碰撞体，保持物理世界的完整性。
 *
 * 观感约定：槽面是亮银钢板 + 窄导向线 + 横向防滑压条，不能铺成整条黑带；
 * 收集盒靠观察者的一侧做低唇口、盒内底面压暗一档，才能读出「空心容器」。
 */
function CollectedBlocks({ items }: { items: SortedItem[] }) {
  return (
    <group>
      {items.map((item, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3) % 2;
        const layer = Math.floor(idx / 6);
        return (
          <mesh
            key={item.id}
            geometry={geometries.material}
            material={item.color === 'blue' ? materials.materialBlue : materials.materialBlack}
            position={[
              (col - 1) * 0.115,
              BIN_REST_Y - SORT_CHUTE.BIN_FLOOR_Y + layer * 0.145,
              (row - 0.5) * 0.16,
            ]}
          />
        );
      })}
    </group>
  );
}

/** 槽面横向防滑压条：沿斜面等距分布，用来打破整片平面、读出下滑方向 */
function ChuteCleats() {
  const { length } = CHUTE_PLATE;
  const y = SORT_CHUTE.PLATE_T / 2 + SORT_CHUTE.CLEAT_T / 2 + SURFACE_GAP * 2;
  return (
    <group>
      {Array.from({ length: SORT_CHUTE.CLEAT_COUNT }, (_, i) => (
        <mesh
          key={i}
          position={[0, y, -length / 2 + ((i + 1) * length) / (SORT_CHUTE.CLEAT_COUNT + 1)]}
          material={materials.decal}
        >
          <boxGeometry args={[
            SORT_CHUTE.HALF_W * 2 - 0.012,
            SORT_CHUTE.CLEAT_T,
            SORT_CHUTE.CLEAT_D,
          ]} />
        </mesh>
      ))}
    </group>
  );
}

function ChuteUnit({ slot, items }: { slot: SortSlot; items: SortedItem[] }) {
  const x = sortSlotX(slot);
  const wallX = SORT_CHUTE.HALF_W + SORT_CHUTE.WALL_T / 2;
  const plateTop = SORT_CHUTE.PLATE_T / 2;
  const rimY = plateTop + SORT_CHUTE.WALL_H + SURFACE_GAP;

  return (
    <group position={[x, 0, 0]}>
      {/* 斜槽：底板 + 两侧挡边 + 压条共用一个旋转组，保证细节始终贴在槽面上 */}
      <group position={CHUTE_PLATE.center} rotation={CHUTE_PLATE_ROTATION}>
        <mesh material={materials.chutePlate}>
          <boxGeometry args={[SORT_CHUTE.HALF_W * 2, SORT_CHUTE.PLATE_T, CHUTE_PLATE.length]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * wallX, plateTop + SORT_CHUTE.WALL_H / 2 - SURFACE_GAP, 0]}
            material={materials.base}
          >
            <boxGeometry args={[SORT_CHUTE.WALL_T, SORT_CHUTE.WALL_H, CHUTE_PLATE.length]} />
          </mesh>
        ))}
        {/* 挡边顶端亮银包边 */}
        {[-1, 1].map((side) => (
          <mesh
            key={`rail-${side}`}
            position={[side * wallX, rimY, 0]}
            material={materials.decal}
          >
            <boxGeometry args={[SORT_CHUTE.WALL_T * 1.8, SORT_CHUTE.BIN_RIM_T, CHUTE_PLATE.length]} />
          </mesh>
        ))}
        {/* 中央窄导向线：只占极小宽度，不再把整条槽涂黑 */}
        <mesh
          position={[0, plateTop + SURFACE_GAP / 2, 0]}
          material={materials.profileSlot}
        >
          <boxGeometry args={[
            SORT_CHUTE.GUIDE_HALF_W * 2,
            SURFACE_GAP,
            CHUTE_PLATE.length - 0.06,
          ]} />
        </mesh>
        <ChuteCleats />
      </group>

      {/* 槽口与槽尾的加强端板：高度与轨迹用的槽面函数同源 */}
      {[SORT_CHUTE.ENTRY_Z, SORT_CHUTE.EXIT_Z].map((z) => (
        <mesh
          key={z}
          position={[0, chuteSurfaceY(z) - SORT_CHUTE.PLATE_T / 2 - 0.012, z]}
          material={materials.decal}
        >
          <boxGeometry args={[SORT_CHUTE.HALF_W * 2 + SORT_CHUTE.WALL_T * 2, 0.012, 0.018]} />
        </mesh>
      ))}

      {/* 收集盒：暗色内底 + 三面高壁 + 靠观察者的低唇口 + 四边亮银包边 */}
      <group position={[0, SORT_CHUTE.BIN_FLOOR_Y, BIN_CENTER_Z]}>
        <mesh material={materials.binInterior}>
          <boxGeometry args={[SORT_CHUTE.BIN_HALF_X * 2, SORT_CHUTE.WALL_T, SORT_CHUTE.BIN_HALF_Z * 2]} />
        </mesh>
        {([-1, 1] as const).map((side) => {
          const h = side < 0 ? SORT_CHUTE.BIN_FRONT_WALL_H : SORT_CHUTE.BIN_WALL_H;
          return (
            <mesh
              key={`wall-z-${side}`}
              position={[0, h / 2, side * SORT_CHUTE.BIN_HALF_Z]}
              material={materials.base}
            >
              <boxGeometry args={[SORT_CHUTE.BIN_HALF_X * 2, h, SORT_CHUTE.WALL_T]} />
            </mesh>
          );
        })}
        {[-1, 1].map((side) => (
          <mesh
            key={`wall-x-${side}`}
            position={[side * SORT_CHUTE.BIN_HALF_X, SORT_CHUTE.BIN_WALL_H / 2, 0]}
            material={materials.base}
          >
            <boxGeometry args={[SORT_CHUTE.WALL_T, SORT_CHUTE.BIN_WALL_H, SORT_CHUTE.BIN_HALF_Z * 2]} />
          </mesh>
        ))}
        {([-1, 1] as const).map((side) => {
          const h = side < 0 ? SORT_CHUTE.BIN_FRONT_WALL_H : SORT_CHUTE.BIN_WALL_H;
          return (
            <mesh
              key={`rim-z-${side}`}
              position={[0, h + SORT_CHUTE.BIN_RIM_T / 2 + SURFACE_GAP, side * SORT_CHUTE.BIN_HALF_Z]}
              material={materials.decal}
            >
              <boxGeometry args={[
                SORT_CHUTE.BIN_HALF_X * 2 + SORT_CHUTE.WALL_T * 2,
                SORT_CHUTE.BIN_RIM_T,
                SORT_CHUTE.WALL_T * 1.8,
              ]} />
            </mesh>
          );
        })}
        {[-1, 1].map((side) => (
          <mesh
            key={`rim-x-${side}`}
            position={[
              side * SORT_CHUTE.BIN_HALF_X,
              SORT_CHUTE.BIN_WALL_H + SORT_CHUTE.BIN_RIM_T / 2 + SURFACE_GAP,
              SORT_CHUTE.BIN_HALF_Z / 2,
            ]}
            material={materials.decal}
          >
            <boxGeometry args={[
              SORT_CHUTE.WALL_T * 1.8,
              SORT_CHUTE.BIN_RIM_T,
              SORT_CHUTE.BIN_HALF_Z,
            ]} />
          </mesh>
        ))}
        <CollectedBlocks items={items} />

        {/* 盒体固定碰撞体（轴对齐，物料走脚本轨迹不依赖它，但保持物理完整） */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[SORT_CHUTE.BIN_HALF_X, SORT_CHUTE.WALL_T / 2, SORT_CHUTE.BIN_HALF_Z]} />
          {([-1, 1] as const).map((side) => {
            const h = side < 0 ? SORT_CHUTE.BIN_FRONT_WALL_H : SORT_CHUTE.BIN_WALL_H;
            return (
              <CuboidCollider
                key={`col-z-${side}`}
                args={[SORT_CHUTE.BIN_HALF_X, h / 2, SORT_CHUTE.WALL_T / 2]}
                position={[0, h / 2, side * SORT_CHUTE.BIN_HALF_Z]}
              />
            );
          })}
          {[-1, 1].map((side) => (
            <CuboidCollider
              key={`col-x-${side}`}
              args={[SORT_CHUTE.WALL_T / 2, SORT_CHUTE.BIN_WALL_H / 2, SORT_CHUTE.BIN_HALF_Z]}
              position={[side * SORT_CHUTE.BIN_HALF_X, SORT_CHUTE.BIN_WALL_H / 2, 0]}
            />
          ))}
        </RigidBody>
      </group>
    </group>
  );
}

export function PhysicsSortChute() {
  const sortedItems = useDeviceStore((s) => s.sortedItems);

  return (
    <group>
      {SORT_CHUTE.SLOTS.map((slot) => (
        <ChuteUnit key={slot} slot={slot} items={sortedItems.filter((item) => item.slot === slot)} />
      ))}
    </group>
  );
}
