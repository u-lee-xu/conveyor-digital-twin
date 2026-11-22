/**
 * 部件级 3D 组件：每个部件在自身局部原点独立建模，组装层只摆放。
 * 可见几何全部取自 MOTOR_GEOM；相邻可见面沿法向错开 GAP，禁止精确共面。
 * 状态色通过切换共享材质单例实现，绝不逐帧改颜色。
 *
 * 拟真要点（第二轮重构）：
 *  - 电机侧装于主动滚筒外侧，轴线沿 Z 与滚筒同轴，带法兰 / 减速箱 / 联轴器关系；
 *  - 输送线用铝挤型侧梁 + T 槽 + 端封板 + 支腿地脚 + 环形皮带 + 端部大滚筒；
 *  - 柜体为落地柜，实体门打开，柜内 DIN 导轨 / 走线槽 / 端子排 / 配线完整；
 *  - 按钮与指示灯移到独立琴式斜面操作台，与柜内元件空间分离，消除视觉冲突。
 */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isViewerRuntime } from '@digital-twin/shared';
import { LABEL_COLORS } from '@digital-twin/shared/styles/industrialVisual';
import {
  GAP, MOTOR_GEOM as G, MOTOR_ASSEMBLY, MOTOR_CABINET_LAYOUT, MOTOR_VISUAL, DUCT_INNER_SPAN,
  KM_SCREW_RECESS, KM_TERMINAL_ROWS,
  MOTOR_CAMERA_GOALS, MOTOR_PART_STAGE_GOALS, MOTOR_BUTTON_LABELS,
  motorBoxOffset, type Vec3, type MotorPartKind, type MotorButtons,
} from '../../constants/motorConstants';
import { useMotorStore } from '../../stores/useMotorStore';
import { useMotorViewStore } from '../../stores/useMotorViewStore';
import {
  MOTOR_MATERIALS as M, motorLampMaterial, MOTOR_BUTTON_COLORS,
  type MotorLampKind,
} from '../shared/motorMaterials';

/** 三维标签 chip：配色来自项目视觉令牌，字号比旧版更小、不压住元件 */
export function MotorLabel({ text, position, color = 'blue', small = false, dataKey }: {
  text: string; position: Vec3; color?: string; small?: boolean; dataKey?: string;
}) {
  const c = LABEL_COLORS[color] ?? LABEL_COLORS.gray;
  return (
    <Html position={position} center zIndexRange={[1, 0]}>
      <div
        {...(dataKey ? { 'data-dt-3d-button': dataKey, 'data-dt-3d-label': dataKey } : {})}
        style={{
          padding: small ? '1px 5px' : '2px 7px', borderRadius: 5,
          fontSize: small ? 9 : 10, fontWeight: 500,
          border: `1px solid ${c.border}`, backgroundColor: c.bg, color: c.text,
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>{text}</div>
    </Html>
  );
}

/** 端子螺钉：沿 Z 从元件正面凸出的黄铜小圆柱 */
function Screw({ position, r = 0.009 }: { position: Vec3; r?: number }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} material={M.brass}>
      <cylinderGeometry args={[r, r, 0.012, 10]} />
    </mesh>
  );
}

/**
 * 十字槽接线螺钉：实物 NC5 / JR36 的端子头都很大且带一字/十字槽。
 * 第三十轮：新增 mat 参数，FR 用绿铜色大螺钉（用户实物照镀层色），默认仍银色。
 *
 * 第四十三轮：recessed 分支专供 KM 的真凹孔。本体正面已开出六个方孔（孔底
 * 退进 recessDepth），这里只负责把银色十字头沉在孔底：四块扇形片组成圆形
 * 轮廓、片间真缝露出深色孔底；白框与孔底都由本体前脸框架提供，不再叠在这里。
 * FR 不传 recessed，仍走原来的凸头节奏，不受影响。
 */
function CrossScrew({ position, r = 0.011, mat = M.terminalSilver, recessed = false }: {
  position: Vec3; r?: number; mat?: THREE.Material; recessed?: boolean;
}) {
  if (recessed) {
    const half = r * 0.95;
    const headThickness = GAP * 1.5;
    const headZ = KM_SCREW_RECESS.headFront - headThickness / 2;
    return (
      <group position={position}>
        {/* 银色十字头：四块扇形片组成圆形外轮廓，片间的真缝露出孔底 */}
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={`head-${i}`} position={[0, 0, headZ]} rotation={[Math.PI / 2, 0, 0]} material={mat}>
            <cylinderGeometry args={[half, half, headThickness, 10, 1, false,
              i * Math.PI / 2 + KM_SCREW_RECESS.slotAngle / 2,
              Math.PI / 2 - KM_SCREW_RECESS.slotAngle]} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mat}>
        <cylinderGeometry args={[r, r, 0.006, 16]} />
      </mesh>
      <mesh position={[0, 0, GAP * 2]} material={M.cavityDark}>
        <boxGeometry args={[r * 1.15, r * 0.2, 0.002]} />
      </mesh>
      <mesh position={[0, 0, GAP * 3]} material={M.cavityDark}>
        <boxGeometry args={[r * 0.2, r * 1.15, 0.002]} />
      </mesh>
    </group>
  );
}

/* ==================== 柜内电器元件（照实物照片程序化重画） ==================== */

/**
 * 定稿：QF / KM1·KM2 / FU / FR 全部照用户提供的实物照片用 three.js 基础几何重画，
 * 不再挂载 STEP GLB。尺寸、方向、装配关系完全可控，根除 GLB 几何超出柜内空间
 * 造成的穿插；相邻可见面仍按 GAP 错开，状态色用共享材质单例二选一。
 */

/**
 * 上下三相接线端子：深色端子孔 + 螺钉，全部错开 GAP 避免共面。
 * cross=true 时换成实物那种「大银色十字槽螺钉」（KM 上端子 / FR 六端子）；
 * offsetX 让热继的三极区可以偏离壳体中心，给左侧标签与右侧旋钮让位。
 */
function TerminalRow({ y, width, count, face, r = 0.011, cross = false, offsetX = 0, crossMat, recessed = false }: {
  y: number; width: number; count: number; face: number;
  r?: number; cross?: boolean; offsetX?: number; crossMat?: THREE.Material; recessed?: boolean;
}) {
  const step = width / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} position={[offsetX + (i - (count - 1) / 2) * step, y, 0]}>
          <mesh position={[0, 0, face + GAP]} rotation={[Math.PI / 2, 0, 0]} material={M.cavityDark}>
            <cylinderGeometry args={[r, r, 0.005, 12]} />
          </mesh>
          {cross ? (
            /* 沉孔螺钉的 z 层级从端子块前脸起算，不能再整体前移 GAP*4 */
            <CrossScrew position={[0, 0, face + (recessed ? 0 : GAP * 4)]}
              r={r * 0.82} mat={crossMat} recessed={recessed} />
          ) : (
            <mesh position={[0, 0, face + GAP * 3]} rotation={[Math.PI / 2, 0, 0]} material={M.terminalSilver}>
              <cylinderGeometry args={[r * 0.62, r * 0.62, 0.004, 10]} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

/** 底部 DIN 卡扣：两侧各一片，不与壳体底面共面 */
function DinClips({ width, depth }: { width: number; depth: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * width * 0.36, -0.008, 0]} material={M.darkMetal}>
          <boxGeometry args={[0.026, 0.016, depth * 0.8]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * QF 照 NXB-63G 实物照片重画：三极并排白壳、上下各三颗接线端子、
 * 横贯三极的蓝色推杆 + 三道白色联动卡箍。OFF 在下、推上去 ON；
 * 3D 点击走 store.setQf 上电 / 断电，观众只读端不响应。
 */
export function Breaker({ closed, labelY = -0.062 }: { closed: boolean; labelY?: number }) {
  const Q = G.QF;
  const z = Q.d / 2 + GAP;
  const face = z + 0.008;
  const poleW = Q.w / Q.poles;
  const toggleQf = () => {
    if (isViewerRuntime()) return;
    const store = useMotorStore.getState();
    store.setQf(!store.qfClosed);
  };
  const resetCursor = () => { document.body.style.cursor = ''; };
  return (
    <group>
      {Array.from({ length: Q.poles }, (_, i) => (
        <mesh key={`pole-${i}`} position={[(i - (Q.poles - 1) / 2) * poleW, Q.h / 2, 0]}
          material={M.poleWhite}>
          <boxGeometry args={[poleW - GAP, Q.h, Q.d]} />
        </mesh>
      ))}
      <TerminalRow y={Q.h - 0.017} width={Q.w} count={Q.poles} face={face} />
      <TerminalRow y={0.017} width={Q.w} count={Q.poles} face={face} />
      {/* 正面型号印字窄条：让到蓝杆上方，避免合闸行程加大后压住印字 */}
      <mesh position={[0, Q.h * 0.76, face + 0.002]} material={M.poleWhite}>
        <boxGeometry args={[Q.w * 0.92, Q.h * 0.09, 0.003]} />
      </mesh>
      {/* 蓝色推杆 + 三道白色联动卡箍：OFF 0.30h、ON 0.58h，行程 0.0462 为原来的两倍 */}
      <group position={[0, Q.h * (closed ? 0.58 : 0.3), face + 0.018]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={M.handleBlue}>
          <cylinderGeometry args={[0.013, 0.013, Q.w * 0.92, 14]} />
        </mesh>
        {Array.from({ length: Q.poles }, (_, i) => (
          <mesh key={i} position={[(i - (Q.poles - 1) / 2) * poleW, 0, 0]} material={M.poleWhite}>
            <boxGeometry args={[poleW * 0.22, 0.028, 0.028]} />
          </mesh>
        ))}
      </group>
      <DinClips width={Q.w} depth={Q.d} />
      {/* 放大透明热区：点一下上电 / 断电 */}
      <mesh position={[0, Q.h / 2, z + 0.03]}
        onPointerDown={(e) => { e.stopPropagation(); toggleQf(); }}
        onPointerOver={() => {
          if (!isViewerRuntime()) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={resetCursor}>
        <boxGeometry args={[Q.w, Q.h, 0.04]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <MotorLabel text="QF" position={[0, labelY, Q.d / 2 + 0.02]} color="blue" small dataKey="qf" />
    </group>
  );
}

/** FU 照 NRT28-63 3P 实物照片重画：三极连体浅灰座 + 每极上下接线螺钉 + 可翻盖 */
export function FuseBank({ labelY = -0.062 }: { labelY?: number }) {
  const F = G.FU;
  const face = F.baseD / 2 + GAP;
  const totalW = F.spacing * (F.count - 1) + F.baseW;
  return (
    <group>
      <mesh position={[0, F.baseH / 2, 0]} material={M.fuseBase}>
        <boxGeometry args={[totalW, F.baseH, F.baseD]} />
      </mesh>
      {Array.from({ length: F.count }, (_, i) => (
        <group key={i} position={[(i - (F.count - 1) / 2) * F.spacing, 0, 0]}>
          {i > 0 && (
            <mesh position={[-F.spacing / 2, F.baseH / 2, face]} material={M.poleLip}>
              <boxGeometry args={[0.003, F.baseH * 0.9, 0.003]} />
            </mesh>
          )}
          <Screw position={[0, F.baseH - 0.02, face + 0.006]} r={0.009} />
          <Screw position={[0, 0.02, face + 0.006]} r={0.009} />
          {/* 可翻起白色盖板 + 铭牌条 */}
          <mesh position={[0, F.baseH * 0.56, face + 0.006]} material={M.poleWhite}>
            <boxGeometry args={[F.baseW * 0.86, F.baseH * 0.42, 0.012]} />
          </mesh>
          <mesh position={[0, F.baseH * 0.56, face + 0.013]} material={M.poleLip}>
            <boxGeometry args={[F.baseW * 0.58, 0.008, 0.003]} />
          </mesh>
        </group>
      ))}
      <DinClips width={totalW} depth={F.baseD} />
      <MotorLabel text="FU" position={[0, labelY, F.baseD / 2 + 0.02]} color="yellow" small />
    </group>
  );
}

/**
 * KM 照 NC5-0911 实物照片精修后按用户要求做减法：只保留顶部深灰 DIN 背板、
 * 左右侧板薄片、上/下各三相前凸端子块（银色十字槽螺钉 + 深色导线圆孔）、
 * 辅助触点小窗与吸合状态灯。铭牌、前凸线圈盖、衔铁横条 / 深灰衔铁块 /
 * 三组主触点已全部去掉。第十四轮按实物照片补回「中部衔铁连接件」：
 * 一条深色滑槽 + 一个灰色方块，吸合时方块沿槽往接触器底部下沉；
 * 吸合状态由「灯亮灭 + 方块下沉」两处表达，两台之间仍无机械连杆。
 */
export function Contactor({ on, label, color, labelY = -0.062 }: {
  on: boolean; label: string; color: string; labelY?: number;
}) {
  const K = G.KM;
  /**
   * 第四十三轮：真凹孔。本体前脸 z=K.d/2 不再是一整块实心面，
   * 而是拆成「后段实心（前脸退到孔底）+ 前脸框架（在六个端子处留方孔）」。
   * 框仍与原始前脸 K.d/2 齐平，孔底退进 recessDepth，螺钉/圆孔全部沉在孔内。
   */
  const front = K.d / 2;
  const wellFloor = front - K.recessDepth;
  /** 前盖已去掉：辅助窗与吸合灯仍贴在壳体原始正面，避免悬浮 */
  const faceDetailZ = front + GAP * 2;
  const poleW = K.w / 3;
  const holeW = poleW - GAP * 2;
  const holeCenters = [-1, 0, 1].map((i) => i * poleW);
  /** 前脸框架的竖条：由三列方孔的左右边界补出，不用硬编码四个坐标 */
  const strips: Array<[number, number]> = [];
  let cursor = -K.w / 2;
  for (const cx of holeCenters) {
    const left = cx - holeW / 2;
    if (left - cursor > 1e-9) strips.push([cursor, left]);
    cursor = cx + holeW / 2;
  }
  if (K.w / 2 - cursor > 1e-9) strips.push([cursor, K.w / 2]);
  /**
   * 第四十四轮：端子槽朝外开口。上排槽顶延伸到壳体顶（f + frameEdgeH/2），
   * 下排槽底延伸到壳体底（f − frameEdgeH/2）；靠边的白色横带整条删除，
   * 深色孔底与白色竖条一起延伸到边缘 —— 竖条即相邻螺钉间的灭弧格栅。
   */
  const bandCenters = K.bandCenters;
  const slotH = K.h * (K.bandH + K.frameEdgeH);
  const slotCenterY = (f: number) => K.h * (f + (f > 0.5 ? K.frameEdgeH / 2 : -K.frameEdgeH / 2));
  const frameZ = front - K.recessDepth / 2;
  /** 实物 NC5 以白色壳体为主：深灰 DIN 背板 / 侧板只露薄边，不能做成夹住正面的大墙 */
  const backPlateZ = -K.d * 0.25;
  const backPlateFront = backPlateZ + K.d * 0.42 / 2;
  return (
    <group>
      {/* 本体后段：实心，前脸退到孔底；完整保留背面与四侧，几何与碰撞同源 */}
      <mesh position={[0, K.h / 2, -K.recessDepth / 2]} material={M.poleWhite}>
        <boxGeometry args={[K.w, K.h, K.d - K.recessDepth]} />
      </mesh>
      {/* 前脸框架：中间横带 + 端子槽间的白色竖条（灭弧格栅，含左右外侧细边）。
          第四十四轮删掉上/下两条靠边横带，上排槽口朝壳体顶、下排槽口朝壳体底，
          形成导线插入口；竖条与孔底都延伸到壳体边缘，槽仍保持真凹。 */}
      <mesh position={[0, K.h * 0.5, frameZ]} material={M.poleWhite}>
        <boxGeometry args={[K.w, K.h * (1 - 2 * K.bandH - 2 * K.frameEdgeH), K.recessDepth]} />
      </mesh>
      {bandCenters.flatMap((f, bi) => strips.map(([x0, x1], si) => (
        <mesh key={`face-strip-${bi}-${si}`} position={[(x0 + x1) / 2, slotCenterY(f), frameZ]} material={M.poleWhite}>
          <boxGeometry args={[x1 - x0, slotH, K.recessDepth]} />
        </mesh>
      )))}
      {/* 六个导线槽的深色底：贴在后段前脸上，从边缘延伸到螺钉区，十字缝与圆孔都露出这一层 */}
      {bandCenters.flatMap((f, bi) => holeCenters.map((cx, hi) => (
        <mesh key={`well-${bi}-${hi}`} position={[cx, slotCenterY(f), wellFloor + GAP / 2]} material={M.cavityDark}>
          <boxGeometry args={[holeW, slotH, GAP]} />
        </mesh>
      )))}
      {/* 顶部深灰 DIN 安装背板：只在白色壳体上方露一条薄边，带两只长圆安装孔 */}
      <mesh position={[0, K.h + K.backPlateGap + K.backPlateH / 2, backPlateZ]}
        material={M.cavityDark}>
        <boxGeometry args={[K.w * 1.06, K.backPlateH, K.d * 0.42]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`din-hole-${s}`}
          position={[s * K.w * 0.3, K.h + K.backPlateGap + K.backPlateH / 2, backPlateFront + GAP]}
          material={M.darkMetal}>
          <boxGeometry args={[0.014, 0.006, 0.003]} />
        </mesh>
      ))}
      {/* 左右深灰侧板：薄片，斜视时只露一条窄边 */}
      {[-1, 1].map((s) => (
        <mesh key={`side-${s}`}
          position={[s * (K.w / 2 + K.sidePlateW / 2 + GAP), K.h * 0.52, K.d * 0.3]}
          material={M.cavityDark}>
          <boxGeometry args={[K.sidePlateW, K.h * 0.86, K.d * 0.22]} />
        </mesh>
      ))}
      {/* 每极「沉孔十字螺钉 + 导线圆孔」上下镜像：下排由上排派生，face 传孔底，全部沉进本体 */}
      {KM_TERMINAL_ROWS.map((row) => (
        <TerminalRow key={row.band + row.y} y={K.h * row.y} width={K.w} count={3} face={wellFloor}
          r={K.terminalPortR * row.rFactor} cross={row.cross} recessed />
      ))}
      {/* 辅助触点小窗（实物 21NC / 13NO 位置）：右侧小方立柱不得电黑、得电绿 */}
      <mesh position={[K.w * 0.33, K.h * 0.665, faceDetailZ]} material={M.contactorUpper}>
        <boxGeometry args={[K.w * 0.16, 0.024, 0.004]} />
      </mesh>
      <mesh position={[K.w * 0.33, K.h * 0.665, faceDetailZ + GAP * 2]}
        material={motorLampMaterial('forward', on)}>
        <boxGeometry args={[0.008, 0.008, 0.002]} />
      </mesh>
      {/*
        第四十五轮：中部灰色方块 + 黑色圆柱改成动作指示 —— 沿 z 进出，
        与螺钉凹陷同向：释放时凸出 base，吸合时缩进行程 travel（几乎贴平本体前脸）。
        两者同进同退像一个联动衔铁；圆柱恒黑不发光，绿光改由右侧小方立柱承担。
      */}
      <mesh position={[0, K.h * 0.46, faceDetailZ]} material={M.cavityDark}>
        <boxGeometry args={[K.w * 0.3, K.h * 0.24, 0.003]} />
      </mesh>
      <mesh position={[0, K.h * 0.46,
        faceDetailZ + K.actionBlockBase - (on ? K.actionTravel : 0)]} material={M.poleLip}>
        <boxGeometry args={[K.w * 0.22, K.h * 0.09, K.actionBlockD]} />
      </mesh>
      <mesh position={[0, K.h * 0.65,
        faceDetailZ + K.actionPinBase - (on ? K.actionTravel : 0)]}
        rotation={[Math.PI / 2, 0, 0]} material={M.cavityDark}>
        <cylinderGeometry args={[0.007, 0.007, K.actionPinD, 12]} />
      </mesh>
      <DinClips width={K.w} depth={K.d} />
      <MotorLabel text={label} position={[0, labelY, K.d / 2 + 0.02]} color={color} small />
    </group>
  );
}

/**
 * FR 第三十三轮照用户指正改朝向与比例：**螺钉 / 旋钮操作面朝屏幕（+Z）**、
 * 站立高度压矮（0.18 → 0.078）——第三十二轮的顶面布局整体立起来变成前脸：
 * 三块深色端子块竖向贯通前脸，竖直两排大绿铜组合槽螺钉（头对头相切、十字槽
 * 朝屏幕）；右侧白色大整定旋钮轴沿 z 朝屏幕、直径 ≈ 进深，带一圈刻度与十字槽；
 * 红 STOP 方钮在螺钉区与旋钮之间靠脸顶（让开铜带），脱扣指示窗靠脸底、跳闸转红。
 * 黄铜色横带仍在脸顶。前脸元素一律从前脸（z = F.d / 2）向外逐层派生并留 GAP，
 * 绝不与前脸共面。
 */
export function ThermalRelay({ tripped, labelY = -0.062 }: { tripped: boolean; labelY?: number }) {
  const F = G.FR;
  const face = F.d / 2;
  /** 前脸凸出层次：铜带 / 端子座 → 螺钉 / 旋钮 / 红钮 / 观察窗，逐层留 GAP */
  const padD = 0.014;
  /** 端子座竖向排布：顶上让开一条铜带 */
  const padBottom = GAP * 2;
  /** 第五十一轮：顶部棕色铜带删除，端子座顶到壳顶，给上排让出空间 */
  const padTop = F.h - GAP;
  const padCY = (padBottom + padTop) / 2;
  const padH = padTop - padBottom;
  /**
   * 第四十六轮：两排螺钉留空并分层 —— 行距 = 直径 + screwRowGap，
   * 上排（s=+1）前凸 screwUpperOut、下排（s=−1）后凹 screwLowerIn；
   * 下排凹多了会整颗埋进端子块，所以后凹量只取 GAP*2。
   */
  /** 第四十八轮：螺钉放大到 terminalPortR 本身（不再 ×0.82），与 KM 同款 */
  const screwR = F.terminalPortR;
  const screwRowStep = screwR + F.screwRowGap / 2;
  const screwZ = face + GAP + padD + 0.003;
  const screwLayerZ = (s: number) => screwZ + (s > 0 ? F.screwUpperOut : -F.screwLowerIn);
  /** 红钮 / 观察窗放在端子区与旋钮之间的空档，x 居中于两者间隙 */
  const sideX = (F.poleRegionX + F.poleRegionW / 3 + F.padW / 2 + F.dialX - F.dialFaceR) / 2;
  const dialCY = F.h / 2;
  const dialZ = face + GAP + 0.006;
  const dialFront = dialZ + 0.006;
  /** 铜带删除后 STOP 钮贴壳顶 */
  const stopY = F.h - GAP - F.stopH / 2;
  const windowY = F.h * 0.36;
  return (
    <group>
      {/* 立地矮身主体：操作面在前脸朝屏幕 */}
      <mesh position={[0, F.h / 2, 0]} material={M.darkMetal}>
        <boxGeometry args={[F.w, F.h, F.d]} />
      </mesh>
      {/* 第五十一轮：顶部棕色黄铜带按用户要求删除，端子座上缘顶到壳顶 */}
      {/*
        第四十七轮：照用户俯视实物照——每极上下各一块独立的银色金属螺钉框，
        中间由黑色横带隔断（原贯通端子块删除）；极间黑色高立筋贯通上下且比框更凸。
        两颗螺钉仍上凸下凹分两层，各自有深色座从壳体前脸托住，不会悬空。
      */}
      {[-1, 1].map((s) => {
        const rear = face + GAP;
        const frameBack = screwLayerZ(s) - F.frameD / 2;
        const seatD = frameBack - rear;
        return [-1, 0, 1].map((i) => (
          <group key={`fr-cell-${s}-${i}`}
            position={[F.poleRegionX + i * (F.poleRegionW / 3), padCY + s * screwRowStep, 0]}>
            {/* 深色座：从壳体前脸顶到银框背面，厚度随该排层差派生 */}
            <mesh position={[0, 0, rear + seatD / 2]} material={M.cavityDark}>
              <boxGeometry args={[F.frameW, F.frameH, seatD]} />
            </mesh>
            {/* 银色金属框：与座贴合，中间深色孔露出螺钉 */}
            <mesh position={[0, 0, frameBack + F.frameD / 2]} material={M.terminalSilver}>
              <boxGeometry args={[F.frameW, F.frameH, F.frameD]} />
            </mesh>
            <mesh position={[0, 0, screwLayerZ(s) + F.frameD / 2 + GAP / 2]} material={M.cavityDark}>
              <boxGeometry args={[F.frameW - F.frameRim * 2, F.frameH - F.frameRim * 2, GAP]} />
            </mesh>
            {/* 第四十八轮：配色与外形改 KM 同款——银白十字扇形片（recessed 分支） */}
            <CrossScrew position={[0, 0, screwLayerZ(s) + F.frameD / 2 + GAP]}
              r={screwR} mat={M.terminalSilver} recessed />
          </group>
        ));
      })}
      {/*
        第四十九轮：极间灭弧格栅——填满框间净空（由极距与框宽派生，不写死宽度），
        前脸与上排银框齐平、仍低于螺钉不挡十字槽；贯通上下两组框形成黑色立板。
      */}
      {[-1, 0].map((i) => (
        <mesh key={`fr-rib-${i}`}
          position={[F.poleRegionX + (i + 0.5) * (F.poleRegionW / 3), padCY,
            (face + GAP + screwLayerZ(1) - F.frameD / 2 + F.ribOut) / 2]}
          material={M.cavityDark}>
          <boxGeometry args={[(F.poleRegionW / 3 - F.frameW) * F.ribWidthRatio, padH,
            screwLayerZ(1) - F.frameD / 2 + F.ribOut - face - GAP]} />
        </mesh>
      ))}
      {/*
        第五十轮：横向灭弧格栅——**每极一段**，填在上下两排框之间，被竖隔板切断，
        与竖格栅同高（前脸齐银框）。竖横交叉把六颗螺钉分成 2×3 六格。
        首版做成一整条贯通三极，斜视像黑板压住下排框，故改为分段。
      */}
      {[-1, 0, 1].map((i) => {
        const crossFront = screwLayerZ(1) * F.crossRibFrontRatio
          + screwLayerZ(-1) * (1 - F.crossRibFrontRatio) + F.frameD / 2;
        return (
          <mesh key={`fr-cross-rib-${i}`}
            position={[F.poleRegionX + i * (F.poleRegionW / 3), padCY,
              (face + GAP + crossFront) / 2]}
            material={M.poleLip}>   {/* 第五十一轮：中灰隔离带（#9aa7b6），与深色座 / 黑竖格区分 */}
            <boxGeometry args={[F.frameW,
              2 * screwRowStep - F.frameH - F.crossRibGap * 2,
              crossFront - face - GAP]} />
          </mesh>
        );
      })}
      {/* 白色大整定旋钮：轴沿 z 朝屏幕，直径 ≈ 进深 */}
      <mesh position={[F.dialX, dialCY, dialZ]} rotation={[Math.PI / 2, 0, 0]} material={M.thermalFace}>
        <cylinderGeometry args={[F.dialFaceR, F.dialFaceR, 0.012, 24]} />
      </mesh>
      {Array.from({ length: F.tickCount }, (_, i) => {
        const a = (i / F.tickCount) * Math.PI * 2;
        return (
          <mesh key={`fr-tick-${i}`}
            position={[F.dialX + Math.cos(a) * F.dialFaceR * 0.78,
              dialCY + Math.sin(a) * F.dialFaceR * 0.78, dialFront + GAP * 2]}
            rotation={[0, 0, a]} material={M.cavityDark}>
            <boxGeometry args={[0.005, 0.0018, 0.002]} />
          </mesh>
        );
      })}
      {/* 旋钮前脸十字槽：两片槽沿 z 逐层错开（与 CrossScrew 槽片同款节奏） */}
      <mesh position={[F.dialX, dialCY, dialFront + GAP * 2]} material={M.cavityDark}>
        <boxGeometry args={[0.018, 0.0025, 0.002]} />
      </mesh>
      <mesh position={[F.dialX, dialCY, dialFront + GAP * 3]} material={M.cavityDark}>
        <boxGeometry args={[0.0025, 0.018, 0.002]} />
      </mesh>
      {/* 旋钮刻度数字 14 / 18 / 22：照实物照标注在白色盘面上 */}
      {F.dialNumbers.map((num, i) => {
        const a = (0.25 + i / F.dialNumbers.length) * Math.PI * 2;
        return <SilkText key={`fr-num-${num}`} text={num}
          position={[F.dialX + Math.cos(a) * F.dialFaceR * 0.62,
            dialCY + Math.sin(a) * F.dialFaceR * 0.62,
            dialFront + GAP * 4]} />;
      })}
      {/* 旋钮下方两组辅助触点小螺钉（实物照黄铜十字） */}
      {[-1, 1].map((s) => (
        <group key={`fr-aux-${s}`}
          position={[F.dialX + s * F.auxSpacing / 2,
            dialCY - F.dialFaceR - F.auxScrewR * 1.6,
            face + GAP + 0.006]}>
          <mesh material={M.cavityDark}>
            <boxGeometry args={[F.auxScrewR * 2.6, F.auxScrewR * 2.6, GAP]} />
          </mesh>
          <CrossScrew position={[0, 0, GAP]} r={F.auxScrewR} mat={M.terminalSilver} recessed />
        </group>
      ))}
      {/* 红 STOP 方钮：螺钉区与旋钮之间、脸顶（铜带之下） */}
      <mesh position={[sideX, stopY, face + GAP + 0.004]} material={M.stopRed}>
        <boxGeometry args={[F.stopW, F.stopH, 0.008]} />
      </mesh>
      {/* 脱扣指示窗：脸底，正常奶白、跳闸红 */}
      <mesh position={[sideX, windowY, face + GAP + 0.0015]} material={M.cavityDark}>
        <boxGeometry args={[0.02, 0.018, 0.003]} />
      </mesh>
      <mesh position={[sideX, windowY, face + GAP + 0.002]}
        material={tripped ? M.frTripped : M.thermalFace}>
        <boxGeometry args={[0.014, 0.011, 0.004]} />
      </mesh>
      <DinClips width={F.w} depth={F.d} />
      <MotorLabel text={tripped ? 'FR 跳闸' : 'FR'} position={[0, labelY, F.d / 2 + 0.02]} color="red" small />
    </group>
  );
}

/* ==================== 24V 控制侧三件套（纯视觉元件） ==================== */

/**
 * 导轨式 24V 开关电源：银灰金属网孔壳、上下两组栅栏式接线端子、DC OK 绿灯。
 * 只按 qfClosed 亮灯，不写任何 store 状态，也不进地址表 / 快照 / PLC 链路。
 */
export function SwitchingPowerSupply({ powered, labelY = -0.062 }: {
  powered: boolean; labelY?: number;
}) {
  const P = G.PSU;
  const face = P.d / 2 + GAP;
  return (
    <group>
      <mesh position={[0, P.h / 2, 0]} material={M.endCap}>
        <boxGeometry args={[P.w, P.h, P.d]} />
      </mesh>
      {/* 正面散热网孔 */}
      {Array.from({ length: P.ventCount }, (_, i) => (
        <mesh key={`psu-vent-${i}`}
          position={[0, P.h * 0.35 + i * P.h * 0.095, face]}
          material={M.cavityDark}>
          <boxGeometry args={[P.w * 0.76, 0.0035, 0.002]} />
        </mesh>
      ))}
      <mesh position={[0, P.h * 0.72, face]} material={M.cavityDark}>
        <boxGeometry args={[P.w * 0.8, 0.012, 0.002]} />
      </mesh>
      {/* 上下两组接线端子：深灰端子块 + 螺钉孔 */}
      {[P.h - 0.018, P.h * 0.12].map((y, row) => (
        <group key={`psu-term-${row}`} position={[0, y, 0]}>
          <mesh position={[0, 0, face + GAP * 2]} material={M.terminalBlock}>
            <boxGeometry args={[P.w * 0.88, 0.022, 0.006]} />
          </mesh>
          {Array.from({ length: P.terminalCount }, (_, i) => (
            <mesh key={i}
              position={[(i - (P.terminalCount - 1) / 2) * (P.w * 0.88 / P.terminalCount),
                0, face + GAP * 6]}
              material={M.cavityDark}>
              <boxGeometry args={[0.006, 0.006, 0.002]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* DC OK 绿灯：QF 合闸上电才亮 */}
      <mesh position={[P.w * 0.3, P.h * 0.26, face + GAP * 3]}
        material={powered ? M.lamp.device : M.lamp.off}>
        <sphereGeometry args={[P.ledR, 10, 8]} />
      </mesh>
      <DinClips width={P.w} depth={P.d} />
      <MotorLabel text="PSU 24V" position={[0, labelY, P.d / 2 + 0.02]} color="gray" small />
    </group>
  );
}

/**
 * 极小的贴面丝印文字：只服务柜内 PLC 的 LED 名称，无边框、不参与交互。
 * 与带底色的 MotorLabel 芯片区分，避免把「POW / RUN」画成两颗标签。
 */
function SilkText({ text, position }: { text: string; position: Vec3 }) {
  return (
    <Html position={position} center zIndexRange={[1, 0]}>
      <div style={{
        fontSize: 7, lineHeight: 1, color: '#c9d3dd', letterSpacing: 0.4,
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>{text}</div>
    </Html>
  );
}

/**
 * 小型一体式 PLC：第三十六轮照用户给的汇川 H5U 参考图简化——机身不变，
 * 只保留四类可读元素：左上角 POW / RUN 两个方块 LED、中部两个方块网口
 * （浅灰底板 + 前凸深色方孔）、右侧两条异色细长条表示 X 输入（绿）/ Y 输出（黄）。
 * 第三十七轮：RUN 改为 PLC 自身运行开关（不再是继电器动作的瞬时灯）——
 * 上电且 RUN 才亮，点击机身热区切换 RUN / STOP，STOP 时本地程序不执行。
 */
export function PlcUnit({ powered, run, labelY = -0.062 }: {
  powered?: boolean; run?: boolean; labelY?: number;
}) {
  /** 展台用 renderMotorBarePart 一次性取快照，不订阅 store：这里内部订阅保证 RUN 灯随状态刷新 */
  const livePowered = useMotorStore((s) => s.qfClosed);
  const liveRun = useMotorStore((s) => s.plcRun);
  const isPowered = powered ?? livePowered;
  const isRun = run ?? liveRun;
  const P = G.PLC;
  const face = P.d / 2 + GAP;
  /** 左上角两个方块 LED：灭 = 深灰底、亮 = 绿灯，位置与丝印名固定 */
  const ledY = P.h * 0.86;
  const leds = [
    { x: -P.w * 0.33, on: isPowered, name: 'POW' },
    /** RUN 灯只反映 PLC 自身运行状态：上电 + RUN 才亮，与继电器是否吸合无关 */
    { x: -P.w * 0.21, on: isPowered && isRun, name: 'RUN' },
  ];
  /** 3D 点击切换 RUN / STOP：观众端只读，不响应 */
  const toggleRun = () => {
    if (isViewerRuntime()) return;
    useMotorStore.getState().togglePlcRun();
  };
  const resetCursor = () => { document.body.style.cursor = ''; };
  return (
    <group>
      {/* 深灰黑工程塑料机身 */}
      <mesh position={[0, P.h / 2, 0]} material={M.plcBody}>
        <boxGeometry args={[P.w, P.h, P.d]} />
      </mesh>
      {/* 左上角两个方块 LED */}
      {leds.map((led) => (
        <mesh key={`plc-led-${led.name}`} position={[led.x, ledY, face + 0.0015]}
          material={led.on ? M.lamp.device : M.cavityDark}>
          <boxGeometry args={[P.ledSize, P.ledSize, 0.003]} />
        </mesh>
      ))}
      {leds.map((led) => (
        <SilkText key={`plc-silk-${led.name}`} text={led.name}
          position={[led.x, ledY - P.h * 0.075, face + 0.002]} />
      ))}
      {/* 中部两个方块网口：浅灰底板 + 前凸深色方孔（"抠" 出插口观感，错开 GAP 不共面） */}
      {[P.h * 0.54, P.h * 0.33].map((y, i) => (
        <group key={`plc-port-${i}`}>
          <mesh position={[-P.w * 0.02, y, face + 0.0015]} material={M.poleLip}>
            <boxGeometry args={[P.portW, P.portH, 0.003]} />
          </mesh>
          <mesh position={[-P.w * 0.02, y, face + 0.003]} material={M.cavityDark}>
            <boxGeometry args={[P.portW * 0.72, P.portH * 0.66, 0.002]} />
          </mesh>
        </group>
      ))}
      {/* 右侧两条异色细长条：绿 = X 输入、黄 = Y 输出，条间留 GAP 不共面 */}
      {[
        { x: P.w * 0.29, material: M.contactorOn },
        { x: P.w * 0.38, material: M.dial },
      ].map((s, i) => (
        <mesh key={`plc-strip-${i}`} position={[s.x, P.h * 0.45, face + 0.0015]}
          material={s.material}>
          <boxGeometry args={[P.stripW, P.h * 0.66, 0.003]} />
        </mesh>
      ))}
      {/* 放大透明热区：点一下切换 RUN / STOP（观众端只读不响应） */}
      <mesh position={[0, P.h / 2, P.d / 2 + GAP * 2]}
        onPointerDown={(e) => { e.stopPropagation(); toggleRun(); }}
        onPointerOver={() => {
          if (!isViewerRuntime()) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={resetCursor}>
        <boxGeometry args={[P.w, P.h, 0.03]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <DinClips width={P.w} depth={P.d} />
      <MotorLabel text="PLC" position={[0, labelY, P.d / 2 + 0.02]} color="blue" small />
    </group>
  );
}

/**
 * 24V 中间继电器（第二十轮，按用户指认的安装结构重画的**单个样板**）。
 * 柜内沿 +Z 的层次：底板（离屏幕最远）→ DIN 导轨（ControlCabinet 统一绘制）
 * → 黑色底座两级方块（靠 DIN 大 / 靠屏幕小）→ 壳内中间方块 → 透明壳（器件顶，朝屏幕）→ 屏幕。
 * 不再用「竖立模型绕 X 轴旋转」取巧，直接按这个朝向分层建模；第二十四轮另在
 * 屏幕平面内绕 Z 转 90°，把本体从横长矩形转成左右窄、上下宽的竖长矩形（DIN 不转）。
 * 第二十九轮：四层方块在画面竖直方向底边对齐、像实物一样立在地上（局部 x=0 为地面线），
 * 展台把组件放在地面高度即自动落地，柜内放在导轨顶即坐在导轨上。
 * 其余元件与柜内整体装配暂不动，待样板确认后一个一个修。
 */
export function RelayUnit({ on, label = 'KA', labelY = -0.03 }: {
  on: boolean; label?: string; labelY?: number;
}) {
  const R = G.RELAY;
  /**
   * 第二十四轮：局部横长矩形 + 绕 Z 转 90° → 正面看左右窄上下宽，+Z 朝向不变，DIN 不转。
   * 第二十七轮（用户看过同心套叠后确认）：不需要把中心重叠，四层沿 z 按顺序排列、
   * 朝向正确即可。第二十九轮（用户）：几个方块的底部都落在地面上——
   * 画面竖直方向（绕 Z 转后的局部 x）四层底边对齐共面、从同一地面线向上立，
   * 不再以中心嵌套；每层 x 中心 = 自身宽 / 2。z 向接触面一律贴合（法向相反
   * 共享端面，不闪不缝），只有透明壳背面藏进底座实体内错开 GAP。
   */
  const bigW = R.w * 1.5;
  const bigH = R.w * 0.8;
  const smallW = R.w * 1.1;
  const smallH = R.w * 0.6;
  const shellW = R.w * 1.0;
  const shellH = R.w * 0.55;
  const blockW = R.coilW * 1.6;
  const blockH = R.coilW * 0.9;
  const smallT = R.baseT * 0.8;
  const bigBack = -GAP * 2;
  const bigFront = bigBack + R.baseT;
  /**
   * 第二十九轮（用户侧视图指认）：中间有很明显的缝隙——两级底座改为前后贴合
   * 共享端面。两对面法向相反，任一视角只有一面朝向相机，不会 z-fighting，
   * 侧视不再出现断裂缝。灰色方块同样直接贴在底座前表面上，不悬空不漏缝。
   */
  const smallBack = bigFront;
  const smallFront = smallBack + smallT;
  /** 灰色方块后表面贴在底座前表面：不悬空、无缝隙 */
  const blockBack = smallFront;
  /** 透明遮罩从底座前部包入（壳背面藏进底座实体内，不与任何可见面共面） */
  const shellBack = smallFront - GAP;
  const shellFront = shellBack + R.coverT;
  /** 第二十九轮：底边共面落地——各层竖直中心 = 自身宽 / 2，底边一律在局部 x=0 */
  const bigX = bigW / 2;
  const smallX = smallW / 2;
  const blockX = blockW / 2;
  const shellX = shellW / 2;
  return (
    <group>
      {/* 绕 Z 转 90°：屏幕平面内旋转，朝 +Z 不变；标签留外层不跟着转成竖排 */}
      <group rotation={[0, 0, Math.PI / 2]}>
        {/* ① 大黑块：靠 DIN 导轨，尺寸最大，底边落地 */}
        <mesh position={[bigX, 0, bigBack + R.baseT / 2]} material={M.terminalBlock}>
          <boxGeometry args={[bigW, bigH, R.baseT]} />
        </mesh>
        {/* ② 小黑块：靠屏幕，尺寸较小，底边与大地块共面，前后贴合无缝隙 */}
        <mesh position={[smallX, 0, smallBack + smallT / 2]} material={M.darkMetal}>
          <boxGeometry args={[smallW, smallH, smallT]} />
        </mesh>
        {/* ③ 灰色方块贴在底座前表面：唯一动作反馈，与对应接触器同步变色，底边共面 */}
        <mesh position={[blockX, 0, blockBack + R.blockT / 2]}
          material={on ? M.contactorOn : M.contactorIdle}>
          <boxGeometry args={[blockW, blockH, R.blockT]} />
        </mesh>
        {/* ④ 透明遮罩从底座前部起，把方块整个包在里面，底边共面，顶面正对屏幕 */}
        <mesh position={[shellX, 0, shellBack + R.coverT / 2]} material={M.fuseGlass}>
          <boxGeometry args={[shellW, shellH, R.coverT]} />
        </mesh>
      </group>
      <MotorLabel text={label} position={[0, labelY, shellFront + 0.02]}
        color="green" small />
    </group>
  );
}

/** 端子排：深色基座 + 逐个黄铜端子块 + 顶面螺丝 */
export function TerminalStrip() {
  const T = G.TERMINAL;
  const step = T.w / T.blocks;
  return (
    <group>
      <mesh material={M.terminalBlock}>
        <boxGeometry args={[T.w, T.h, T.d]} />
      </mesh>
      {Array.from({ length: T.blocks }, (_, i) => (
        <group key={i} position={[-T.w / 2 + step * (i + 0.5), 0, 0]}>
          <mesh position={[0, T.h / 2 + GAP, 0]} material={M.brass}>
            <boxGeometry args={[step - GAP * 2, 0.012, T.d * 0.7]} />
          </mesh>
          <mesh position={[0, T.h / 2 + 0.008, T.d * 0.18]} rotation={[Math.PI / 2, 0, 0]} material={M.silver}>
            <cylinderGeometry args={[0.005, 0.005, 0.004, 8]} />
          </mesh>
        </group>
      ))}
      <MotorLabel text="XT 端子排" position={[0, -0.085, T.d / 2 + 0.02]} color="gray" small />
    </group>
  );
}

/** 走线槽：横向分层槽 + 左右竖向槽，带梳齿与黄色标识条（实柜标准做法） */
function WireDuct({ at, vertical = false }: { at: number; vertical?: boolean }) {
  const D = G.DUCT;
  const C = G.CABINET;
  /**
   * 横槽与 DIN 导轨共用同一个净长（第四十轮）：两端止于竖槽内缘再留 GAP。
   * 旧版横槽 x∈[-0.43,0.43] 与竖槽 x∈[0.39,0.44] 重叠、z 面又相同 → 交汇处 z-fighting；
   * 导轨当时单独写死 0.86，同样插进竖槽，两端一起闪。
   */
  const horizontalLen = DUCT_INNER_SPAN;
  if (vertical) {
    const h = C.height - C.plinthHeight - 0.14;
    const cy = C.plinthHeight + h / 2 + 0.06;
    return (
      <group position={[at, cy, G.DIN.z - 0.01]}>
        <mesh material={M.duct}>
          <boxGeometry args={[D.height, h, D.depth]} />
        </mesh>
        {Array.from({ length: 34 }, (_, i) => (
          <mesh key={i} position={[D.height / 2 + GAP, -h / 2 + h * (i + 0.5) / 34, 0]}
            material={M.cabinetInner}>
            <boxGeometry args={[0.003, D.tooth * 0.55, D.depth * 0.7]} />
          </mesh>
        ))}
        <mesh position={[D.height / 2 + GAP * 2, 0, D.depth / 2 + GAP * 4]} material={M.ductLabel}>
          <boxGeometry args={[0.004, h * 0.94, 0.003]} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, at, G.DIN.z - 0.01]}>
      <mesh material={M.duct}>
        <boxGeometry args={[horizontalLen, D.height, D.depth]} />
      </mesh>
      {Array.from({ length: 30 }, (_, i) => (
        <mesh key={i} position={[-horizontalLen / 2 + horizontalLen * (i + 0.5) / 30, 0, D.depth / 2 + GAP]}
          material={M.cabinetInner}>
          <boxGeometry args={[D.tooth * 0.55, D.height * 0.9, 0.003]} />
        </mesh>
      ))}
      <mesh position={[0, 0, D.depth / 2 + GAP * 4]} material={M.ductLabel}>
        <boxGeometry args={[horizontalLen * 0.96, 0.004, 0.003]} />
      </mesh>
    </group>
  );
}

/** DIN 导轨：银色型材 + 一排安装孔 */
function DinRail({ y }: { y: number }) {
  const R = G.DIN;
  return (
    <group position={[0, y, R.z]}>
      <mesh material={M.silver}>
        <boxGeometry args={[R.length, R.height, R.depth]} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[-R.length / 2 + R.length * (i + 0.5) / 16, 0, R.depth / 2 + GAP]}
          material={M.profileSlot}>
          <boxGeometry args={[0.012, R.height * 0.42, 0.002]} />
        </mesh>
      ))}
    </group>
  );
}

/** 实体柜门：铰链在左前角，打开约 105°，门板让到柜体左侧不遮挡内部 */
function CabinetDoor() {
  const C = G.CABINET;
  const h = C.height - C.plinthHeight;
  const cy = C.plinthHeight + h / 2;
  return (
    <group position={[-C.width / 2, 0, C.hingeZ]} rotation={[0, C.doorOpenAngle, 0]}>
      {/* 门板与柜体同色喷塑，折回左侧后不再是一大块刺眼纯白 */}
      <mesh position={[C.width / 2, cy, 0]} material={M.cabinet}>
        <boxGeometry args={[C.width - C.wall * 2, h, C.doorThickness]} />
      </mesh>
      {/* 门把手（门板折回后朝外，内侧保持素板，避免出现一块白色浮板） */}
      <mesh position={[C.width - 0.09, cy, C.doorThickness / 2 + GAP * 3]} material={M.darkMetal}>
        <boxGeometry args={[0.022, 0.11, 0.026]} />
      </mesh>
      {/* 门边密封条 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[C.width / 2, cy + s * (h / 2 - 0.01), C.doorThickness / 2 + GAP]}
          material={M.darkMetal}>
          <boxGeometry args={[C.width - C.wall * 2, 0.008, 0.004]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 硬件互锁仍由电气接线逻辑（常闭辅助触点互串）保证，但按用户要求不再画两台接触器
 * 之间的机械连杆 / 辅助模块 / 铭牌：柜内只保留四个独立元件。
 */


/** 落地控制柜：敞开柜口 + 实体门打开 + 柜内导轨 / 线槽 / 元件 / 端子排 */
export function ControlCabinet() {
  const qfClosed = useMotorStore((s) => s.qfClosed);
  const km1On = useMotorStore((s) => s.km1On);
  const km2On = useMotorStore((s) => s.km2On);
  const frTripped = useMotorStore((s) => s.frTripped);
  const plcRun = useMotorStore((s) => s.plcRun);
  const C = G.CABINET;
  const H = C.height - C.plinthHeight;
  const cy = C.plinthHeight + H / 2;
  const railZ = G.DIN.z + G.DIN.depth / 2 + GAP;
  /**
   * 第十八轮：内背板只覆盖上两层。下沿抬到中下层线槽上沿，
   * FR 下方的下层区域露出柜体后板深灰，去掉用户指认的那块蓝灰矩形盒子。
   */
  const backTopY = cy + (H - 0.02) / 2;
  const backMinY = G.DUCT.rows[2] + G.DUCT.height / 2;
  const backH = backTopY - backMinY;
  const backCy = (backTopY + backMinY) / 2;

  return (
    <group position={MOTOR_ASSEMBLY.CABINET_POSITION}>
      {/* 底座 + 柜体五面 + 浅色内背板，让柜内元件有对比 */}
      <mesh castShadow position={[0, C.plinthHeight / 2, 0]} material={M.struct}>
        <boxGeometry args={[C.width, C.plinthHeight, C.depth]} />
      </mesh>
      <mesh castShadow position={[0, cy, -C.depth / 2 + C.wall / 2]} material={M.cabinet}>
        <boxGeometry args={[C.width, H, C.wall]} />
      </mesh>
      {/* 内背板只到中下层线槽上沿；FR 下方下层露出柜体后板深灰 */}
      <mesh position={[0, backCy, -C.depth / 2 + C.wall + GAP * 3]} material={M.cabinetInner}>
        <boxGeometry args={[C.width - C.wall * 2, backH, 0.006]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (C.width / 2 - C.wall / 2), cy, 0]} material={M.cabinet}>
          <boxGeometry args={[C.wall, H, C.depth]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, s === 1 ? C.height - C.wall / 2 : C.plinthHeight + C.wall / 2, 0]} material={M.cabinet}>
          <boxGeometry args={[C.width, C.wall, C.depth]} />
        </mesh>
      ))}
      {/* 正面门框：贴在前表面之外的薄装饰边，避免与顶板/侧板顶面精确共面 */}
      {[-1, 1].map((s) => (
        <mesh key={`fv${s}`} position={[s * (C.width / 2 - C.wall / 2), cy, C.depth / 2 + GAP]} material={M.cabinet}>
          <boxGeometry args={[C.wall, H - C.wall * 2, 0.004]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`fh${s}`} position={[0, s === 1 ? C.height - C.wall / 2 : C.plinthHeight + C.wall / 2, C.depth / 2 + GAP]} material={M.cabinet}>
          <boxGeometry args={[C.width - C.wall * 2, C.wall, 0.004]} />
        </mesh>
      ))}
      <CabinetDoor />

      {/* 三层 DIN 导轨 + 四条横向线槽 + 左右竖向线槽（实柜分区） */}
      <DinRail y={G.DIN.upperY} />
      <DinRail y={G.DIN.middleY} />
      <DinRail y={G.DIN.lowerY} />
      {G.DUCT.rows.map((row) => <WireDuct key={`row-${row}`} at={row} />)}
      <WireDuct at={-G.DUCT.verticalX} vertical />
      <WireDuct at={G.DUCT.verticalX} vertical />

      {/* 元件按三层装配表摆放：第一排 QF/FU/PSU/KA1/KA2，第二排 KM1/KM2/FR/PLC，下层 XT */}
      {MOTOR_CABINET_LAYOUT.map((part, i) => {
        const railY = part.level === 'upper' ? G.DIN.upperY
          : part.level === 'middle' ? G.DIN.middleY : G.DIN.lowerY;
        const railBase = railY + G.DIN.height / 2;
        return (
          <group key={`${part.kind}-${i}`} position={[part.x, railBase, railZ]}>
            {part.kind === 'breaker' && <Breaker closed={qfClosed} labelY={part.labelHeight} />}
            {part.kind === 'fuse' && <FuseBank labelY={part.labelHeight} />}
            {part.kind === 'contactor' && (
              <Contactor on={part.label === 'KM1' ? km1On : km2On} label={part.label} color={part.color}
                labelY={part.labelHeight} />
            )}
            {part.kind === 'thermal' && <ThermalRelay tripped={frTripped} labelY={part.labelHeight} />}
            {part.kind === 'psu' && <SwitchingPowerSupply powered={qfClosed} labelY={part.labelHeight} />}
            {part.kind === 'plc' && (
              <PlcUnit powered={qfClosed} run={plcRun} labelY={part.labelHeight} />
            )}
            {part.kind === 'relay' && (
              <RelayUnit on={part.label === 'KA1' ? km1On : km2On}
                label={part.label} labelY={part.labelHeight} />
            )}
          </group>
        );
      })}

      {/* 电气原理图铭牌板：第十五轮缩小并让到中层左侧空位后方，
          把上层右侧整段让给 PLC / 24V 继电器；贴面线条仍再错开一层 */}
      <group position={[-0.35, G.DIN.middleY + 0.09, -C.depth / 2 + C.wall + GAP * 7]}>
        <mesh material={M.nameplate}>
          <boxGeometry args={[0.09, 0.11, 0.004]} />
        </mesh>
        {[-0.025, 0, 0.025].map((dy) => (
          <mesh key={dy} position={[0, dy, GAP * 2]} material={M.profileSlot}>
            <boxGeometry args={[0.07, 0.003, 0.002]} />
          </mesh>
        ))}
        {[-0.03, 0.03].map((dx) => (
          <mesh key={dx} position={[dx, 0, GAP * 2]} material={M.profileSlot}>
            <boxGeometry args={[0.003, 0.07, 0.002]} />
          </mesh>
        ))}
      </group>

      {/* 下层 XT 端子排 */}
      <group position={[0, G.DIN.lowerY + G.DIN.height / 2 + 0.02, railZ]}>
        <TerminalStrip />
      </group>

      {/* 配线不画实体：层间连线由柜内线槽表达，避免竖直细线穿过元件造成穿模 */}

    </group>
  );
}

/* ==================== 独立琴式斜面操作台 ==================== */

const BUTTON_KEYS: readonly (keyof MotorButtons)[] = [
  'fwdJog', 'revJog', 'fwdStart', 'revStart', 'stop',
];

/**
 * 3D 操作台按钮与 UI 面板共用同一套 setButton：按住写入、松开释放。
 * 观众只读端完全不响应；window 级 pointerup 兜底避免按钮被按住卡死。
 */
function use3dButtonHandlers() {
  useEffect(() => {
    const releaseAll = () => {
      if (isViewerRuntime()) return;
      const st = useMotorStore.getState();
      for (const key of BUTTON_KEYS) if (st.buttons[key]) st.setButton(key, false);
    };
    window.addEventListener('pointerup', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    return () => {
      window.removeEventListener('pointerup', releaseAll);
      window.removeEventListener('pointercancel', releaseAll);
    };
  }, []);
  return {
    press: (key: keyof MotorButtons) => {
      if (isViewerRuntime()) return;
      useMotorStore.getState().setButton(key, true);
    },
    release: (key: keyof MotorButtons) => {
      if (isViewerRuntime()) return;
      useMotorStore.getState().setButton(key, false);
    },
  };
}

/** 操作台：可点击的工业按钮头 + 金属圈 + 指示灯 + 逐项铭牌，与柜内元件空间分离 */
export function OperatorConsole() {
  const { press, release } = use3dButtonHandlers();
  const buttons = useMotorStore((s) => s.buttons);
  const qf = useMotorStore((s) => s.qfClosed);
  const direction = useMotorStore((s) => s.direction);
  const overload = useMotorStore((s) => s.frTripped);
  const C = G.CONSOLE;
  const lamps: { key: MotorLampKind; label: string; on: boolean }[] = [
    { key: 'power', label: '电源', on: qf },
    { key: 'forward', label: '正转', on: direction === 1 },
    { key: 'reverse', label: '反转', on: direction === -1 },
    { key: 'overload', label: '过载', on: overload },
  ];
  const halfLegX = C.width / 2 - 0.07;
  const halfLegZ = C.depth / 2 - 0.05;

  return (
    <group position={MOTOR_ASSEMBLY.CONSOLE_POSITION}>
      {/* 台体裙边 + 四根支腿 */}
      <mesh castShadow position={[0, C.height - C.skirtH / 2 - 0.01, 0]} material={M.darkMetal}>
        <boxGeometry args={[C.width + 0.02, C.skirtH, C.depth + 0.02]} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}-${sz}`} position={[sx * halfLegX, (C.height - C.skirtH) / 2, sz * halfLegZ]}
          castShadow material={M.darkMetal}>
          <boxGeometry args={[C.legT, C.height - C.skirtH, C.legT]} />
        </mesh>
      )))}
      {/* 底部横撑：让操作台读成设备机架而不是办公桌 */}
      {[-1, 1].map((sz) => (
        <mesh key={`brace-${sz}`} position={[0, 0.13, sz * halfLegZ]} castShadow material={M.darkMetal}>
          <boxGeometry args={[C.width - 0.1, C.legT * 0.7, C.legT * 0.7]} />
        </mesh>
      ))}
      {/* 倾斜面板：+Z 前缘更低，从上方机位能读清按钮排布 */}
      <group position={[0, C.height, 0]} rotation={[C.tilt, 0, 0]}>
        <mesh castShadow receiveShadow material={M.panel}>
          <boxGeometry args={[C.width, C.panelT, C.depth]} />
        </mesh>
        {/* 钣金折边包框 */}
        {[-1, 1].map((s) => (
          <mesh key={`edge-x${s}`} position={[0, C.panelT / 2 + GAP, s * (C.depth / 2 - 0.006)]} material={M.darkMetal}>
            <boxGeometry args={[C.width, 0.006, 0.012]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`edge-z${s}`} position={[s * (C.width / 2 - 0.006), C.panelT / 2 + GAP, 0]} material={M.darkMetal}>
            <boxGeometry args={[0.012, 0.006, C.depth]} />
          </mesh>
        ))}
        <mesh position={[0, C.panelT / 2 + GAP, 0]} material={M.nameplate}>
          <boxGeometry args={[C.width - 0.03, 0.002, C.depth - 0.03]} />
        </mesh>
        {/* 五个按钮：黄色底座 + 金属圈 + 工业色按钮头；整块放大热区可直接点按 */}
        {BUTTON_KEYS.map((key, i) => {
          const x = (i - (BUTTON_KEYS.length - 1) / 2) * C.buttonGap;
          const on = buttons[key];
          const y = C.panelT / 2;
          const resetCursor = () => { document.body.style.cursor = ''; };
          return (
            <group key={key}>
              <mesh position={[x, y + 0.001, C.buttonRowZ]} material={M.dial}>
                <cylinderGeometry args={[C.buttonRingR * 1.18, C.buttonRingR * 1.18, 0.004, 18]} />
              </mesh>
              <mesh position={[x, y + 0.007, C.buttonRowZ]} material={M.buttonRing}>
                <cylinderGeometry args={[C.buttonRingR, C.buttonRingR, 0.006, 18]} />
              </mesh>
              <mesh position={[x, y + (on ? 0.01 : 0.016), C.buttonRowZ]}
                material={on ? M.buttonPressed : MOTOR_BUTTON_COLORS[key]}>
                <cylinderGeometry args={[C.buttonR, C.buttonR, on ? 0.008 : 0.014, 18]} />
              </mesh>
              <mesh
                position={[x, y + 0.02, C.buttonRowZ]}
                onPointerDown={(e) => { e.stopPropagation(); press(key); }}
                onPointerUp={(e) => { e.stopPropagation(); release(key); }}
                onPointerOut={() => { release(key); resetCursor(); }}
                onPointerOver={() => {
                  if (!isViewerRuntime()) document.body.style.cursor = 'pointer';
                }}
              >
                <cylinderGeometry args={[C.buttonRingR * 1.9, C.buttonRingR * 1.9, 0.04, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
              </mesh>
              <MotorLabel text={MOTOR_BUTTON_LABELS[key]}
                position={[x, y + 0.004, C.buttonRowZ + 0.062]}
                color={on ? 'green' : 'gray'} small dataKey={key} />
            </group>
          );
        })}
        {/* 四只指示灯：金属圈 + 发光透镜 */}
        {lamps.map((lamp, i) => {
          const x = (i - (lamps.length - 1) / 2) * C.lampGap;
          const y = C.panelT / 2;
          return (
            <group key={lamp.key}>
              <mesh position={[x, y + 0.003, C.lampRowZ]} material={M.lampRing}>
                <cylinderGeometry args={[C.lampRingR, C.lampRingR, 0.006, 18]} />
              </mesh>
              <mesh position={[x, y + 0.015, C.lampRowZ]} material={motorLampMaterial(lamp.key, lamp.on)}>
                <cylinderGeometry args={[C.lampR, C.lampR, 0.012, 18]} />
              </mesh>
              <MotorLabel text={lamp.label}
                position={[x, y + 0.004, C.lampRowZ - 0.06]}
                color={lamp.on ? 'yellow' : 'gray'} small />
            </group>
          );
        })}
        {/* 台面铭牌只做贴面几何，不再挂 Html 标签，避免投影飘到柜内元件区 */}
        <mesh position={[0, C.panelT / 2 + GAP * 2, -C.depth / 2 + 0.045]} material={M.nameplate}>
          <boxGeometry args={[C.width * 0.34, 0.003, 0.026]} />
        </mesh>
      </group>
    </group>
  );
}

/* ==================== 输送线与侧装减速电机 ==================== */

const B = G.BELT;
const RAIL_Z = B.width / 2 + B.railOut + B.railT / 2;
const ROLLER_Y = B.topY - B.beltThickness - B.driveRollerR;
const RAIL_Y = B.topY - 0.06;
const DRIVE_X = B.length / 2 - B.driveInset;

/** 铝挤型侧梁：本体 + 外侧两道 T 槽 + 顶部亮银挡边 */
function ProfileRail({ z }: { z: number }) {
  const outerZ = Math.sign(z) * (B.railT / 2 + GAP);
  return (
    <group position={[0, RAIL_Y, z]}>
      <mesh castShadow material={M.skid}>
        <boxGeometry args={[B.length + 2 * B.endPlateT, B.railH, B.railT]} />
      </mesh>
      {[-0.028, 0.028].map((dy) => (
        <mesh key={dy} position={[0, dy, outerZ]} material={M.profileSlot}>
          <boxGeometry args={[B.length + 2 * B.endPlateT, B.slotH, 0.002]} />
        </mesh>
      ))}
      <mesh position={[0, B.railH / 2 + B.guideH / 2 - GAP, 0]} material={M.silver}>
        <boxGeometry args={[B.length + 2 * B.endPlateT, B.guideH, B.guideT]} />
      </mesh>
    </group>
  );
}

/** 端部封板：两端各一块，四角沉头螺栓 */
function EndPlate({ x }: { x: number }) {
  const faceX = Math.sign(x) * (B.endPlateT / 2 + GAP);
  return (
    <group position={[x, RAIL_Y, 0]}>
      <mesh material={M.skid}>
        <boxGeometry args={[B.endPlateT, B.endPlateH, 2 * RAIL_Z + B.railT]} />
      </mesh>
      {[-0.03, 0.03].map((dy) => (
        <mesh key={dy} position={[faceX, dy, 0]} rotation={[0, 0, Math.PI / 2]} material={M.endCap}>
          <cylinderGeometry args={[B.rollerCapR * 0.7, B.rollerCapR * 0.7, GAP, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** 支腿：方型材 + 可调地脚 + 端部横撑 */
function SupportLegs() {
  const xs = [-B.length / 2 + B.legInset, B.length / 2 - B.legInset];
  const zs = [-RAIL_Z, RAIL_Z];
  const legH = RAIL_Y - B.railH / 2;
  return (
    <group>
      {xs.flatMap((x) => zs.map((z) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, legH / 2, 0]} material={M.skid}>
            <boxGeometry args={[B.legT, legH, B.legT]} />
          </mesh>
          <mesh position={[0, B.footH / 2 - GAP, 0]} material={M.darkMetal}>
            <cylinderGeometry args={[B.footR, B.footR, B.footH, 16]} />
          </mesh>
          <mesh position={[0, B.footH + GAP, 0]} material={M.endCap}>
            <cylinderGeometry args={[B.footR * 0.72, B.footR * 0.72, GAP, 16]} />
          </mesh>
        </group>
      )))}
      {xs.map((x) => (
        <mesh key={`brace-${x}`} position={[x, legH * 0.42, 0]} material={M.darkMetal}>
          <boxGeometry args={[B.legT, B.crossH, 2 * RAIL_Z]} />
        </mesh>
      ))}
    </group>
  );
}

/** 端部主动/从动滚筒：橡胶包覆 + 端盖 + 外伸轴头 + 轴承座 */
function DriveRoller({ x }: { x: number }) {
  return (
    <group position={[x, ROLLER_Y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={M.rubber}>
        <cylinderGeometry args={[B.driveRollerR + B.beltThickness, B.driveRollerR + B.beltThickness, B.width, 20]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * (B.width / 2 + GAP)]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.endCap}>
            <cylinderGeometry args={[B.driveRollerR * 0.62, B.driveRollerR * 0.62, B.rollerCapT, 16]} />
          </mesh>
          <mesh position={[0, 0, s * (B.rollerCapT / 2 + 0.016)]} rotation={[Math.PI / 2, 0, 0]} material={M.axis}>
            <cylinderGeometry args={[B.rollerShaftR, B.rollerShaftR, 0.034, 10]} />
          </mesh>
        </group>
      ))}
      {/* 轴承座：装在侧梁外侧，明确滚筒是被支撑的 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * (RAIL_Z + B.railT / 2 + B.bearingD / 2)]} material={M.struct}>
          <boxGeometry args={[B.bearingW, B.bearingH, B.bearingD]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 侧装减速电机：局部原点在法兰面中心，轴线沿 +Z，与主动滚筒同轴。
 * 法兰贴侧梁外表面 → 减速箱 → 电机筒 → 风扇罩，顶部接线盒，下方安装托板。
 */
export function MotorUnit({ shaftAngle }: { shaftAngle: number }) {
  const T = G.MOTOR;
  /** 法兰 / 减速箱 / 筒体 / 风罩相邻端面各留 GAP，避免精确共面闪烁 */
  const gearStart = T.plateT + GAP * 3;
  const gearZ = gearStart + T.gearboxLen / 2;
  const bodyStart = gearStart + T.gearboxLen + GAP;
  const bodyZ = bodyStart + T.bodyLen / 2;
  const bodyEndZ = bodyStart + T.bodyLen;
  const fanStart = bodyEndZ + GAP;
  const fanZ = fanStart + T.fanCoverLen / 2;
  const fanEndZ = fanStart + T.fanCoverLen;
  return (
    <group>
      {/* 安装法兰板 + 法兰盘 */}
      <mesh position={[0, 0, T.plateT / 2]} material={M.endCap}>
        <boxGeometry args={[T.plateW, T.plateH, T.plateT]} />
      </mesh>
      <mesh position={[0, 0, T.plateT + GAP]} rotation={[Math.PI / 2, 0, 0]} material={M.silver}>
        <cylinderGeometry args={[T.flangeR, T.flangeR, GAP, 20]} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => (
        <mesh key={`${sx}-${sy}`} position={[sx * T.plateW * 0.38, sy * T.plateH * 0.38, T.plateT + GAP * 3]}
          rotation={[Math.PI / 2, 0, 0]} material={M.brass}>
          <cylinderGeometry args={[0.006, 0.006, 0.004, 8]} />
        </mesh>
      )))}
      {/* 减速箱：输出轴穿过侧梁与主动滚筒同轴 */}
      <mesh position={[0, 0, gearZ]} rotation={[Math.PI / 2, 0, 0]} material={M.struct}>
        <cylinderGeometry args={[T.gearboxR, T.gearboxR, T.gearboxLen, 20]} />
      </mesh>
      <mesh position={[0, 0, T.plateT + GAP * 4]} rotation={[Math.PI / 2, 0, 0]} material={M.axis}>
        <cylinderGeometry args={[T.shaftR, T.shaftR, T.gearboxLen + T.shaftLen, 12]} />
      </mesh>
      {/* 电机筒体：铝银（与 MD520 的 vfdMotor 同系），环形散热筋用 Torus */}
      <mesh castShadow position={[0, 0, bodyZ]} rotation={[Math.PI / 2, 0, 0]} material={M.skid}>
        <cylinderGeometry args={[T.bodyR, T.bodyR, T.bodyLen, 24]} />
      </mesh>
      {Array.from({ length: T.finCount }, (_, i) => (
        <mesh key={i} position={[0, 0, bodyStart + T.bodyLen * (i + 0.5) / T.finCount]}
          material={M.struct}>
          <torusGeometry args={[T.finR, T.finT, 6, 24]} />
        </mesh>
      ))}
      {/* 尾端外露风扇（MD520 范式）：openEnded 风罩筒不封端面，护圈不转，叶片整组绕 Z 自转 */}
      <mesh position={[0, 0, fanZ]} rotation={[Math.PI / 2, 0, 0]} material={M.darkMetal}>
        <cylinderGeometry args={[T.fanCoverR, T.fanCoverR, T.fanCoverLen, 24, 1, true]} />
      </mesh>
      <mesh position={[0, 0, fanEndZ + GAP]} material={M.endCap}>
        <torusGeometry args={[T.fanCoverR, T.fanRingT, 8, 24]} />
      </mesh>
      <group position={[0, 0, fanEndZ - 0.012]} rotation={[0, 0, shaftAngle]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.silver}>
          <cylinderGeometry args={[T.fanHubR, T.fanHubR, 0.022, 14]} />
        </mesh>
        {Array.from({ length: T.fanBlades }, (_, i) => {
          const a = (i * Math.PI * 2) / T.fanBlades;
          return (
            <mesh key={i}
              position={[Math.cos(a) * T.fanCoverR * 0.5, Math.sin(a) * T.fanCoverR * 0.5, 0]}
              rotation={[0, 0, a + Math.PI / 6]} material={M.endCap}>
              <boxGeometry args={[T.fanBladeL, T.fanBladeW, T.fanBladeH]} />
            </mesh>
          );
        })}
      </group>
      {/* 顶部接线盒 + 电缆入口 */}
      <mesh position={[0, T.bodyR + T.terminalH / 2, bodyZ]} material={M.darkMetal}>
        <boxGeometry args={[T.terminalW, T.terminalH, T.terminalD]} />
      </mesh>
      <mesh position={[0, T.bodyR + T.terminalH + 0.008, bodyZ]} rotation={[Math.PI / 2, 0, 0]} material={M.brass}>
        <cylinderGeometry args={[0.014, 0.014, 0.02, 10]} />
      </mesh>
      {/* 安装托板 + 加强筋：顶面与筒体底面错开 GAP，不共面 */}
      <mesh position={[0, -T.bodyR - T.bracketH / 2 - GAP, T.plateT + T.bracketD / 2]} material={M.struct}>
        <boxGeometry args={[T.bracketW, T.bracketH, T.bracketD]} />
      </mesh>
      <mesh position={[0, -T.bodyR - T.bracketH / 2 - GAP - 0.025, T.plateT + 0.02]} material={M.darkMetal}>
        <boxGeometry args={[T.bracketW * 0.8, 0.05, 0.016]} />
      </mesh>
    </group>
  );
}

/** 整机输送线：环形皮带 + 滚筒 + 机架 + 瓦楞纸箱 + 侧装电机 */
export function ConveyorAssembly() {
  const displacement = useMotorStore((s) => s.beltDisplacement);
  const shaftAngle = useMotorStore((s) => s.shaftAngle);
  const L = B.length;
  const half = L / 2;
  const upperLen = L - 2 * B.driveInset;
  const beltOffset = ((displacement / 1000) % upperLen + upperLen) % upperLen;
  const sideZ = RAIL_Z + B.railT / 2 + GAP;
  const idlerY = B.topY - B.beltThickness - B.idlerRollerR;
  const idlerXs = Array.from({ length: B.rollerCount - 2 }, (_, i) =>
    -DRIVE_X + (2 * DRIVE_X) * (i + 1) / (B.rollerCount - 1));

  return (
    <group position={MOTOR_ASSEMBLY.BELT_POSITION}>
      {/* 机架 */}
      <ProfileRail z={-RAIL_Z} />
      <ProfileRail z={RAIL_Z} />
      <EndPlate x={-half - B.endPlateT / 2} />
      <EndPlate x={half + B.endPlateT / 2} />
      <SupportLegs />
      {/* 环形皮带：上带 + 回程带 + 两端包角滚筒 */}
      <mesh castShadow receiveShadow position={[0, B.topY - B.beltThickness / 2, 0]} material={M.rubber}>
        <boxGeometry args={[upperLen, B.beltThickness, B.width]} />
      </mesh>
      <mesh position={[0, B.returnY, 0]} material={M.rubber}>
        <boxGeometry args={[upperLen, 0.008, B.width * 0.9]} />
      </mesh>
      <DriveRoller x={-DRIVE_X} />
      <DriveRoller x={DRIVE_X} />
      {/* 中间托辊：藏在上带下方，仅侧视可见 */}
      {idlerXs.map((x, i) => (
        <group key={i} position={[x, idlerY, 0]} rotation={[0, 0, shaftAngle]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.roller}>
            <cylinderGeometry args={[B.idlerRollerR, B.idlerRollerR, B.width * 0.92, 12]} />
          </mesh>
        </group>
      ))}
      {/* 皮带接头：两条低调细线随位移滚动，不再用规则亮横纹或方向圆锥 */}
      {Array.from({ length: B.jointCount }, (_, i) => {
        const frac = i / B.jointCount;
        const x = -upperLen / 2 + ((beltOffset + frac * upperLen) % upperLen);
        return (
          <mesh key={i} position={[x, B.topY + GAP, 0]} material={M.beltJoint}>
            <boxGeometry args={[B.jointWidth, 0.0015, B.width - GAP * 3]} />
          </mesh>
        );
      })}
      {/* 瓦楞纸箱：哑光牛皮纸 + 半透明封箱胶带 + 侧面折痕 */}
      {Array.from({ length: G.BOX.count }, (_, i) => (
        <group key={i} position={[
          motorBoxOffset(i, displacement / 1000, L),
          B.topY + G.BOX.height / 2 + GAP * 2,
          0,
        ]}>
          <mesh castShadow receiveShadow material={M.carton}>
            <boxGeometry args={[G.BOX.width, G.BOX.height, G.BOX.depth]} />
          </mesh>
          <mesh position={[0, G.BOX.height / 2 + GAP, 0]} material={M.cartonTape}>
            <boxGeometry args={[G.BOX.tapeWidth, 0.002, G.BOX.depth]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * (G.BOX.depth / 2 + GAP)]} material={M.cartonSeam}>
              <boxGeometry args={[G.BOX.width * 0.92, 0.003, 0.002]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 侧装减速电机：与主动滚筒同轴 */}
      <group position={[DRIVE_X, ROLLER_Y, sideZ]}>
        <MotorUnit shaftAngle={shaftAngle} />
      </group>
    </group>
  );
}

/** 展台用单机：与整机侧装电机复用同一批组件 */
export function MotorAssembly() {
  const shaftAngle = useMotorStore((s) => s.shaftAngle);
  return <MotorUnit shaftAngle={shaftAngle} />;
}

/* ==================== 机位、展台与总装 ==================== */

interface RigGoal { camera: Vec3; target: Vec3; }

export function MotorCameraRig() {
  const activeView = useMotorViewStore((s) => s.activeView);
  const activeStage = useMotorViewStore((s) => s.activeStage);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3; update: () => void;
  } | null;
  const goalRef = useRef<RigGoal | null>(null);

  useEffect(() => {
    if (!controls) return;
    const g = activeStage
      ? MOTOR_PART_STAGE_GOALS[activeStage]
      : (MOTOR_CAMERA_GOALS[activeView] ?? MOTOR_CAMERA_GOALS.overview);
    goalRef.current = { camera: g.position, target: g.target };
  }, [activeView, activeStage, controls]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-5 * Math.min(dt, 0.05));
    const camGoal = new THREE.Vector3(...goal.camera);
    const targetGoal = new THREE.Vector3(...goal.target);
    camera.position.lerp(camGoal, alpha);
    controls.target.lerp(targetGoal, alpha);
    controls.update();
    if (camera.position.distanceTo(camGoal) < 0.003
      && controls.target.distanceTo(targetGoal) < 0.003) {
      goalRef.current = null;
    }
  });
  return null;
}

/**
 * 部件展台专用：KA 后面的一小段 DIN 导轨。
 * 用户明确「加 DIN 的目的是为了更容易辨别方向」——不是安装参照装饰，
 * 而是让人一眼看出器件的底在哪、顶朝屏幕。因此画成真实 DIN 帽形槽
 * （中间背板 + 上下两条前凸翻边，有正反面立体轮廓），并在上沿加一条
 * 深色方向标记明确「哪一侧是上」。柜内导轨由 ControlCabinet 统一绘制，
 * 这里只在 relay 展台出现，RelayUnit 自身不带导轨、不会重复。
 */
function RelayStageRail() {
  const D = G.DIN;
  const railLen = G.RELAY.w * 2.6;
  const lipH = D.height * 0.2;
  const lipZ = D.depth * 0.24;
  /**
   * 第二十九轮：导轨段底边也落在地面（y=0），与立地的继电器同一地面线，
   * 不再悬浮 / 半截埋进地坪。
   */
  return (
    <group position={[0, D.height / 2, -D.depth / 2 - GAP * 3]}>
      {/* 帽形槽背板 */}
      <mesh material={M.silver}>
        <boxGeometry args={[railLen, D.height, 0.004]} />
      </mesh>
      {/* 上下翻边前凸：形成「槽」的立体轮廓，正反 / 上下一眼可辨 */}
      {[-1, 1].map((s) => (
        <mesh key={`stage-rail-lip-${s}`}
          position={[0, s * (D.height / 2 - lipH / 2), lipZ]}
          material={M.silver}>
          <boxGeometry args={[railLen, lipH, D.depth * 0.55]} />
        </mesh>
      ))}
      {/* 上沿方向标记：明确哪一侧是上，器件顶朝屏幕 */}
      <mesh position={[0, D.height / 2 + GAP, lipZ + D.depth * 0.2]}
        material={M.profileSlot}>
        <boxGeometry args={[railLen * 0.92, 0.002, 0.002]} />
      </mesh>
    </group>
  );
}

/** 部件展台：与整机复用同一批组件，置于自身局部原点 */
export function renderMotorBarePart(kind: MotorPartKind): ReactNode {
  const st = useMotorStore.getState();
  switch (kind) {
    case 'contactor': return <Contactor on={st.km1On} label="KM1" color="green" />;
    case 'thermal': return <ThermalRelay tripped={st.frTripped} />;
    case 'breaker': return <Breaker closed={st.qfClosed} />;
    case 'fuse': return <FuseBank />;
    case 'psu': return <SwitchingPowerSupply powered={st.qfClosed} />;
    case 'plc': return <PlcUnit />;   // 不传 props：内部订阅 store，展台切 RUN / STOP 才能实时刷新
    case 'relay': return (
      /* 第二十九轮：RelayUnit 底边落在局部 y=0，放在展台原点即整组立于地面 */
      <group>
        <RelayStageRail />
        <RelayUnit on={st.km1On} label="KA1" />
      </group>
    );
    case 'motor': return <MotorAssembly />;
    case 'belt': return <ConveyorAssembly />;
    case 'console': return <OperatorConsole />;
    default: return null;
  }
}

/** 整机总装：只摆放，不重写部件几何 */
export function MotorAssembledScene() {
  return (
    <group>
      <ControlCabinet />
      <OperatorConsole />
      <ConveyorAssembly />
    </group>
  );
}

export const MOTOR_SCENE_BACKGROUND = MOTOR_VISUAL.SCENE_BACKGROUND;
