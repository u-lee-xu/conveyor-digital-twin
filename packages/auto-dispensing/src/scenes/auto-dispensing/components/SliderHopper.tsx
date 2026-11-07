import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  SLIDER_SIZE, SLIDER_DETAIL, SURFACE_GAP,
  ROTARY_BODY, ROTARY_DISC, ROTARY_CENTER, ROTARY_STANDOFF,
  HOPPER, HOPPER_BRACKET_TH, HOPPER_FOOT_GAP,
} from '../constants';
import {
  PIVOT_LOCAL, HOPPER_SIDE_FACE_LOCAL, DISC_BODY_OFFSET, HOPPER_AXIAL_OFFSET,
  rotaryAngleRad,
} from '../rotaryPivot';
import { materials } from '../../../components/scene/shared/materials';
import { Hopper } from './Hopper';

const SD = SLIDER_DETAIL;
/** 丝杆 / 导轨轴线相对滑块底面的高度（滑块局部坐标） */
const AXLE_Y = SLIDER_SIZE[1] / 2;
/** 滑块座贴在 ±X 端面外侧，中心 X */
const CARRIAGE_X = SLIDER_SIZE[0] / 2 + SD.CARRIAGE_T / 2;
/**
 * 上/下压板厚度与外扩量。
 * 旧版压板底面与滑块本体顶面（或底面）完全共面 → 从上下看会斑驳闪烁。
 * 现在压板「一半嵌进本体、一半露在外面」：朝内的贴合面被本体遮住不可见，
 * 朝外的可见面与本体面错开，彻底消除共面。
 */
const PLATE_T = 0.003;
const PLATE_OVER = 0.006;
/** 工作台面薄板顶面高度；螺纹孔开在这块板上 */
const PLATE_TOP_Y = SLIDER_SIZE[1] + PLATE_T - SURFACE_GAP / 2;

/**
 * 直线轴承滑块座（真实模组一只导轨上前后各一只，共 4 只）。
 * 方形导轨窗口 + 上下塑料端盖/刮油片 + 四颗固定螺栓 + 黄铜润滑脂嘴。
 * 位置完全由 SLIDER_DETAIL 推导，导轨中心与机架 FRAME.TRACK_Z 同源。
 */
function Carriage({ sideX, sideZ }: { sideX: number; sideZ: number }) {
  const cx = sideX * CARRIAGE_X;
  const cz = sideZ * SD.RAIL_Z;
  const faceX = sideX * (SLIDER_SIZE[0] / 2 + SD.CARRIAGE_T + SURFACE_GAP);

  return (
    <group>
      <mesh position={[cx, AXLE_Y, cz]} castShadow material={materials.sleeve}>
        <boxGeometry args={[SD.CARRIAGE_T, SD.CARRIAGE_H, SD.CARRIAGE_D]} />
      </mesh>
      {/* 上下端盖 + 刮油片（比座体略宽，形成可见层次） */}
      {[-1, 1].map((s) => (
        <mesh
          key={`end-${s}`}
          position={[cx, AXLE_Y + s * (SD.CARRIAGE_H / 2 + 0.002 - SURFACE_GAP / 2), cz]}
          material={materials.darkMetal}
        >
          <boxGeometry args={[SD.CARRIAGE_T + 0.002, 0.004, SD.CARRIAGE_D + 0.002]} />
        </mesh>
      ))}
      {/* 端面方形导轨窗口：方轨必须配方孔，不再是圆棒时代的圆环 */}
      <mesh position={[faceX, AXLE_Y, cz]} material={materials.profileSlot}>
        <boxGeometry args={[0.001, 2 * SD.RAIL_HALF * 1.05, 2 * SD.RAIL_HALF * 0.85 * 1.05]} />
      </mesh>
      {/* 四颗安装螺栓（圆柱轴沿 X） */}
      {[-1, 1].flatMap((dy) => [-1, 1].map((dz) => (
        <mesh
          key={`cb-${dy}-${dz}`}
          position={[
            sideX * (SLIDER_SIZE[0] / 2 + SD.CARRIAGE_T + SURFACE_GAP),
            AXLE_Y + dy * SD.CARRIAGE_BOLT_DY,
            cz + dz * SD.CARRIAGE_BOLT_DZ,
          ]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.endCap}
        >
          <cylinderGeometry args={[SD.CARRIAGE_BOLT_R, SD.CARRIAGE_BOLT_R, 0.002, 8]} />
        </mesh>
      )))}
      {/* 润滑脂嘴：从座体外侧面沿 X 伸出 */}
      <mesh
        position={[
          sideX * (SLIDER_SIZE[0] / 2 + SD.CARRIAGE_T + SD.GREASE_NIPPLE_L / 2),
          AXLE_Y + SD.CARRIAGE_H * 0.30,
          cz,
        ]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.brass}
      >
        <cylinderGeometry args={[SD.GREASE_NIPPLE_R, SD.GREASE_NIPPLE_R, SD.GREASE_NIPPLE_L, 8]} />
      </mesh>
    </group>
  );
}

/** 滚珠螺母座：与丝杆同心的法兰 + 四螺栓 + 螺母本体 + 端部回珠器 */
function BallNut() {
  const faceX = -SLIDER_SIZE[0] / 2;
  const flangeX = faceX - SD.NUT_FLANGE_T / 2 - 0.001;
  const boltX = faceX - SD.NUT_FLANGE_T - 0.002;
  const bodyX = boltX - SD.NUT_LEN / 2;

  return (
    <group>
      <mesh position={[flangeX, AXLE_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={materials.endCap}>
        <cylinderGeometry args={[SD.NUT_FLANGE_R, SD.NUT_FLANGE_R, SD.NUT_FLANGE_T, 24]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`nb-${i}`}
            position={[boltX, AXLE_Y + Math.cos(a) * SD.NUT_BOLT_PITCH, Math.sin(a) * SD.NUT_BOLT_PITCH]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.darkMetal}
          >
            <cylinderGeometry args={[SD.NUT_BOLT_R, SD.NUT_BOLT_R, 0.002, 8]} />
          </mesh>
        );
      })}
      <mesh position={[bodyX, AXLE_Y, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.sleeve}>
        <cylinderGeometry args={[SD.NUT_BODY_R, SD.NUT_BODY_R, SD.NUT_LEN, 24]} />
      </mesh>
      {/* 端部密封圈 / 回珠器 */}
      <mesh
        position={[bodyX - SD.NUT_LEN / 2 - 0.002, AXLE_Y, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={materials.darkMetal}
      >
        <cylinderGeometry args={[SD.NUT_BODY_R * 0.92, SD.NUT_BODY_R * 0.92, 0.004, 20]} />
      </mesh>
    </group>
  );
}

/** 工作台面 4 × 2 螺纹孔阵列（暗孔 + 亮银沉孔环） */
function TopHolePattern() {
  // 暗孔与沉孔环都离台面一个 SURFACE_GAP，并用贴面材质兜底抗闪烁
  const y = PLATE_TOP_Y + SURFACE_GAP;
  return (
    <group>
      {SD.TOP_HOLE_ROWS.flatMap((row) => SD.TOP_HOLE_COLS.map((col) => {
        const x = (col / 1.5) * SD.TOP_HOLE_X;
        const z = row * SD.TOP_HOLE_Z;
        return (
          <group key={`hole-${row}-${col}`} position={[x, y, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={materials.profileSlot}>
              <circleGeometry args={[SD.TOP_HOLE_R, 12]} />
            </mesh>
            <mesh position={[0, SURFACE_GAP, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.decal}>
              <ringGeometry args={[SD.TOP_HOLE_R, SD.TOP_HOLE_R * 1.5, 12]} />
            </mesh>
          </group>
        );
      }))}
    </group>
  );
}

/**
 * 侧面型号铭牌：只用对称蚀刻刻线 + 铆点，不写可读文字。
 * 整机镜像是 X 负缩放，写中文/英文都会被反成镜像字，因此这里用纯纹理。
 */
function SideNameplate() {
  const z = -SLIDER_SIZE[2] / 2 - SURFACE_GAP;
  return (
    <group position={[0, AXLE_Y + 0.018, z]}>
      <mesh material={materials.darkMetal}>
        <boxGeometry args={[SD.PLATE_W, SD.PLATE_H, 0.001]} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <mesh
          key={`etch-${i}`}
          position={[0.004, i * SD.PLATE_H * 0.26, -SURFACE_GAP]}
          material={materials.decal}
        >
          <boxGeometry args={[SD.PLATE_W * 0.70, 0.0012, 0.0004]} />
        </mesh>
      ))}
      <mesh position={[-SD.PLATE_W * 0.40, 0, -SURFACE_GAP]} material={materials.brass}>
        <boxGeometry args={[0.005, 0.005, 0.0004]} />
      </mesh>
    </group>
  );
}

/**
 * 滑块 + 旋转气缸 + 取药料斗
 *
 * 参考件 ATEC HRQ10（包内 旋转气缸.png）：扁平铝主体，输出法兰盘直径约主体宽度 48%，
 * 气管接头在 -X 侧。本设备为承托放大后的取药料斗，把盘径放宽到主体宽度的 92%
 * （见 constants.ts），仍保持「斗略大于盘」的装配观感。
 * 参考件平放时盘朝 +Y；本设备把气缸**侧立**安装，
 * 使盘面朝观众(+Z)、输出轴沿 Z，料斗才能绕水平轴翻转 90° 倒药。
 *
 * 装配链（沿 +Z 由后到前）：
 *   滑块 → 安装支座 → 气缸主体 → 法兰盘端面 → 料斗 -Z 侧面
 *
 * 【共同旋转基准】法兰盘端面中心点与料斗 -Z 侧面中心点精确重合（PIVOT_LOCAL）。
 * 圆盘与料斗是同一个旋转 group 的子节点，共用同一个角度；
 * angle 0→1 对应 0°→-90°：
 *   - angle=0：开口朝 +Y（接药）
 *   - angle=1：开口朝 +X（朝取药仓倒药）
 * 料斗几何中心相对基准只有 +Z 方向的 HOPPER.D/2（旋转轴方向），
 * 因此旋转全过程 XY 偏心恒为 0、Z 不变，既不公转也不产生附加平移。
 *
 * 局部原点 = 滑块底面中心（ASSEMBLY.sliderHopper 给出世界位姿，X 由 store 动态覆盖）。
 * 组件内不含世界坐标：丝杆/导轨从滑块中心穿过，局部高度即 SLIDER_SIZE[1]/2。
 * 所有尺寸取自 constants.ts 的 ROTARY_* / HOPPER_*，与药片飞行落点共用同一组常量。
 */
export function SliderHopper() {
  const angle = useDispensingStore((s) => s.tiltCyl.angle);

  const { W: BODY_W, H: BODY_H, D: BODY_D } = ROTARY_BODY;
  const { R: DISC_R, TH: DISC_TH } = ROTARY_DISC;

  return (
    <group>
      {/* ===== 滑台工作台：本体 + 上/下压板 + 侧面 T 槽 ===== */}
      <mesh position={[0, SLIDER_SIZE[1] / 2, 0]} castShadow material={materials.slider}>
        <boxGeometry args={SLIDER_SIZE} />
      </mesh>
      {/* 上台面薄板：底边嵌进本体、顶面露出，不再与本体顶面共面 */}
      <mesh
        position={[0, SLIDER_SIZE[1] + PLATE_T / 2 - SURFACE_GAP / 2, 0]}
        castShadow
        material={materials.endCap}
      >
        <boxGeometry args={[SLIDER_SIZE[0] + PLATE_OVER, PLATE_T, SLIDER_SIZE[2] + PLATE_OVER]} />
      </mesh>
      {/* 下压板：底边露在本体底面之外、顶边嵌进本体，两朝外面都错开 */}
      <mesh position={[0, -PLATE_T / 2 + SURFACE_GAP / 2, 0]} material={materials.darkMetal}>
        <boxGeometry args={[SLIDER_SIZE[0] + PLATE_OVER, PLATE_T, SLIDER_SIZE[2] + PLATE_OVER]} />
      </mesh>
      {/* 两侧 T 槽（沿 X 通长）：Y 在滑块中部，与上下压板不重叠，外贴 SURFACE_GAP */}
      {[-1, 1].map((s) => (
        <mesh
          key={`tslot-${s}`}
          position={[0, AXLE_Y - 0.024, s * (SLIDER_SIZE[2] / 2 + SURFACE_GAP)]}
          material={materials.profileSlot}
        >
          <boxGeometry args={[SLIDER_SIZE[0] - 0.012, 0.008, 0.001]} />
        </mesh>
      ))}
      <TopHolePattern />
      <SideNameplate />

      {/* 旧版「滑块底部缺口」是一块与本体同材质、外侧面正好落在本体侧面上的方块，
          除了制造共面深度竞争没有任何可见效果，已移除。 */}

      {/* 丝杆通孔环（±X 端面中心）；两条导轨孔改由滑块座的方形窗口承担 */}
      {[-1, 1].map((side) => (
        <mesh
          key={`axle-hole-${side}`}
          position={[side * (SLIDER_SIZE[0] / 2 + SURFACE_GAP), AXLE_Y, 0]}
          rotation={[0, Math.PI / 2, 0]}
          material={materials.sleeve}
        >
          <torusGeometry args={[0.034, 0.005, 8, 20]} />
        </mesh>
      ))}

      {/* 四只直线轴承滑块座（±X × ±Z），中间 z=0 留给滚珠螺母 */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <Carriage key={`car-${sx}-${sz}`} sideX={sx} sideZ={sz} />
      )))}
      <BallNut />

      {/* 安装支座：把上移后的气缸主体重新锚在滑块 +Z 侧面上。
          两端各嵌入实体 SURFACE_GAP，接触面藏在实体内部：既不悬空留缝，
          也不会与滑块侧面 / 气缸背面共面闪烁。 */}
      <mesh
        position={[0, ROTARY_CENTER.Y, SLIDER_SIZE[2] / 2 + ROTARY_STANDOFF / 2]}
        material={materials.darkMetal}
      >
        <boxGeometry args={[BODY_W * 0.7, BODY_H * 0.55, ROTARY_STANDOFF + 2 * SURFACE_GAP]} />
      </mesh>

      {/* ===== 旋转气缸（侧立：盘面朝 +Z，输出轴沿 Z） ===== */}
      <group position={[0, ROTARY_CENTER.Y, ROTARY_CENTER.Z]}>

        {/* 主体：扁平铝块（X 宽 / Y 高 / Z 厚） */}
        <mesh castShadow material={materials.endCap}>
          <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
        </mesh>

        {/* 上下端盖缝（参考件三层叠装铝块） */}
        {[-1, 1].map((side) => (
          <mesh key={`cap_${side}`} position={[0, side * (BODY_H / 2 - 0.006), 0]} material={materials.darkMetal}>
            <boxGeometry args={[BODY_W + 2 * SURFACE_GAP, 0.003, BODY_D + 2 * SURFACE_GAP]} />
          </mesh>
        ))}

        {/* 顶面安装孔 ×4（侧立后顶面 = +Y，圆柱轴默认沿 Y，无需旋转） */}
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh
            key={`mount_${sx}_${sz}`}
            position={[sx * BODY_W * 0.34, BODY_H / 2 + SURFACE_GAP, sz * BODY_D * 0.28]}
            material={materials.magSwitch}
          >
            <cylinderGeometry args={[0.005, 0.005, 0.0015, 10]} />
          </mesh>
        )))}

        {/* 气管接头 ×2（-X 侧，沿 X 伸出；侧立不改变 X 方向） */}
        {[-1, 1].map((side) => (
          <group key={`pipe_${side}`} position={[-BODY_W / 2, side * 0.016, 0]}>
            <mesh position={[-0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.brass}>
              <cylinderGeometry args={[0.005, 0.005, 0.024, 10]} />
            </mesh>
            <mesh position={[-0.004, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.brass}>
              <cylinderGeometry args={[0.009, 0.009, 0.008, 6]} />
            </mesh>
            <mesh position={[0.002, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.darkMetal}>
              <cylinderGeometry args={[0.011, 0.011, 0.006, 12]} />
            </mesh>
          </group>
        ))}

        {/* 磁性开关 ×2（顶面 +Y，靠近输出盘一侧） */}
        {[-1, 1].map((sz) => (
          <mesh key={`mag_${sz}`} position={[BODY_W * 0.22, BODY_H / 2 + 0.004, sz * BODY_D * 0.25]} material={materials.magSwitch}>
            <boxGeometry args={[0.020, 0.007, 0.010]} />
          </mesh>
        ))}

        {/* ===== 共同旋转基准：盘端面中心 = 料斗 -Z 侧面中心 =====
            圆盘与料斗共用这一个 group、这一个角度；料斗不再相对盘心挂到 Y 偏移上 */}
        <group position={PIVOT_LOCAL} rotation={[0, 0, rotaryAngleRad(angle)]}>
          {/* 盘体：整体沿 -Z 让位半盘厚，使盘「前端面」精确落在基准点上 */}
          <group position={DISC_BODY_OFFSET}>
            {/* cylinder 默认轴沿 Y，转 90° 后轴沿 Z（盘面朝 +Z） */}
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={materials.endCap}>
              <cylinderGeometry args={[DISC_R, DISC_R, DISC_TH, 32]} />
            </mesh>

            {/* 盘缘刻度环：torus 法线默认 +Z；贴面错开并用 decal 兜底 */}
            <mesh position={[0, 0, DISC_TH / 2 + SURFACE_GAP]} material={materials.decal}>
              <torusGeometry args={[DISC_R - 0.002, 0.0015, 8, 48]} />
            </mesh>

            {/* 刻度线 ×12（贴在盘面、位于料斗侧壁投影之后，不产生共面竞争） */}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return (
                <mesh
                  key={`scl_${i}`}
                  position={[Math.cos(a) * (DISC_R - 0.006), Math.sin(a) * (DISC_R - 0.006), DISC_TH / 2 + SURFACE_GAP]}
                  rotation={[0, 0, a]}
                  material={materials.decalDark}
                >
                  <boxGeometry args={[0.001, 0.005, 0.0015]} />
                </mesh>
              );
            })}

            {/* 盘面螺栓孔 ×8 */}
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
              const r = DISC_R * 0.66;
              return (
                <mesh
                  key={`bolt_${i}`}
                  position={[Math.cos(a) * r, Math.sin(a) * r, DISC_TH / 2 + SURFACE_GAP]}
                  material={materials.decalDark}
                >
                  <circleGeometry args={[0.0035, 12]} />
                </mesh>
              );
            })}
          </group>

          {/* 四颗夹紧螺栓：斗放大后投影会盖住盘心区域，故移到盘缘上下各两颗，
              角度/半径保证 |y| 大于斗半高、r 仍在盘径内，既可见又不越出盘面 */}
          {[75, 105, 255, 285].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const r = DISC_R * 0.94;
            return (
              <mesh
                key={`brk_${deg}`}
                position={[Math.cos(a) * r, Math.sin(a) * r, HOPPER_BRACKET_TH / 4]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.darkMetal}
              >
                <cylinderGeometry args={[0.0035, 0.0035, HOPPER_BRACKET_TH / 2, 8]} />
              </mesh>
            );
          })}

          {/* 斗底托板：贴着料斗底面下方，与料斗同属一个旋转 group */}
          <mesh
            position={[0, -HOPPER.H / 2 - HOPPER_FOOT_GAP / 2 - SURFACE_GAP, HOPPER_AXIAL_OFFSET[2] + SURFACE_GAP]}
            material={materials.flange}
          >
            <boxGeometry args={[HOPPER.W * 0.9, HOPPER_FOOT_GAP, HOPPER.D]} />
          </mesh>

          {/* 取药料斗：局部原点就是 -Z 侧面中心，直接挂在共同基准上，零额外偏移 */}
          <group position={HOPPER_SIDE_FACE_LOCAL}>
            <Hopper />
          </group>
        </group>
      </group>
    </group>
  );
}
