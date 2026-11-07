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
 * 与上一版的关键差别：斜槽不再只有可见网格，而是带**真实静态碰撞体**的
 * 物理斜面（底板 + 两侧挡边）。工件离带后由 Rapier 的 dynamic 刚体在重力 /
 * 摩擦 / 碰撞下自行滑落，姿态自然贴着槽面，不再靠脚本平移。
 *
 * 槽口朝 +Z（传送带方向）延伸一小段引导挡板并外张成喇叭口，
 * 对应工厂里「推料气缸把工件送进滑槽」的导流结构。
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

/**
 * 斜槽静态碰撞体：整体绕 X 轴旋转到与可见槽面完全相同的角度。
 * 底板半厚、挡边位置都由 SORT_CHUTE 推导，与可见几何严格同源。
 */
function ChuteColliders() {
  const wallX = SORT_CHUTE.HALF_W + SORT_CHUTE.WALL_T / 2;
  const wallY = SORT_CHUTE.PLATE_T / 2 + SORT_CHUTE.WALL_H / 2 - SURFACE_GAP;
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={CHUTE_PLATE.center}
      rotation={CHUTE_PLATE_ROTATION}
    >
      {/* 碰撞体向下加厚、顶面上抬量与可见槽板一致：接触求解更稳，
          又不会把工件顶到看得见的板面上方 */}
      <CuboidCollider
        args={[SORT_CHUTE.HALF_W, SORT_CHUTE.COLLIDER_HALF_T, CHUTE_PLATE.length / 2]}
        position={[0, SORT_CHUTE.PLATE_T / 2 - SORT_CHUTE.COLLIDER_HALF_T, 0]}
        friction={SORT_CHUTE.CHUTE_FRICTION}
      />
      {[-1, 1].map((side) => (
        <CuboidCollider
          key={side}
          args={[SORT_CHUTE.WALL_T / 2, SORT_CHUTE.WALL_H / 2, CHUTE_PLATE.length / 2]}
          position={[side * wallX, wallY, 0]}
          friction={SORT_CHUTE.CHUTE_FRICTION}
        />
      ))}
    </RigidBody>
  );
}

/**
 * 进口引导挡板：从槽口朝传送带方向延伸 GUIDE_LEN，末端外张成喇叭口。
 * 直段带固定碰撞体；末端喇叭片很短，只做视觉导流，避免和沿 X 输送的
 * 带面工件发生不必要的碰撞。
 */
function GuideRails() {
  const C = SORT_CHUTE;
  const wallX = C.HALF_W + C.WALL_T / 2;
  const centerY = C.GUIDE_BOTTOM_Y + C.GUIDE_H / 2;
  const straightZ = C.ENTRY_Z + C.GUIDE_LEN / 2;
  const flareStartZ = C.ENTRY_Z + C.GUIDE_LEN;
  const flareX = Math.sin(C.GUIDE_FLARE_ANGLE);
  const flareZ = Math.cos(C.GUIDE_FLARE_ANGLE);

  return (
    <>
      {[-1, 1].map((side) => (
        <group key={`guide-${side}`}>
          <mesh
            position={[side * wallX, centerY, straightZ]}
            material={materials.base}
          >
            <boxGeometry args={[C.WALL_T, C.GUIDE_H, C.GUIDE_LEN]} />
          </mesh>
          <mesh
            position={[side * wallX, centerY + C.GUIDE_H / 2 + SURFACE_GAP, straightZ]}
            material={materials.decal}
          >
            <boxGeometry args={[C.WALL_T * 1.8, C.BIN_RIM_T, C.GUIDE_LEN]} />
          </mesh>
          {/* 喇叭口：末端向外张开，把推板送来的工件收进槽道 */}
          <mesh
            position={[
              side * (wallX + (C.GUIDE_FLARE_LEN / 2) * flareX),
              centerY,
              flareStartZ + (C.GUIDE_FLARE_LEN / 2) * flareZ,
            ]}
            rotation={[0, side * C.GUIDE_FLARE_ANGLE, 0]}
            material={materials.base}
          >
            <boxGeometry args={[C.WALL_T, C.GUIDE_H, C.GUIDE_FLARE_LEN]} />
          </mesh>
          <mesh
            position={[
              side * (wallX + (C.GUIDE_FLARE_LEN / 2) * flareX),
              centerY + C.GUIDE_H / 2 + SURFACE_GAP,
              flareStartZ + (C.GUIDE_FLARE_LEN / 2) * flareZ,
            ]}
            rotation={[0, side * C.GUIDE_FLARE_ANGLE, 0]}
            material={materials.decal}
          >
            <boxGeometry args={[C.WALL_T * 1.8, C.BIN_RIM_T, C.GUIDE_FLARE_LEN]} />
          </mesh>
          {/* 与输送线侧梁连接的安装脚 */}
          <mesh
            position={[side * wallX, C.GUIDE_BOTTOM_Y - 0.012, flareStartZ - 0.02]}
            material={materials.darkMetal}
          >
            <boxGeometry args={[C.WALL_T * 2.6, 0.024, 0.04]} />
          </mesh>
        </group>
      ))}
      <RigidBody type="fixed" colliders={false}>
        {[-1, 1].map((side) => (
          <CuboidCollider
            key={`guide-col-${side}`}
            args={[C.WALL_T / 2, C.GUIDE_H / 2, C.GUIDE_LEN / 2]}
            position={[side * wallX, centerY, straightZ]}
            friction={C.CHUTE_FRICTION}
          />
        ))}
      </RigidBody>
    </>
  );
}

function ChuteUnit({ slot, items }: { slot: SortSlot; items: SortedItem[] }) {
  const x = sortSlotX(slot);
  const wallX = SORT_CHUTE.HALF_W + SORT_CHUTE.WALL_T / 2;
  const plateTop = SORT_CHUTE.PLATE_T / 2;
  const rimY = plateTop + SORT_CHUTE.WALL_H + SURFACE_GAP;
  const binWallHeight = (side: number) =>
    (side < 0 ? SORT_CHUTE.BIN_FRONT_WALL_H : SORT_CHUTE.BIN_BACK_WALL_H);

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

      {/* 真实物理斜面 + 进口引导挡板（可见结构与碰撞体同源） */}
      <ChuteColliders />
      <GuideRails />

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

      {/* 收集盒：暗色内底 + 两侧高壁 + 前后低唇口 + 四边亮银包边 */}
      <group position={[0, SORT_CHUTE.BIN_FLOOR_Y, BIN_CENTER_Z]}>
        <mesh material={materials.binInterior}>
          <boxGeometry args={[SORT_CHUTE.BIN_HALF_X * 2, SORT_CHUTE.WALL_T, SORT_CHUTE.BIN_HALF_Z * 2]} />
        </mesh>
        {([-1, 1] as const).map((side) => {
          const h = binWallHeight(side);
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
          const h = binWallHeight(side);
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

        {/* 盒体固定碰撞体（工件到底后切回 kinematic 入盒，这里保持物理完整） */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[SORT_CHUTE.BIN_HALF_X, SORT_CHUTE.WALL_T / 2, SORT_CHUTE.BIN_HALF_Z]} />
          {([-1, 1] as const).map((side) => {
            const h = binWallHeight(side);
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
