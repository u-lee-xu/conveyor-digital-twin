import * as THREE from 'three';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  PILL_R, PILL_H, PILL_STACK_STEP, MAG_CAPACITY,
  MAG_TUBE_OUTER_R, MAG_TUBE_H,
  CHUTE_EXIT_Z, UNIT,
  FEED_CYL_Z, FEED_CYL_LEN, FEED_CYL_R, FEED_ROD_R, FEED_PUSH_TH,
  FEED_PUSH_Z0, CYL_FEED_STROKE,
  SURFACE_GAP, CHUTE_RAIL,
  VISUAL, type MagazineId,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/** 磁性开关亮态材质（模块级复用，避免每帧新建） */
const MSC_ON = new THREE.MeshStandardMaterial({
  color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.5, roughness: 0.4,
});

interface CylState {
  extended: boolean;
  position: number;
}

/**
 * 部件：单个供药单元（料筒 + 推药气缸 + 托板 + 落料斜槽）。
 *
 * 局部原点 = 托板上表面中心，y=0 即世界 CHUTE_Y，+Y 向上、+Z 为出药方向。
 * 世界位姿由 MAGAZINE_ASSEMBLY[mag] 给出；组件内不含任何世界坐标。
 *
 * 接口面（局部坐标，供装配层/几何自检对齐）：
 *   托板上表面 y=0；最底药片中心 (0, PILL_H/2, 0)
 *   出药口 (0, PILL_H/2, CHUTE_EXIT_Z)
 *   底座底面 y = UNIT.PEDESTAL_Y - UNIT.PEDESTAL_H/2（接到托架横梁中心面）
 */
/**
 * 料筒内药片堆：最底一片随推杆移出，上层药片逐层下落补位。
 *
 * dispensed 是与物理刚体共用的「本行程已出药」真值（store.dispensed[mag]）：
 * 出药后（伸到位 / 缩缸途中）最底一片已交给刚体，这里不再画它，
 * 其余药片保持已补位的正常堆叠；否则缩缸时 push 归零会让药片倒退回料筒。
 * 未伸到位就缩回时 dispensed 仍为 false，药片随推板正常退回，不会凭空消失。
 */
function PillStack({ mag, count, cyl, dispensed }: {
  mag: MagazineId; count: number; cyl: CylState; dispensed: boolean;
}) {
  const n = Math.min(Math.max(count, 0), MAG_CAPACITY);
  if (n === 0) return null;
  const pill = (key: string, y: number, z: number) => (
    <mesh key={key} position={[0, y, z]} castShadow>
      <cylinderGeometry args={[PILL_R, PILL_R, PILL_H, 14]} />
      <meshStandardMaterial color={VISUAL.PILL_COLOR[mag]} metalness={0.15} roughness={0.5} />
    </mesh>
  );

  if (dispensed) {
    return (
      <group>
        {Array.from({ length: n }, (_, i) =>
          pill(`stack_${i}`, UNIT.PILL_Y + i * PILL_STACK_STEP, 0),
        )}
      </group>
    );
  }

  const push = cyl.extended ? cyl.position : 0;
  // 底层药片完全离开料筒后，上层才开始下落（避免与底层穿模）
  const drop = Math.min(1, Math.max(0, (push - 0.45) / 0.55));
  return (
    <group>
      {pill('bottom', UNIT.PILL_Y, CHUTE_EXIT_Z * push)}
      {Array.from({ length: n - 1 }, (_, i) =>
        pill(`up_${i}`, UNIT.PILL_Y + (i + 1 - drop) * PILL_STACK_STEP, 0),
      )}
    </group>
  );
}

/** 推药气缸：圆筒缸体 + 端盖 + 活塞杆 + 平推板，轴线严格对准最底药片中心 */
function FeedCylinder({ cyl }: { cyl: CylState }) {
  // 推板前表面 Z：从「贴住药片」到「把药片顶出托板」
  const plateFront = FEED_PUSH_Z0 + CYL_FEED_STROKE * cyl.position;
  const plateCenterZ = plateFront - FEED_PUSH_TH / 2;
  const rodEndZ = plateFront - FEED_PUSH_TH;
  const rodLen = rodEndZ - FEED_CYL_Z;
  const rodCenterZ = (FEED_CYL_Z + rodEndZ) / 2;
  const bodyCenterZ = FEED_CYL_Z - FEED_CYL_LEN / 2;
  const switches = [
    { z: FEED_CYL_Z - FEED_CYL_LEN * 0.2, on: cyl.extended, key: 'front' },
    { z: FEED_CYL_Z - FEED_CYL_LEN * 0.8, on: !cyl.extended, key: 'back' },
  ];

  return (
    <group position={[0, UNIT.PILL_Y, 0]}>
      {/* 缸体（cylinder 默认轴沿 Y，转 90° 后轴沿 Z） */}
      <mesh position={[0, 0, bodyCenterZ]} rotation={[Math.PI / 2, 0, 0]} castShadow material={materials.cylinderBody}>
        <cylinderGeometry args={[FEED_CYL_R, FEED_CYL_R, FEED_CYL_LEN, 16]} />
      </mesh>
      {/* 前后端盖 */}
      {[FEED_CYL_Z, FEED_CYL_Z - FEED_CYL_LEN].map((z) => (
        <mesh key={`cap_${z}`} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} material={materials.endCap}>
          <cylinderGeometry args={[FEED_CYL_R + 0.003, FEED_CYL_R + 0.003, 0.008, 16]} />
        </mesh>
      ))}
      {/* 缸体鞍座：把圆筒气缸固定到料筒托架横梁上 */}
      <mesh
        position={[0, -FEED_CYL_R - UNIT.FEED_SADDLE_H / 2, bodyCenterZ]}
        castShadow
        material={materials.sleeve}
      >
        <boxGeometry args={[FEED_CYL_R * 2.4, UNIT.FEED_SADDLE_H, FEED_CYL_LEN * 0.8]} />
      </mesh>
      {/* 活塞杆（从缸体前端面一直伸到推板背面，长度随行程变化） */}
      <mesh position={[0, 0, rodCenterZ]} rotation={[Math.PI / 2, 0, 0]} material={materials.cylinderRod}>
        <cylinderGeometry args={[FEED_ROD_R, FEED_ROD_R, rodLen, 10]} />
      </mesh>
      {/* 平推板：下沿离托板上表面 SURFACE_GAP，不再与托板顶面共面闪烁 */}
      <mesh position={[0, SURFACE_GAP, plateCenterZ]} castShadow material={materials.darkMetal}>
        <boxGeometry args={[PILL_R * 1.8, PILL_H + 0.002, FEED_PUSH_TH]} />
      </mesh>
      {/* 气管接头 ×2（缸体上方，沿 +Y） */}
      {[0.25, 0.75].map((f) => (
        <mesh key={`air_${f}`} position={[0, FEED_CYL_R + 0.008, FEED_CYL_Z - FEED_CYL_LEN * f]} material={materials.brass}>
          <cylinderGeometry args={[0.005, 0.005, 0.014, 8]} />
        </mesh>
      ))}
      {/* 磁性开关 ×2（缸体侧面，伸出位 / 退回位） */}
      {switches.map((sw) => (
        <mesh key={`msc_${sw.key}`} position={[-FEED_CYL_R - 0.003, 0, sw.z]} material={sw.on ? MSC_ON : materials.magSwitch}>
          <boxGeometry args={[0.006, 0.012, 0.020]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 落料斜槽：从托板出口斜向下延伸到料斗开口后缘上方（每个供药单元各一条）。
 *
 * 旧版挡边外沿与底板外沿同为 ±TRAY_W/2、挡边底面又正好落在底板中心线上，
 * 两个旋转后的朝外平面完全共面 → 斜槽底板/侧边一闪闪地穿模。
 * 现在挡边外沿向外错开 CHUTE_RAIL.OUT、底面高于底板顶面 CHUTE_RAIL.RISE；
 * 视觉与 physicsGeometry 的侧导轨碰撞体共用同一组常量，药片仍被真实挡住。
 */
function ChuteRamp() {
  const R = CHUTE_RAIL;
  const rampTopY = UNIT.RAMP_MID_Y + R.RAMP_T / 2;
  const railCenterX = UNIT.TRAY_W / 2 - R.T / 2 + R.OUT;
  const railCenterY = rampTopY + R.RISE + R.H / 2;
  return (
    <group>
      <mesh
        position={[0, UNIT.RAMP_MID_Y, UNIT.RAMP_MID_Z]}
        rotation={[UNIT.RAMP_ANGLE, 0, 0]}
        castShadow
        material={materials.brightSilver}
      >
        <boxGeometry args={[UNIT.TRAY_W, R.RAMP_T, UNIT.RAMP_LEN]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`rail_${side}`}
          position={[side * railCenterX, railCenterY, UNIT.RAMP_MID_Z]}
          rotation={[UNIT.RAMP_ANGLE, 0, 0]}
          material={materials.sleeve}
        >
          <boxGeometry args={[R.T, R.H, UNIT.RAMP_LEN]} />
        </mesh>
      ))}
    </group>
  );
}

export function MagazineUnit({ mag }: { mag: MagazineId }) {
  const stock = useDispensingStore((s) => s.magStock[mag]);
  const magEmpty = useDispensingStore((s) => s.sensors.magEmpty[mag]);
  const cyl = useDispensingStore((s) => s.sendCyl[mag]);
  const dispensed = useDispensingStore((s) => s.dispensed[mag]);
  return (
    <group>
      {/* 料筒安装底座：下接托架横梁、上托托板 */}
      <mesh position={[0, UNIT.PEDESTAL_Y, 0]} castShadow material={materials.darkMetal}>
        <cylinderGeometry args={[MAG_TUBE_OUTER_R + 0.004, MAG_TUBE_OUTER_R + 0.004, UNIT.PEDESTAL_H, 16]} />
      </mesh>
      {/* 托板前伸段支撑 */}
      <mesh
        position={[0, UNIT.TRAY_SUPPORT_Y, (MAG_TUBE_OUTER_R + UNIT.TRAY_Z1) / 2]}
        castShadow
        material={materials.sleeve}
      >
        <boxGeometry args={[UNIT.TRAY_W * 0.8, UNIT.TRAY_SUPPORT_H, UNIT.TRAY_Z1 - MAG_TUBE_OUTER_R]} />
      </mesh>

      {/* 竖直料筒（半透明，可看到内部药片堆） */}
      <mesh position={[0, UNIT.TUBE_CY, 0]} castShadow>
        <cylinderGeometry args={[MAG_TUBE_OUTER_R, MAG_TUBE_OUTER_R, MAG_TUBE_H, 20, 1, true]} />
        <meshStandardMaterial
          color={VISUAL.MAG_COLOR[mag]}
          transparent
          opacity={0.26}
          roughness={0.15}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 底部色标环（水平圆环） */}
      <mesh position={[0, UNIT.RING_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[MAG_TUBE_OUTER_R + 0.002, 0.004, 8, 20]} />
        <meshStandardMaterial color={VISUAL.MAG_COLOR[mag]} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* 顶盖 */}
      <mesh position={[0, UNIT.CAP_Y, 0]} castShadow material={materials.endCap}>
        <cylinderGeometry args={[MAG_TUBE_OUTER_R + 0.004, MAG_TUBE_OUTER_R + 0.004, 0.014, 16]} />
      </mesh>

      {/* 料筒内药片堆（最底一片随推杆移出） */}
      <PillStack mag={mag} count={stock} cyl={cyl} dispensed={dispensed} />

      {/* 底部托板：推杆把最底一片沿此板推出 */}
      <mesh
        position={[0, UNIT.TRAY_Y, (UNIT.TRAY_Z0 + UNIT.TRAY_Z1) / 2]}
        castShadow
        material={materials.brightSilver}
      >
        <boxGeometry args={[UNIT.TRAY_W, 0.006, UNIT.TRAY_Z1 - UNIT.TRAY_Z0]} />
      </mesh>

      {/* 推杆入口槽（-Z 侧）/ 出药槽上下唇（+Z 侧，做成开口不挡药片） */}
      <mesh position={[0, UNIT.PILL_Y, -MAG_TUBE_OUTER_R - SURFACE_GAP]} material={materials.darkMetal}>
        <boxGeometry args={[PILL_R * 2.2, PILL_H + 0.006, 0.002]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`lip_${side}`}
          position={[0, UNIT.PILL_Y + side * (PILL_H / 2 + 0.003), MAG_TUBE_OUTER_R + SURFACE_GAP]}
          material={materials.darkMetal}
        >
          <boxGeometry args={[PILL_R * 2.4, 0.002, 0.004]} />
        </mesh>
      ))}

      {/* 空仓指示灯 */}
      <mesh position={[MAG_TUBE_OUTER_R + 0.030, UNIT.EMPTY_LAMP_Y, 0]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial
          color={magEmpty ? VISUAL.LAMP_RED : VISUAL.LAMP_DARK}
          emissive={magEmpty ? VISUAL.LAMP_RED : '#000000'}
          emissiveIntensity={2}
        />
      </mesh>

      <FeedCylinder cyl={cyl} />
      <ChuteRamp />
    </group>
  );
}
