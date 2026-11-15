import * as THREE from 'three';
import { applySurfaceTextures } from '@digital-twin/shared/three/surfaceTextures';
import { VISUAL } from '../../../scenes/auto-dispensing/constants';

/**
 * 配药场景共享材质：颜色一律取自 constants.ts 的 VISUAL（单一来源），
 * 这里只负责金属度 / 粗糙度等表面质感参数。
 *
 * 配色结构：深中性背景 → 铝银灰结构件 → 石墨蓝灰柜体 → 浅灰门板，
 * 彩色只留给功能件（琥珀滑台/料斗、砖橙取药仓、四药仓标识色）与安全色灯。
 */
export const materials = {
  /** 底架 / 铝型材 / 托架横梁：从近黑改为铝银灰，让结构从背景里浮出来 */
  base: new THREE.MeshStandardMaterial({
    color: VISUAL.BASE_COLOR,
    metalness: 0.5,
    roughness: 0.45,
  }),

  /** 深色结构件（垫脚 / 推板 / 灯杆）：石墨灰，不再纯黑 */
  darkMetal: new THREE.MeshStandardMaterial({
    color: VISUAL.STRUCT_COLOR,
    metalness: 0.45,
    roughness: 0.55,
  }),

  /** 亮银金属（导轨 / 推杆 / 落料斜槽） */
  brightSilver: new THREE.MeshStandardMaterial({
    color: VISUAL.SILVER_COLOR,
    metalness: 0.85,
    roughness: 0.18,
  }),

  /**
   * 铝挤型 T 槽 / 台面螺纹孔的暗槽（避免组件里再写死颜色）。
   * 这是专用「贴面薄片」材质：polygonOffset 让它在深度测试里稳定压过宿主面，
   * 作为 SURFACE_GAP 几何错开之外的渲染层兜底，防止远机位 z-fighting 闪烁。
   */
  profileSlot: new THREE.MeshStandardMaterial({
    color: VISUAL.PROFILE_SLOT_COLOR,
    metalness: 0.4,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),

  /** 贴面亮银薄片（沉孔环 / 刻度环 / 按钮高光）：同样带 polygonOffset 兜底 */
  decal: new THREE.MeshStandardMaterial({
    color: VISUAL.ENDCAP_COLOR,
    metalness: 0.8,
    roughness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),

  /** 贴面暗色薄片（暗孔 / 刻线 / 铭牌蚀刻） */
  decalDark: new THREE.MeshStandardMaterial({
    color: VISUAL.MAGSWITCH_COLOR,
    metalness: 0.35,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),

  /** 亮银高光（螺旋牙 / 仓口包边 / 端盖） */
  endCap: new THREE.MeshStandardMaterial({
    color: VISUAL.ENDCAP_COLOR,
    metalness: 0.8,
    roughness: 0.25,
  }),

  /** 轴 / 滚珠（主轴） */
  axle: new THREE.MeshStandardMaterial({
    color: VISUAL.AXIS_COLOR,
    metalness: 0.65,
    roughness: 0.38,
  }),

  /** 气缸缸体（铝银，与结构件拉开一档） */
  cylinderBody: new THREE.MeshStandardMaterial({
    color: VISUAL.CYL_BODY_COLOR,
    metalness: 0.6,
    roughness: 0.4,
  }),

  /** 气缸推杆 */
  cylinderRod: new THREE.MeshStandardMaterial({
    color: VISUAL.CYL_ROD_COLOR,
    metalness: 0.9,
    roughness: 0.08,
  }),

  /** 黄铜件（气管接头 / 节流阀），比旧暗棕更亮 */
  brass: new THREE.MeshStandardMaterial({
    color: VISUAL.BRASS_COLOR,
    metalness: 0.75,
    roughness: 0.35,
  }),

  /** 磁性开关（近黑塑料） */
  magSwitch: new THREE.MeshStandardMaterial({
    color: VISUAL.MAGSWITCH_COLOR,
    metalness: 0.35,
    roughness: 0.6,
  }),

  /** 旋转气缸输出法兰（琥珀色，旋转输出位） */
  flange: new THREE.MeshStandardMaterial({
    color: VISUAL.FLANGE_COLOR,
    metalness: 0.35,
    roughness: 0.4,
  }),

  /** 导套 / 螺母 / 轴承座（银灰与石墨之间的一档） */
  sleeve: new THREE.MeshStandardMaterial({
    color: VISUAL.SLEEVE_COLOR,
    metalness: 0.5,
    roughness: 0.42,
  }),

  /** 滑台（深琥珀） */
  slider: new THREE.MeshStandardMaterial({
    color: VISUAL.SLIDER_COLOR,
    metalness: 0.25,
    roughness: 0.5,
  }),

  /** 料斗（亮琥珀，与滑台同色族不同明度） */
  hopper: new THREE.MeshStandardMaterial({
    color: VISUAL.HOPPER_COLOR,
    metalness: 0.25,
    roughness: 0.5,
  }),

  /** 取药仓（砖橙红，与琥珀拉开） */
  bin: new THREE.MeshStandardMaterial({
    color: VISUAL.BIN_COLOR,
    metalness: 0.2,
    roughness: 0.55,
  }),

  // ---- 普通正反转电机 / 轴末端独立编码器 / 联轴器材质，颜色只来自 VISUAL ----
  /** 正反转电机圆柱机身：深石墨灰，比结构件略深一档 */
  motorBody: new THREE.MeshStandardMaterial({
    color: VISUAL.MOTOR_BODY_COLOR,
    metalness: 0.5,
    roughness: 0.5,
  }),
  /** 机身散热筋：与机身同色系、只亮一档，靠形体起伏表现而不是异色斑马条 */
  motorRib: new THREE.MeshStandardMaterial({
    color: VISUAL.MOTOR_RIB_COLOR,
    metalness: 0.55,
    roughness: 0.48,
  }),
  /** 尾部风扇罩：深色冲压件（普通异步电机特征，不是编码器） */
  motorFan: new THREE.MeshStandardMaterial({
    color: VISUAL.MOTOR_FAN_COLOR,
    metalness: 0.25,
    roughness: 0.7,
  }),
  /** 顶部接线盒：铸件灰 */
  terminalBox: new THREE.MeshStandardMaterial({
    color: VISUAL.TERMINAL_BOX_COLOR,
    metalness: 0.35,
    roughness: 0.6,
  }),
  /** 轴末端独立增量编码器外壳：深色金属圆筒 */
  encoderBody: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_BODY_COLOR,
    metalness: 0.45,
    roughness: 0.5,
  }),
  /**
   * 编码器卡环 / 铭牌：低金属度亮银。
   * 本场景没有 envMap，brightSilver / decal 的 0.8+ metalness 会被压成灰蓝；
   * 「一眼看见」的标识件必须靠低 metalness 亮色，不能靠堆金属度。
   */
  encoderTrim: new THREE.MeshStandardMaterial({
    color: VISUAL.SILVER_COLOR,
    metalness: 0.16,
    roughness: 0.5,
  }),
  /** 编码器侧波纹管联轴器的铝合金夹紧轮毂 / 带中心孔的夹紧法兰；
   *  与卡环铭牌分开一档灰度，避免整机里所有银件糊成一片 */
  encoderHub: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_HUB_COLOR,
    metalness: 0.26,
    roughness: 0.42,
  }),
  /** 不锈钢薄壁波纹管：中灰蓝，靠环向褶皱的明暗起伏读出「弹性元件」 */
  encoderBellows: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_BELLOWS_COLOR,
    metalness: 0.38,
    roughness: 0.38,
  }),
  /** Z 相零位标记：小面积亮点，靠自检定的 emissive 而不是 ACES 削顶的过曝白点 */
  encoderZMark: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_Z_MARK_COLOR,
    emissive: VISUAL.ENCODER_Z_MARK_COLOR,
    emissiveIntensity: 0.45,
    metalness: 0.1,
    roughness: 0.4,
  }),
  /** A / B 相分色芯线：低金属度亮色，深色背景里能分辨两相 */
  encoderPhaseA: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_PHASE_A_COLOR,
    metalness: 0.05,
    roughness: 0.8,
  }),
  encoderPhaseB: new THREE.MeshStandardMaterial({
    color: VISUAL.ENCODER_PHASE_B_COLOR,
    metalness: 0.05,
    roughness: 0.8,
  }),
  /** 梅花联轴器中间弹性体：聚氨酯（非金属材料感） */
  couplingSpider: new THREE.MeshStandardMaterial({
    color: VISUAL.COUPLING_SPIDER_COLOR,
    metalness: 0.05,
    roughness: 0.75,
  }),

  /** 控制柜柜体（石墨蓝灰，与背景分离、比门板深） */
  cabinet: new THREE.MeshStandardMaterial({
    color: VISUAL.CABINET_COLOR,
    metalness: 0.35,
    roughness: 0.55,
  }),

  /** 柜门面板（RAL7035 浅灰，托住彩色按钮与指示灯） */
  panel: new THREE.MeshStandardMaterial({
    color: VISUAL.PANEL_COLOR,
    metalness: 0.15,
    roughness: 0.7,
  }),

  /** 灯塔 / 指示灯 灭态（暗玻璃而非纯灰球） */
  lampDark: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_DARK,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.35,
    metalness: 0.15,
  }),

  /** 指示灯 亮态（发射光） */
  lampActive: (color: number) => new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.1,
  }),
} as const;

/**
 * 与汇川龙门场景一致的 Saltline 程序化表面细节：只挂金属结构件。
 * 贴面（profileSlot/decal/decalDark）、功能色塑料件（flange/slider/hopper/bin）、
 * 编码器芯线与 Z 相标记、聚氨酯弹性体、柜门面板及指示灯一律不挂。
 */
const DISPENSING_METAL_KEYS = [
  'base', 'darkMetal', 'brightSilver', 'endCap', 'axle',
  'cylinderBody', 'cylinderRod', 'brass', 'sleeve',
  'motorBody', 'motorRib', 'motorFan', 'terminalBox',
  'encoderBody', 'encoderTrim', 'encoderHub', 'encoderBellows', 'cabinet',
] as const;

/** 幂等惰性：由场景入口在首次渲染时调用一次 */
export function applyProceduralTextures(): void {
  applySurfaceTextures(materials, DISPENSING_METAL_KEYS);
}
