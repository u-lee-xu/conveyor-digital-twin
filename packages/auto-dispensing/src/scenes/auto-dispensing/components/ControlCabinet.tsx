import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import { useAppStore, type AppMode } from '../../../stores/useAppStore';
import {
  CABINET_SIZE, CABINET_PANEL, CABINET_BUTTONS, CABINET_LAMPS, CABINET_LAMP_Y, CABINET_SELECTOR,
  LIGHT_DOME_R, LIGHT_DOME_STEP, LIGHT_POLE_H, LIGHT_POLE_Y, VISUAL, SURFACE_GAP,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';

const P = CABINET_PANEL;

/** 按钮盒细节材质：颜色来自 CABINET_PANEL.COLORS，表面质感在此统一定义 */
const bezelMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.bezel, metalness: 0.9, roughness: 0.16,
});
const collarMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.collar, metalness: 0.4, roughness: 0.5,
});
const estopBaseMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.estopBase, metalness: 0.2, roughness: 0.55,
});
/** 分区线是贴面薄片：几何已错开 SURFACE_GAP，再叠 polygonOffset 抗远机位闪烁 */
const trimMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.trim, metalness: 0.5, roughness: 0.5,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

/**
 * 沿 +Z 的圆盘 / 短圆柱。
 * 关键点：cylinderGeometry 默认轴是 +Y，必须绕 X 轴转 90° 才能让按钮头朝观察者，
 * 旧实现没转，从正面看按钮就变成一排竖立的彩色横条，完全不像按钮盒。
 */
function ZDisc({ r, depth, z, material, segments = 24 }: {
  r: number; depth: number; z: number; material: THREE.Material; segments?: number;
}) {
  return (
    <mesh position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} material={material}>
      <cylinderGeometry args={[r, r, depth, segments]} />
    </mesh>
  );
}

/**
 * 用 CanvasTexture 画中文丝印铭牌：随 3D 距离缩放、可被正确遮挡，不依赖外部字体文件。
 * warning 模式是急停专用：RAL1021 警示黄底 + 黑字，与实物急停标牌一致。
 */
function usePlateTexture(text: string, dark: boolean, warning: boolean) {
  return useMemo(() => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = warning ? P.COLORS.estopBase : dark ? P.COLORS.trim : P.COLORS.nameplate;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = warning ? '#7a6300' : dark ? '#8c99a9' : '#aab6c4';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
      ctx.fillStyle = warning ? P.COLORS.warningText : dark ? '#f1f5f9' : P.COLORS.text;
      let size = 34;
      const font = (px: number) => `bold ${px}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.font = font(size);
      while (ctx.measureText(text).width > c.width - 24 && size > 14) {
        size -= 2;
        ctx.font = font(size);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [text, dark, warning]);
}

/** 急停蘑菇头顶面的「旋转释放」箭头符号（透明底白箭头，实物为激光刻印） */
function useEStopSymbol() {
  return useMemo(() => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = P.COLORS.symbol;
      ctx.fillStyle = P.COLORS.symbol;
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      const end = Math.PI * 1.02;
      ctx.beginPath();
      ctx.arc(64, 64, 38, -Math.PI * 0.58, end);
      ctx.stroke();
      // 弧末端的箭头三角，沿切线方向
      const ax = 64 + Math.cos(end) * 38;
      const ay = 64 + Math.sin(end) * 38;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(end + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(-10, 9);
      ctx.lineTo(10, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** 元件下方的丝印铭牌；镜像布局下反向 X，保证文字仍是正立的 */
function Nameplate({
  x, y, text, w = P.PLATE_W, h = P.PLATE_H, dark = false, warning = false, mirrored,
}: {
  x: number; y: number; text: string; w?: number; h?: number;
  dark?: boolean; warning?: boolean; mirrored: boolean;
}) {
  const tex = usePlateTexture(text, dark, warning);
  useEffect(() => () => tex.dispose(), [tex]);
  // 旧版只离门板 0.002，和门板前表面争夺深度；统一错开 SURFACE_GAP 并加 offset 兜底
  return (
    <mesh position={[x, y, P.FRONT_Z + SURFACE_GAP]} scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={tex} side={THREE.DoubleSide} toneMapped={false}
        polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

type ButtonSpec = (typeof CABINET_BUTTONS)[number];

/** φ22 平头按钮：银色安装环 + 黑色内圈 + 凸出的彩色按钮头 + 顶面高光（可带灯） */
function PushButton({ spec, pressed, lit, onDown, onUp }: {
  spec: ButtonSpec; pressed: boolean; lit: boolean; onDown: () => void; onUp: () => void;
}) {
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: spec.color,
    metalness: 0.15,
    roughness: 0.42,
    emissive: pressed ? spec.color : '#000000',
    emissiveIntensity: pressed ? 0.5 : 0,
  }), [spec.color, pressed]);
  useEffect(() => () => headMat.dispose(), [headMat]);

  // 按下时按钮头沿 -Z 下沉，保留「按下-释放」的瞬时语义
  const headZ = P.FRONT_Z + P.BEZEL_T + P.HEAD_T / 2 - (pressed ? 0.004 : 0);

  return (
    <group position={[spec.x, spec.y, 0]}>
      <ZDisc r={P.BEZEL_R} depth={P.BEZEL_T} z={P.FRONT_Z + P.BEZEL_T / 2} material={bezelMat} />
      <ZDisc r={P.COLLAR_R} depth={0.003} z={P.FRONT_Z + P.BEZEL_T + 0.001} material={collarMat} />
      <mesh
        position={[0, 0, headZ]}
        rotation={[Math.PI / 2, 0, 0]}
        material={headMat}
        onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
        onPointerOut={onUp}
      >
        <cylinderGeometry args={[P.HEAD_R, P.HEAD_R, P.HEAD_T, 24]} />
      </mesh>
      {/* 带灯按钮（启动）：顶面是发光透镜，由运行指示灯驱动；普通按钮只做白色高光。
          透镜离按钮头顶面一个 SURFACE_GAP，且两种材质都带 polygonOffset 兜底。 */}
      <mesh position={[0, 0, headZ + P.HEAD_T / 2 + SURFACE_GAP]}>
        <circleGeometry args={[P.HEAD_R * 0.84, 24]} />
        {lit ? (
          <meshStandardMaterial
            color={spec.color} emissive={spec.color} emissiveIntensity={1.1}
            roughness={0.25} metalness={0.05}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
          />
        ) : (
          <meshBasicMaterial
            color="#ffffff" transparent opacity={0.13} depthWrite={false}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
          />
        )}
      </mesh>
    </group>
  );
}

/** 急停：RAL1021 黄色警示底盘 + 银色固定环 + Φ40 红色蘑菇头 + 旋转释放箭头 */
function EStopButton({ spec, pressed, mirrored, onDown, onUp }: {
  spec: ButtonSpec; pressed: boolean; mirrored: boolean; onDown: () => void; onUp: () => void;
}) {
  const symbol = useEStopSymbol();
  useEffect(() => () => symbol.dispose(), [symbol]);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: spec.color,
    metalness: 0.12,
    roughness: 0.38,
    emissive: pressed ? spec.color : '#000000',
    emissiveIntensity: pressed ? 0.35 : 0,
  }), [spec.color, pressed]);
  useEffect(() => () => headMat.dispose(), [headMat]);

  const headZ = P.FRONT_Z + 0.010 + P.ESTOP_T / 2 - (pressed ? 0.005 : 0);

  return (
    <group position={[spec.x, spec.y, 0]}>
      <ZDisc r={P.ESTOP_BASE_R} depth={0.003} z={P.FRONT_Z + 0.0015} material={estopBaseMat} />
      <ZDisc r={P.ESTOP_BASE_R * 0.78} depth={0.004} z={P.FRONT_Z + 0.004} material={bezelMat} />
      {/* 固定环略向外错开，避免它的背面与银环正面精确共面 */}
      <ZDisc
        r={P.ESTOP_HEAD_R + 0.002} depth={0.004}
        z={P.FRONT_Z + 0.008 + SURFACE_GAP / 2} material={collarMat}
      />
      <mesh
        position={[0, 0, headZ]}
        rotation={[Math.PI / 2, 0, 0]}
        material={headMat}
        onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
        onPointerOut={onUp}
      >
        <cylinderGeometry args={[P.ESTOP_HEAD_R, P.ESTOP_HEAD_R, P.ESTOP_T, 28]} />
      </mesh>
      <mesh position={[0, 0, headZ + P.ESTOP_T / 2]} scale={[1, 1, 0.55]} material={headMat}>
        <sphereGeometry args={[P.ESTOP_HEAD_R, 24, 12]} />
      </mesh>
      {/* 头部白色旋转释放符号：贴在压扁球面最前端，旧 0.001 偏置会闪，改用 SURFACE_GAP */}
      <mesh
        position={[0, 0, headZ + P.ESTOP_T / 2 + P.ESTOP_HEAD_R * 0.55 + SURFACE_GAP]}
        scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}
      >
        <circleGeometry args={[P.ESTOP_HEAD_R * 0.7, 24]} />
        <meshBasicMaterial
          map={symbol} transparent depthWrite={false} toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

/** 两位选择开关：φ22 金属环 + 黑色短手柄，手柄角度只读跟随当前模式 */
function SelectorSwitch({ mode }: { mode: AppMode }) {
  const angle = CABINET_SELECTOR.angles[mode];
  return (
    <group position={[CABINET_SELECTOR.x, CABINET_SELECTOR.y, 0]}>
      <ZDisc r={P.SELECTOR_R} depth={P.BEZEL_T} z={P.FRONT_Z + P.BEZEL_T / 2} material={bezelMat} />
      <ZDisc r={P.COLLAR_R} depth={0.003} z={P.FRONT_Z + P.BEZEL_T + 0.001} material={collarMat} />
      {/* 面板上的两个档位刻线，标明「手动 / 自动」两个位置；贴面统一错开 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.022, 0, P.FRONT_Z + SURFACE_GAP]} material={materials.decalDark}>
          <boxGeometry args={[0.002, 0.006, 0.001]} />
        </mesh>
      ))}
      <group rotation={[0, 0, angle]}>
        {/* 亮银手柄明显伸出黑色内圈，一眼能看出是可旋转的选择开关 */}
        <mesh position={[0, P.SELECTOR_HANDLE_L * 0.40, P.FRONT_Z + 0.013]} material={bezelMat}>
          <boxGeometry args={[P.SELECTOR_HANDLE_W, P.SELECTOR_HANDLE_L, 0.010]} />
        </mesh>
        {/* 手柄端部的深色指示线：旧版背面正好贴在手柄正面，会共面闪烁 */}
        <mesh
          position={[0, P.SELECTOR_HANDLE_L * 0.82, P.FRONT_Z + 0.018 + SURFACE_GAP]}
          material={materials.decalDark}
        >
          <boxGeometry args={[P.SELECTOR_HANDLE_W * 0.9, 0.004, 0.001]} />
        </mesh>
      </group>
    </group>
  );
}

/** 指示灯：银色安装环 + 黑色灯座 + 凸面玻璃透镜（灭态是同色暗玻璃，不是黑洞） */
function IndicatorLamp({ x, color, on }: { x: number; color: string; on: boolean }) {
  // 实物 LED 透镜灭态仍带自身色相（深绿 / 深琥珀 / 深红），统一用黑色会像没装灯泡
  const offColor = useMemo(() => new THREE.Color(color).multiplyScalar(0.3), [color]);
  const lensMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: on ? color : offColor,
    emissive: on ? color : '#000000',
    emissiveIntensity: on ? 1.9 : 0,
    metalness: 0.05,
    roughness: 0.22,
  }), [color, on, offColor]);
  useEffect(() => () => lensMat.dispose(), [lensMat]);

  return (
    <group position={[x, CABINET_LAMP_Y, 0]}>
      <ZDisc r={P.LAMP_BEZEL_R} depth={0.004} z={P.FRONT_Z + 0.002} material={bezelMat} />
      <ZDisc r={P.LAMP_BEZEL_R * 0.82} depth={0.003} z={P.FRONT_Z + 0.005} material={collarMat} />
      <mesh position={[0, 0, P.FRONT_Z + 0.008]} scale={[1, 1, 0.6]} material={lensMat}>
        <sphereGeometry args={[P.LAMP_LENS_R, 20, 12]} />
      </mesh>
    </group>
  );
}

const LAMP_COLORS = {
  green: VISUAL.LAMP_GREEN,
  yellow: VISUAL.LAMP_YELLOW,
  red: VISUAL.LAMP_RED,
} as const;

/**
 * 控制柜：柜体 + RAL7035 浅灰门板 + φ22 工业元件 + 丝印铭牌。
 * 参照施耐德 Harmony XB2/XB4 实物：金属安装环、凸头按钮、带灯按钮、
 * 黄色底座红色蘑菇头急停、选择开关、圆形 LED 指示灯、元件下方 legend plate；
 * 布局按官方规范「指示灯在上、指令开关在下，操作时手不遮挡指示」。
 *
 * 局部原点 = 控制柜安装基准（柜脚局部 y=0.01）；面板法线朝 +Z，元件全部凸出面板。
 * 按钮与灯的坐标、尺寸、颜色一律来自 constants.ts 的 CABINET_* 表，组件不回填坐标。
 */
export function ControlCabinet() {
  const buttons = useDispensingStore((s) => s.buttons);
  const lamp = useDispensingStore((s) => s.lamp);
  const setButton = useDispensingStore((st) => st.setButton);
  const mirrored = useAppStore((s) => s.mirrored);
  const stage = useAppStore((s) => s.activeStage);
  const mode = useAppStore((s) => s.mode);
  /**
   * 只有整机（AssembledScene）才套 X 负缩放 group；部件展台是正缩放，
   * 展台下若仍按 mirrored 反转铭牌，反而会把本来正立的文字翻成镜像字。
   */
  const flipText = mirrored && !stage;

  return (
    // 局部原点 = 控制柜安装基准（ASSEMBLY.cabinet.position 给出世界位姿）
    <group>
      {/* 柜体 + 柜脚 */}
      <mesh position={[0, CABINET_SIZE[1] / 2 + 0.01, 0]} castShadow material={materials.cabinet}>
        <boxGeometry args={CABINET_SIZE} />
      </mesh>
      {/* 柜脚外沿比柜体大一圈：旧版两者 X/Z 尺寸完全相同，侧面在 y=0.01~0.02 精确共面 */}
      <mesh position={[0, 0.01, 0]} material={materials.darkMetal}>
        <boxGeometry args={[
          CABINET_SIZE[0] + 2 * SURFACE_GAP, 0.02, CABINET_SIZE[2] + 2 * SURFACE_GAP,
        ]} />
      </mesh>

      {/* 门板：深色边框形成门缝，浅灰面板托住彩色元件。
          面板背面朝内嵌进柜体（旧版背面与柜体前表面精确共面），朝外的面不再争夺深度。 */}
      <mesh
        position={[0, P.CENTER_Y, P.FRONT_Z - P.T / 2 - 0.001 - SURFACE_GAP / 2]}
        material={materials.darkMetal}
      >
        <boxGeometry args={[P.W + 0.012, P.H + 0.012, 0.004]} />
      </mesh>
      <mesh position={[0, P.CENTER_Y, P.FRONT_Z - P.T / 2 - SURFACE_GAP / 2]} material={materials.panel}>
        <boxGeometry args={[P.W, P.H, P.T]} />
      </mesh>

      {/* 顶部设备铭牌 */}
      <Nameplate
        x={0} y={P.TITLE_Y} text="自动配药 · 控制面板"
        w={P.TITLE_W} h={P.TITLE_H} dark mirrored={flipText}
      />

      {/* 指示灯排（绿=运行 / 黄=待机 / 红=报警，与三色灯塔联动） */}
      {CABINET_LAMPS.map((l) => (
        <IndicatorLamp key={l.key} x={l.x} color={LAMP_COLORS[l.key]} on={!!lamp[l.key]} />
      ))}
      {CABINET_LAMPS.map((l) => (
        <Nameplate key={`lamp-plate-${l.key}`} x={l.x} y={CABINET_LAMP_Y + P.PLATE_DY} text={l.label} mirrored={flipText} />
      ))}

      {/* 功能分区线：贴面薄片整体抬到门板前表面之外 */}
      <mesh position={[0, P.DIVIDER_Y, P.FRONT_Z + SURFACE_GAP + 0.001]} material={trimMat}>
        <boxGeometry args={[P.W - 0.03, 0.0015, 0.002]} />
      </mesh>

      {/* 按钮两排；急停独占下排左侧，中间是手动/自动选择开关 */}
      {CABINET_BUTTONS.map((b) => {
        const handlers = {
          pressed: !!buttons[b.key],
          onDown: () => setButton(b.key, true),
          onUp: () => setButton(b.key, false),
        };
        return b.kind === 'estop'
          ? <EStopButton key={b.key} spec={b} mirrored={flipText} {...handlers} />
          : <PushButton key={b.key} spec={b} lit={b.key === 'start' && !!lamp.green} {...handlers} />;
      })}
      <SelectorSwitch mode={mode} />
      {CABINET_BUTTONS.map((b) => (
        <Nameplate
          key={`btn-plate-${b.key}`} x={b.x} y={b.y + P.PLATE_DY} text={b.label}
          warning={b.kind === 'estop'} mirrored={flipText}
        />
      ))}
      <Nameplate
        x={CABINET_SELECTOR.x} y={CABINET_SELECTOR.y + P.PLATE_DY}
        text={CABINET_SELECTOR.label} mirrored={flipText}
      />

      {/* 底部型号条 */}
      <Nameplate x={0} y={P.FOOTER_Y} text="DT-ADP / AC220V" w={0.18} h={0.012} mirrored={flipText} />

      {/* 柜门锁芯 */}
      <group position={[P.LOCK_X, P.LOCK_Y, 0]}>
        <ZDisc r={0.009} depth={0.004} z={P.FRONT_Z + 0.002} material={bezelMat} />
        <ZDisc r={0.005} depth={0.002} z={P.FRONT_Z + 0.005} material={materials.darkMetal} />
      </group>
    </group>
  );
}

/**
 * 三色信号灯塔（立杆 + 灯座 + 绿/黄/红圆柱灯罩 + 层间隔环）
 *
 * 局部原点 = 立杆底面（ASSEMBLY.lightTower.position 给出世界位姿）。
 * 立杆顶面 = LIGHT_POLE_H = LIGHT_POLE_Y（红灯罩中心），三者由同一常量推导，
 * 保证灯头坐在杆顶而不是悬浮（旧实现 LIGHT_POLE_H=0.55 与灯罩 1.15 断开 0.6m）。
 */
export function LightTower() {
  const lamp = useDispensingStore((s) => s.lamp);
  const lampColors = {
    green: VISUAL.LAMP_GREEN,
    yellow: VISUAL.LAMP_YELLOW,
    red: VISUAL.LAMP_RED,
  } as const;
  // 灭态灯罩也保留各自色相的暗玻璃质感，和按钮柜指示灯一致
  const offColors = useMemo(() => ({
    green: new THREE.Color(VISUAL.LAMP_GREEN).multiplyScalar(0.3),
    yellow: new THREE.Color(VISUAL.LAMP_YELLOW).multiplyScalar(0.3),
    red: new THREE.Color(VISUAL.LAMP_RED).multiplyScalar(0.3),
  }), []);
  const colors = [
    { key: 'green' as const, y: LIGHT_POLE_Y + LIGHT_DOME_STEP * 2 },
    { key: 'yellow' as const, y: LIGHT_POLE_Y + LIGHT_DOME_STEP },
    { key: 'red' as const, y: LIGHT_POLE_Y },
  ];
  return (
    // 局部原点 = 立杆底面（ASSEMBLY.lightTower.position 给出世界位姿）
    <group>
      {/* 立杆：从地面 0 延伸到灯罩中心，灯头不再悬空 */}
      <mesh position={[0, LIGHT_POLE_H / 2, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[0.012, 0.02, LIGHT_POLE_H, 8]} />
      </mesh>
      {/* 底座法兰（地面） */}
      <mesh position={[0, 0.008, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[0.045, 0.045, 0.016, 12]} />
      </mesh>
      {/* 灯座：把三色灯罩固定到杆顶 */}
      <mesh position={[0, LIGHT_POLE_Y - LIGHT_DOME_R + 0.008, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[LIGHT_DOME_R * 0.86, LIGHT_DOME_R * 0.86, 0.016, 16]} />
      </mesh>
      {colors.map((c) => {
        const on = !!lamp[c.key];
        return (
          <group key={c.key} position={[0, c.y, 0]}>
            {/* 圆柱灯罩：真实警示灯是分层圆柱而非串起来的球 */}
            <mesh>
              <cylinderGeometry args={[LIGHT_DOME_R, LIGHT_DOME_R, LIGHT_DOME_STEP * 0.9, 20]} />
              <meshStandardMaterial
                color={on ? lampColors[c.key] : offColors[c.key]}
                emissive={on ? lampColors[c.key] : '#000000'}
                emissiveIntensity={on ? 2.2 : 0}
                roughness={0.25}
                metalness={0.1}
              />
            </mesh>
            {/* 层间黑色隔离环 */}
            <mesh position={[0, -LIGHT_DOME_STEP * 0.47, 0]}>
              <cylinderGeometry args={[LIGHT_DOME_R * 1.02, LIGHT_DOME_R * 1.02, 0.008, 20]} />
              <meshStandardMaterial color="#1b2430" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* 顶盖 */}
      <mesh position={[0, LIGHT_POLE_Y + LIGHT_DOME_STEP * 2.5, 0]} material={materials.darkMetal}>
        <cylinderGeometry args={[LIGHT_DOME_R * 0.92, LIGHT_DOME_R, 0.012, 20]} />
      </mesh>
    </group>
  );
}
