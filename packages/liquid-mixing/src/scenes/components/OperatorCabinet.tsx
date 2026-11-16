/**
 * 操作台开关柜（3D）—— 参照自动配药 ControlCabinet 复刻。
 *
 * 形态：深灰钣金柜体 + 柜脚 + RAL7035 浅灰门板 + φ22 工业元件 + 中文丝印铭牌；
 * 布局按施耐德官方规范「指示灯在上、指令开关在下，操作时手不遮挡指示」。
 *
 * 元件全部由 LIQUID_OPERATOR_BUTTONS / LIQUID_OPERATOR_SELECTOR 渲染：
 * 5 个点动按钮（启动 / 停止 / 复位 / 放料 一排，急停蘑菇头独立）+ 手自动两位旋钮，
 * 柜面指示灯三盏与场景塔式三色灯**同源同色**（读同一份 store.lamps，不新增地址）。
 *
 * 局部原点 = 柜脚底面中心，门板法线朝 +Z；AssembledScene 只负责给世界位姿。
 * 观众端所有交互直接短路，档位与灯态只跟随主控广播快照。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { isViewerRuntime } from '@digital-twin/shared';
import { useLiquidStore } from '../../stores/useLiquidStore';
import { GAP, LM } from '../shared/liquidMaterials';
import {
  LIQUID_OPERATOR_BUTTONS, LIQUID_OPERATOR_SELECTOR,
  type LiquidOperatorButton, type LiquidOperatorMode,
} from '../../constants/liquidConstants';
import { pressLiquidOperator, selectLiquidOperatorMode } from '../../platform/liquidOperator';

/* ------------------------------ 柜体尺寸表 ------------------------------ */

const CABINET_SIZE: [number, number, number] = [0.30, 0.52, 0.16];
const PANEL_T = 0.006;
const PANEL_W = CABINET_SIZE[0] - 0.036;
const PANEL_H = CABINET_SIZE[1] - 0.10;
/** 门板前表面：所有元件沿 +Z 从这个面往外逐层派生，绝不与柜体前表面共面 */
const FRONT_Z = CABINET_SIZE[2] / 2 + PANEL_T;
/** 门板中心高度（柜体自身高度的一半 + 柜脚抬升量） */
const CENTER_Y = CABINET_SIZE[1] / 2 + 0.01;
const FOOT_H = 0.02;

/** φ22 元件基准尺寸：所有按钮 / 灯 / 旋钮由此派生，改一处不会走形 */
const BEZEL_R = 0.0115;
const BEZEL_T = 0.004;
const COLLAR_R = BEZEL_R * 0.8;
const HEAD_R = BEZEL_R * 0.7;
const HEAD_T = 0.007;
const PRESS_DEPTH = 0.0035;

const ESTOP_BASE_R = BEZEL_R * 1.28;
const ESTOP_T = 0.005;
const ESTOP_RING_R = BEZEL_R * 0.92;
const ESTOP_HEAD_R = BEZEL_R * 1.06;

const LAMP_BEZEL_R = BEZEL_R * 0.85;
const LAMP_LENS_R = LAMP_BEZEL_R * 0.76;

const SELECTOR_R = BEZEL_R;
const KNOB_R = BEZEL_R * 0.75;
const KNOB_T = 0.009;
const HANDLE_W = BEZEL_R * 0.34;
const HANDLE_L = BEZEL_R * 1.5;
const HANDLE_T = 0.004;

const PLATE_W = 0.05;
const PLATE_H = 0.0105;
const PLATE_DY = -0.019;

/** 柜面布局：三排分区，坐标一律相对柜脚底面（与自动配药同一套读法） */
const LAMP_Y = 0.375;
const LAMP_XS = [-0.06, 0, 0.06];
const TITLE_Y = 0.443;
const DIVIDER_Y = 0.235;
const BTN_ROW1_Y = 0.285;
const BTN_ROW2_Y = 0.175;
const FOOTER_Y = 0.09;
/** 上排四个平头按钮的 x；急停与选择开关在下排左右 */
const PUSH_XS = [-0.078, -0.026, 0.026, 0.078];
const ESTOP_X = -0.055;
const SELECTOR_X = 0.055;

/** 柜面三个指示灯与塔式三色灯同源同序（绿 / 黄 / 红） */
const LAMP_KEYS = ['green', 'yellow', 'red'] as const;
const LAMP_LABELS: Record<(typeof LAMP_KEYS)[number], string> = {
  green: '运行', yellow: '待机', red: '故障',
};

/* ------------------------------ 小工具 ------------------------------ */

/** 沿 +Z 的圆盘：cylinderGeometry 默认轴是 +Y，必须绕 X 转 90° 才朝观察者 */
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
 * 中文丝印铭牌：CanvasTexture 画字，随 3D 距离缩放、能被正确遮挡，不依赖外部字体文件。
 * warning 模式是急停专用：警示黄底 + 黑字，与实物急停标牌一致。
 */
function usePlateTexture(text: string, dark: boolean, warning: boolean) {
  return useMemo(() => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const c = document.createElement('canvas');
    // 512×128：铭牌在 1:1 展台里约占 60×14 px，256×64 会被双线性插值糊成一片
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = warning ? '#f2c200' : dark ? '#1b2430' : '#e8eef5';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = warning ? '#7a6300' : dark ? '#8c99a9' : '#aab6c4';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
      ctx.fillStyle = warning ? '#1a1a1a' : dark ? '#f1f5f9' : '#1e293b';
      let size = 76;
      const font = (px: number) => `bold ${px}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.font = font(size);
      while (ctx.measureText(text).width > c.width - 48 && size > 28) {
        size -= 4;
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

/** 元件下方的丝印铭牌；与门板前表面错开 ≥ GAP，避免共面闪烁 */
function Nameplate({ x, y, text, w = PLATE_W, h = PLATE_H, dark = false, warning = false }: {
  x: number; y: number; text: string; w?: number; h?: number; dark?: boolean; warning?: boolean;
}) {
  const tex = usePlateTexture(text, dark, warning);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[x, y, FRONT_Z + GAP]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={tex} side={THREE.DoubleSide} toneMapped={false}
        polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

/* ------------------------------ 元件 ------------------------------ */

/** φ22 平头按钮：银色安装环 + 黑色内圈 + 凸出的彩色按钮头 + 顶面高光 */
function PushButton({ item, x, y, pressed, onDown, onUp }: {
  item: LiquidOperatorButton; x: number; y: number;
  pressed: boolean; onDown: () => void; onUp: () => void;
}) {
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: item.color, metalness: 0.15, roughness: 0.42,
    emissive: pressed ? item.color : '#000000',
    emissiveIntensity: pressed ? 0.5 : 0,
  }), [item.color, pressed]);
  useEffect(() => () => headMat.dispose(), [headMat]);
  // 按下时按钮头沿 -Z 下沉，保留「按下-释放」的瞬时语义
  const headZ = FRONT_Z + BEZEL_T + HEAD_T / 2 - (pressed ? PRESS_DEPTH : 0);
  return (
    <group position={[x, y, 0]}>
      <ZDisc r={BEZEL_R} depth={BEZEL_T} z={FRONT_Z + BEZEL_T / 2} material={LM.cabinetBezel} />
      <ZDisc r={COLLAR_R} depth={0.003} z={FRONT_Z + BEZEL_T + 0.0012} material={LM.cabinetCollar} />
      <mesh position={[0, 0, headZ]} rotation={[Math.PI / 2, 0, 0]} material={headMat}
        onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
        onPointerOut={onUp}>
        <cylinderGeometry args={[HEAD_R, HEAD_R, HEAD_T, 24]} />
      </mesh>
      {/* 顶面高光透镜：离按钮头顶面一个 GAP，带 polygonOffset 兜底 */}
      <mesh position={[0, 0, headZ + HEAD_T / 2 + GAP]}>
        <circleGeometry args={[HEAD_R * 0.84, 24]} />
        <meshBasicMaterial
          color="#ffffff" transparent opacity={0.13} depthWrite={false}
          polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

/**
 * 急停：警示黄底盘 → 亮银固定环 → 深石墨收颈 → 红色蘑菇伞（车削剖面）+ 旋转释放符号。
 * 剖面按「细颈 → 外扩伞底 → 圆角伞缘 → 宽平顶」车削，斜视角能直接看出「头大杆细」。
 */
function EStopButton({ item, x, y, pressed, onDown, onUp }: {
  item: LiquidOperatorButton; x: number; y: number;
  pressed: boolean; onDown: () => void; onUp: () => void;
}) {
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: item.color, metalness: 0.12, roughness: 0.38,
    emissive: pressed ? item.color : '#000000',
    emissiveIntensity: pressed ? 0.35 : 0,
  }), [item.color, pressed]);
  useEffect(() => () => headMat.dispose(), [headMat]);
  /** 剖面点是相对门板前表面的 Z；Lathe 默认绕 +Y，转 90° 后轴朝 +Z */
  const profile = useMemo(() => [
    [0.0032, 0],
    [0.0032, 0.008],
    [ESTOP_HEAD_R * 0.55, 0.0105],
    [ESTOP_HEAD_R, 0.0135],
    [ESTOP_HEAD_R, 0.0185],
    [ESTOP_HEAD_R * 0.86, 0.0215],
    [0, 0.0225],
  ].map(([r, z]) => new THREE.Vector2(r, z)), []);
  const neckH = 0.009;
  return (
    <group position={[x, y, 0]}>
      <ZDisc r={ESTOP_BASE_R} depth={ESTOP_T} z={FRONT_Z + ESTOP_T / 2} material={LM.cabinetCollar} />
      <ZDisc r={ESTOP_RING_R} depth={BEZEL_T} z={FRONT_Z + ESTOP_T + BEZEL_T / 2} material={LM.cabinetBezel} />
      <group position={[0, 0, -(pressed ? PRESS_DEPTH : 0)]}
        onPointerDown={(e) => { e.stopPropagation(); onDown(); }}
        onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
        onPointerOut={onUp}>
        <ZDisc r={0.0032} depth={neckH} z={FRONT_Z + ESTOP_T + BEZEL_T + neckH / 2} material={LM.cabinetCollar} />
        <mesh position={[0, 0, FRONT_Z + ESTOP_T + BEZEL_T]} rotation={[Math.PI / 2, 0, 0]} material={headMat}>
          <latheGeometry args={[profile, 32]} />
        </mesh>
      </group>
    </group>
  );
}

/** 两位选择开关：亮银安装环 + 黑色旋钮座 + 银色刻度环 + 楔形拨柄（指向当前档位） */
function SelectorSwitch({ mode, x, y, onSelect }: {
  mode: LiquidOperatorMode; x: number; y: number; onSelect: (m: LiquidOperatorMode) => void;
}) {
  const angle = LIQUID_OPERATOR_SELECTOR.angles[mode];
  const handleShape = useMemo(() => {
    const s = new THREE.Shape();
    const half = HANDLE_W / 2;
    const tip = HANDLE_W * 0.22;
    const root = KNOB_R * 0.16;
    const shoulder = root + HANDLE_L * 0.62;
    const end = root + HANDLE_L;
    s.moveTo(-half, root);
    s.lineTo(half, root);
    s.lineTo(half, shoulder);
    s.lineTo(tip, end);
    s.lineTo(-tip, end);
    s.lineTo(-half, shoulder);
    s.closePath();
    return s;
  }, []);
  const knobTop = FRONT_Z + BEZEL_T + KNOB_T;
  return (
    <group position={[x, y, 0]} onPointerDown={(e) => { e.stopPropagation(); onSelect(mode === 'auto' ? 'manual' : 'auto'); }}>
      <ZDisc r={SELECTOR_R} depth={BEZEL_T} z={FRONT_Z + BEZEL_T / 2} material={LM.cabinetBezel} />
      <ZDisc r={KNOB_R} depth={KNOB_T} z={FRONT_Z + BEZEL_T + KNOB_T / 2} material={LM.cabinetCollar} />
      {/* 旋钮座顶面的银色刻度环：贴面统一错开 GAP */}
      <mesh position={[0, 0, knobTop + GAP]} material={LM.cabinetBezel}>
        <ringGeometry args={[KNOB_R * 0.68, KNOB_R * 0.92, 32]} />
      </mesh>
      {/* 两个档位标记：小圆点按 manual / auto 真实偏角摆放，与拨柄指向严格同源 */}
      {(['manual', 'auto'] as const).map((key) => {
        const a = LIQUID_OPERATOR_SELECTOR.angles[key];
        return (
          <mesh key={key}
            position={[-Math.sin(a) * SELECTOR_R * 1.5, Math.cos(a) * SELECTOR_R * 1.5, FRONT_Z + GAP]}
            material={LM.cabinetDecal}>
            <circleGeometry args={[BEZEL_R * 0.16, 12]} />
          </mesh>
        );
      })}
      <group rotation={[0, 0, angle]}>
        {/* 楔形拨柄：ExtrudeGeometry 沿 +Z 挤出，前端收窄成箭头 */}
        <mesh position={[0, 0, knobTop]} material={LM.cabinetBezel}>
          <extrudeGeometry args={[handleShape, { depth: HANDLE_T, bevelEnabled: false }]} />
        </mesh>
      </group>
    </group>
  );
}

/** 柜面指示灯：银色安装环 + 黑色灯座 + 凸面玻璃透镜（亮态取三色灯塔同一块材质） */
function IndicatorLamp({ x, y, kind, on }: {
  x: number; y: number; kind: (typeof LAMP_KEYS)[number]; on: boolean;
}) {
  const lensMat = on
    ? (kind === 'green' ? LM.lampGreen : kind === 'yellow' ? LM.lampYellow : LM.lampRed)
    : LM.ledOff;
  return (
    <group position={[x, y, 0]}>
      <ZDisc r={LAMP_BEZEL_R} depth={0.004} z={FRONT_Z + 0.002} material={LM.cabinetBezel} />
      <ZDisc r={LAMP_BEZEL_R * 0.82} depth={0.003} z={FRONT_Z + 0.0052} material={LM.cabinetCollar} />
      <mesh position={[0, 0, FRONT_Z + 0.008]} scale={[1, 1, 0.6]} material={lensMat}>
        <sphereGeometry args={[LAMP_LENS_R, 20, 12]} />
      </mesh>
    </group>
  );
}

/* ------------------------------ 柜体 ------------------------------ */

/**
 * 操作台：柜体 + 门板 + 三灯排 + 五个点动按钮 + 手自动旋钮 + 丝印铭牌。
 * 按钮按下 → pressLiquidOperator（本地真值 + 仿真模式写 PLC 输入点）；
 * 观众端全部短路，只按主控快照显示。
 */
export function OperatorCabinet() {
  const operator = useLiquidStore((s) => s.operator);
  const lamps = useLiquidStore((s) => s.lamps);
  const viewer = isViewerRuntime();
  const press = (item: LiquidOperatorButton, down: boolean) => {
    if (viewer) return;
    pressLiquidOperator(item.key, down);
  };
  const select = (m: LiquidOperatorMode) => {
    if (viewer) return;
    selectLiquidOperatorMode(m);
  };
  /** 上排四个平头按钮：顺序取 LIQUID_OPERATOR_BUTTONS，急停单独取下排 */
  const pushItems = LIQUID_OPERATOR_BUTTONS.filter((b) => b.kind === 'push');
  const estopItem = LIQUID_OPERATOR_BUTTONS.find((b) => b.kind === 'estop')!;
  return (
    <group userData={{ part: 'operator-cabinet' }}>
      {/* 柜体 + 柜脚（柜脚外沿大一圈，侧面不与柜体共面） */}
      <mesh position={[0, CABINET_SIZE[1] / 2 + 0.01, 0]} castShadow material={LM.cabinetBody}>
        <boxGeometry args={CABINET_SIZE} />
      </mesh>
      <mesh position={[0, FOOT_H / 2, 0]} material={LM.cabinetTrim}>
        <boxGeometry args={[CABINET_SIZE[0] + 2 * GAP, FOOT_H, CABINET_SIZE[2] + 2 * GAP]} />
      </mesh>

      {/* 门板：深色包边形成门缝，浅灰面板托住彩色元件；背面内嵌进柜体 */}
      <mesh position={[0, CENTER_Y, FRONT_Z - PANEL_T / 2 - 0.001 - GAP / 2]} material={LM.cabinetTrim}>
        <boxGeometry args={[PANEL_W + 0.012, PANEL_H + 0.012, 0.004]} />
      </mesh>
      <mesh position={[0, CENTER_Y, FRONT_Z - PANEL_T / 2 - GAP / 2]} material={LM.cabinetDoor}>
        <boxGeometry args={[PANEL_W, PANEL_H, PANEL_T]} />
      </mesh>

      {/* 顶部设备铭牌 / 底部分区条 */}
      <Nameplate x={0} y={TITLE_Y} text="液体混装 · 操作台" w={PANEL_W * 0.66} h={0.013} dark />
      <Nameplate x={0} y={FOOTER_Y} text="DT-LIQ / AC220V" w={0.17} h={0.011} />

      {/* 指示灯排：与场景塔灯同源同色 */}
      {LAMP_KEYS.map((k, i) => (
        <IndicatorLamp key={k} x={LAMP_XS[i]} y={LAMP_Y} kind={k} on={lamps[k]} />
      ))}
      {LAMP_KEYS.map((k, i) => (
        <Nameplate key={`lamp-${k}`} x={LAMP_XS[i]} y={LAMP_Y + PLATE_DY} text={LAMP_LABELS[k]} />
      ))}

      {/* 分区线：贴面薄片整体抬到门板前表面之外 */}
      <mesh position={[0, DIVIDER_Y, FRONT_Z + GAP + 0.001]} material={LM.cabinetDecal}>
        <boxGeometry args={[PANEL_W - 0.03, 0.0015, 0.002]} />
      </mesh>

      {/* 上排：启动 / 停止 / 复位 / 放料 */}
      {pushItems.map((b, i) => (
        <PushButton key={b.key} item={b} x={PUSH_XS[i]} y={BTN_ROW1_Y}
          pressed={operator[b.key]}
          onDown={() => press(b, true)} onUp={() => press(b, false)} />
      ))}
      {pushItems.map((b, i) => (
        <Nameplate key={`plate-${b.key}`} x={PUSH_XS[i]} y={BTN_ROW1_Y + PLATE_DY} text={b.label} />
      ))}

      {/* 下排：急停蘑菇头 + 手动 / 自动两位旋钮 */}
      <EStopButton item={estopItem} x={ESTOP_X} y={BTN_ROW2_Y}
        pressed={operator[estopItem.key]}
        onDown={() => press(estopItem, true)} onUp={() => press(estopItem, false)} />
      <Nameplate x={ESTOP_X} y={BTN_ROW2_Y + PLATE_DY} text={estopItem.label} warning />
      <SelectorSwitch mode={operator.mode} x={SELECTOR_X} y={BTN_ROW2_Y} onSelect={select} />
      <Nameplate
        x={SELECTOR_X} y={BTN_ROW2_Y + PLATE_DY}
        text={`${LIQUID_OPERATOR_SELECTOR.manual} / ${LIQUID_OPERATOR_SELECTOR.auto}`} w={PLATE_W * 1.5}
      />
    </group>
  );
}
