import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { isViewerRuntime } from '@digital-twin/shared';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import { useAppStore } from '../../../stores/useAppStore';
import {
  CABINET_SIZE, CABINET_PANEL, CABINET_BUTTONS, CABINET_LAMPS, CABINET_LAMP_Y, CABINET_SELECTOR,
  CABINET_SELECTOR_SHAPE, CABINET_ESTOP_SHAPE,
  LIGHT_DOME_R, LIGHT_DOME_STEP, LIGHT_POLE_H, LIGHT_POLE_Y, VISUAL, SURFACE_GAP,
} from '../constants';
import { materials } from '../../../components/scene/shared/materials';
import { CABINET_BUTTON_IO, selectorIo, type CabinetButtonKey } from '../simulationIo';
import { writeSimPlcVar, writeSimPlcVars } from '../../../services/simulationPlc';

const P = CABINET_PANEL;
const SW = CABINET_SELECTOR_SHAPE;
const ES = CABINET_ESTOP_SHAPE;

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
/**
 * 旋钮拨柄 / 银色固定环专用：低金属度亮银。
 * 旧版用 bezelMat（metalness 0.9）做拨柄，场景里没有 envMap 时金属无漫反射，
 * 反射不到环境就渲染成一团深灰，拨柄在黑色旋钮座上完全看不见。
 */
const switchMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.handle, metalness: 0.18, roughness: 0.36,
});
/** 旋钮座顶面的银色刻度环是贴面薄片：再叠一层 polygonOffset 抗远机位闪烁 */
const switchDecalMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.handle, metalness: 0.18, roughness: 0.36,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
/** 急停收颈：深石墨圆柱，衬出「头大杆细」的蘑菇轮廓 */
const neckMat = new THREE.MeshStandardMaterial({
  color: P.COLORS.neck, metalness: 0.35, roughness: 0.55,
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

/**
 * 急停蘑菇头平顶的「旋转释放」符号（透明底白色双弧箭头，实物为激光刻印）。
 * 旧版是单条 288° 的粗弧 + 大三角，远看就是一个字母 C，既不像旋转标记，
 * 又把红色平顶占满了；改成两段对称细弧 + 小箭头，留白更多也更容易辨认。
 */
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
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      const radius = 36;
      const arcs: [number, number][] = [
        [-Math.PI * 0.92, -Math.PI * 0.12],
        [Math.PI * 0.08, Math.PI * 0.88],
      ];
      arcs.forEach(([from, to]) => {
        ctx.beginPath();
        ctx.arc(64, 64, radius, from, to);
        ctx.stroke();
        // 弧末端的箭头三角，沿切线方向
        const ax = 64 + Math.cos(to) * radius;
        const ay = 64 + Math.sin(to) * radius;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(to + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-6, 7);
        ctx.lineTo(6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
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

/**
 * 急停：RAL1021 黄色警示底盘 → 亮银固定环 → 深石墨收颈 → 红色蘑菇伞 → 旋转释放符号。
 *
 * 关键改造：红头不再用「圆柱 + 压扁球」拼成一颗圆珠，而是按
 * CABINET_ESTOP_SHAPE.PROFILE 车削（LatheGeometry）出真实蘑菇剖面：
 * 细颈 → 外扩伞底 → 圆角伞缘 → 宽平顶。直径层级黄盘 > 红伞 > 银环 > 收颈，
 * 斜视角能直接看出「头大杆细」，平顶区域留给符号贴片，不悬浮也不共面。
 */
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
  /** 剖面点是相对面板前表面的 Z；Lathe 默认绕 +Y，转 90° 后轴朝 +Z（朝观察者） */
  const profile = useMemo(
    () => ES.PROFILE.map(([r, z]) => new THREE.Vector2(r, z)),
    [],
  );

  return (
    <group position={[spec.x, spec.y, 0]}>
      {/* 黄盘与银环固定在面板上，按压时不跟着下沉 */}
      <ZDisc r={P.ESTOP_BASE_R} depth={ES.BASE_T} z={P.FRONT_Z + ES.BASE_T / 2} material={estopBaseMat} />
      <ZDisc r={ES.RING_R} depth={ES.RING_T} z={ES.RING_Z} material={switchMat} />
      {/* 交互挂在头部 group：子网格命中后冒泡，符号贴片不会挡住点击 */}
      <group
        position={[0, 0, -(pressed ? ES.PRESS_DEPTH : 0)]}
        onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
        onPointerOut={onUp}
      >
        {/* 收颈柱底端嵌进固定环，避免端面精确共面 */}
        <ZDisc r={ES.NECK_R} depth={ES.NECK_H} z={ES.NECK_Z} material={neckMat} />
        <mesh position={[0, 0, P.FRONT_Z]} rotation={[Math.PI / 2, 0, 0]} material={headMat}>
          <latheGeometry args={[profile, 32]} />
        </mesh>
        {/* 符号只比平顶高一个 SURFACE_GAP，且带 polygonOffset 兜底 */}
        <mesh
          position={[0, 0, ES.CAP_Z + SURFACE_GAP]}
          scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}
        >
          <circleGeometry args={[ES.SYMBOL_R, 32]} />
          <meshBasicMaterial
            map={symbol} transparent depthWrite={false} toneMapped={false}
            side={THREE.DoubleSide}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 两位选择开关：φ22 亮银安装环 + 黑色旋钮座 + 银色刻度环 + 楔形拨柄。
 *
 * 关键改造：拨柄长度推到安装环半径的 1.7 倍以上，用低金属度亮银材质
 * （无 envMap 时也保持浅色），并做成根部宽 / 尖端收窄的箭头形，
 * 一眼能看出指向哪一档；档位刻线按 manual / auto 的真实偏角摆放。
 */
function SelectorSwitch({ auto, onToggle }: { auto: boolean; onToggle: () => void }) {
  // 旋钮是物理输入元件，只有手动/自动两档；不再按 AppMode 停在软件中位
  const angle = CABINET_SELECTOR.angles[auto ? 'auto' : 'manual'];
  const handleShape = useMemo(() => {
    const s = new THREE.Shape();
    const half = SW.HANDLE_W / 2;
    const tip = SW.HANDLE_TIP_W / 2;
    const root = SW.HANDLE_ROOT_Y;
    const shoulder = root + SW.HANDLE_L * SW.HANDLE_SHOULDER;
    const end = root + SW.HANDLE_L;
    s.moveTo(-half, root);
    s.lineTo(half, root);
    s.lineTo(half, shoulder);
    s.lineTo(tip, end);
    s.lineTo(-tip, end);
    s.lineTo(-half, shoulder);
    s.closePath();
    return s;
  }, []);

  return (
    // 事件挂在 group 上：R3F 会沿场景图冒泡，点中旋钮座/刻度环/拨柄任一处都能拨档
    <group
      position={[CABINET_SELECTOR.x, CABINET_SELECTOR.y, 0]}
      onPointerDown={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <ZDisc r={P.SELECTOR_R} depth={P.BEZEL_T} z={P.FRONT_Z + P.BEZEL_T / 2} material={switchMat} />
      <ZDisc r={SW.KNOB_R} depth={SW.KNOB_T} z={SW.KNOB_Z} material={collarMat} />
      {/* 旋钮座顶面的银色刻度环：贴面统一错开 SURFACE_GAP */}
      <mesh position={[0, 0, SW.KNOB_TOP + SURFACE_GAP]} material={switchDecalMat}>
        <ringGeometry args={[SW.SCALE_R0, SW.SCALE_R1, 32]} />
      </mesh>
      {/* 两个档位标记：小圆点按 manual / auto 真实偏角摆放，与拨柄指向严格同源 */}
      {(['manual', 'auto'] as const).map((key) => {
        const a = CABINET_SELECTOR.angles[key];
        return (
          <mesh
            key={key}
            position={[-Math.sin(a) * SW.NOTCH_R, Math.cos(a) * SW.NOTCH_R, P.FRONT_Z + SURFACE_GAP]}
            material={materials.decalDark}
          >
            <circleGeometry args={[SW.NOTCH_DOT_R, 12]} />
          </mesh>
        );
      })}
      <group rotation={[0, 0, angle]}>
        {/* 楔形拨柄：ExtrudeGeometry 沿 +Z 挤出，前端是收窄的箭头 */}
        <mesh position={[0, 0, SW.HANDLE_Z]} material={switchMat}>
          <extrudeGeometry args={[handleShape, { depth: SW.HANDLE_T, bevelEnabled: false }]} />
        </mesh>
        {/* 拨柄中轴的深色指示槽，与柄面错开 SURFACE_GAP */}
        <mesh
          position={[0, SW.MARK_Y, SW.HANDLE_TOP + SURFACE_GAP]}
          material={materials.decalDark}
        >
          <planeGeometry args={[SW.MARK_W, SW.MARK_L]} />
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
  const selectorAuto = useDispensingStore((s) => s.selectorAuto);
  const mirrored = useAppStore((s) => s.mirrored);
  const stage = useAppStore((s) => s.activeStage);
  const mode = useAppStore((s) => s.mode);

  /** 拨动两位旋钮：仿真模式一帧写 SEL_MANUAL / SEL_AUTO 两个互锁输入线圈。
   *  观众端是只读跟随页，档位只能来自主控广播快照，禁止本地拨动造成画面与主控不一致。 */
  const toggleSelector = () => {
    if (isViewerRuntime()) return;
    const next = !useDispensingStore.getState().selectorAuto;
    useDispensingStore.getState().setSelectorAuto(next);
    if (mode === 'sim') {
      const io = selectorIo(next);
      void writeSimPlcVars(io.names, io.values);
    }
  };
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
        const key = b.key as CabinetButtonKey;
        // 仿真模式：按钮箱是真实的 PLC 输入元件，按下/松开必须写对应线圈；
        // 本地 store 仅做即时外观反馈，下一轮 readVars 回读会把它对齐到 PLC 真值。
        // 其余模式仍只驱动本地演示状态机，不发起网络写入。
        const press = (down: boolean) => {
          setButton(key, down);
          if (mode === 'sim') void writeSimPlcVar(CABINET_BUTTON_IO[key], down);
        };
        const handlers = {
          pressed: !!buttons[b.key],
          onDown: () => press(true),
          onUp: () => press(false),
        };
        return b.kind === 'estop'
          ? <EStopButton key={b.key} spec={b} mirrored={flipText} {...handlers} />
          : <PushButton key={b.key} spec={b} lit={b.key === 'start' && !!lamp.green} {...handlers} />;
      })}
      <SelectorSwitch auto={selectorAuto} onToggle={toggleSelector} />
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
