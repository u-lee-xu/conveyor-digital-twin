import * as THREE from 'three';
import { VISUAL } from '../../../scenes/conveyor-sorting/constants';

/**
 * 传送带场景共享材质。
 *
 * 颜色一律取自 constants.ts 的 VISUAL（而 VISUAL 的公共色又来自
 * @digital-twin/shared 的工业视觉令牌），这里只负责金属度 / 粗糙度 /
 * 发光强度等表面质感；与自动配药场景的 materials.ts 是同一套写法。
 *
 * 贴面薄片（T 槽、沉孔、刻度）统一带 polygonOffset，作为 SURFACE_GAP
 * 几何错开之外的渲染层兜底，防止远机位 z-fighting 闪烁。
 */
const decalOptions = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
} as const;

export const materials = {
  /** 铝挤型材 / 支腿 / 托架：铝银灰 */
  base: new THREE.MeshStandardMaterial({
    color: VISUAL.BASE_COLOR, metalness: 0.5, roughness: 0.45,
  }),

  /** 深色结构件：石墨灰，不再纯黑 */
  darkMetal: new THREE.MeshStandardMaterial({
    color: VISUAL.STRUCT_COLOR, metalness: 0.45, roughness: 0.55,
  }),

  /** 亮银金属：滚筒轴 / 推杆 / 包边 */
  brightSilver: new THREE.MeshStandardMaterial({
    color: VISUAL.SILVER_COLOR, metalness: 0.85, roughness: 0.18,
  }),

  /** T 槽开口 / 暗槽贴片 */
  profileSlot: new THREE.MeshStandardMaterial({
    color: VISUAL.PROFILE_SLOT_COLOR, metalness: 0.4, roughness: 0.6, ...decalOptions,
  }),

  /** 贴面亮银薄片（端盖高光 / 沉孔环） */
  decal: new THREE.MeshStandardMaterial({
    color: VISUAL.ENDCAP_COLOR, metalness: 0.8, roughness: 0.25, ...decalOptions,
  }),

  /** 贴面暗色薄片（刻线 / 铭牌蚀刻） */
  decalDark: new THREE.MeshStandardMaterial({
    color: VISUAL.MAGSWITCH_COLOR, metalness: 0.35, roughness: 0.6, ...decalOptions,
  }),

  /** 端盖 / 仓口包边 */
  endCap: new THREE.MeshStandardMaterial({
    color: VISUAL.ENDCAP_COLOR, metalness: 0.8, roughness: 0.25,
  }),

  /** 滚筒 / 传动轴 */
  axle: new THREE.MeshStandardMaterial({
    color: VISUAL.AXIS_COLOR, metalness: 0.65, roughness: 0.38,
  }),

  /** 气缸缸体（铝银） */
  cylinderBody: new THREE.MeshStandardMaterial({
    color: VISUAL.CYL_BODY_COLOR, metalness: 0.6, roughness: 0.4,
  }),

  /** 气缸推杆 */
  cylinderRod: new THREE.MeshStandardMaterial({
    color: VISUAL.CYL_ROD_COLOR, metalness: 0.9, roughness: 0.08,
  }),

  /** 气口 / 节流阀体 */
  cylinderPort: new THREE.MeshStandardMaterial({
    color: VISUAL.SLEEVE_COLOR, metalness: 0.6, roughness: 0.4,
  }),

  /** 黄铜气管接头 */
  brass: new THREE.MeshStandardMaterial({
    color: VISUAL.BRASS_COLOR, metalness: 0.75, roughness: 0.35,
  }),

  /** 磁性开关（近黑塑料） */
  magneticSwitch: new THREE.MeshStandardMaterial({
    color: VISUAL.MAGSWITCH_COLOR, metalness: 0.35, roughness: 0.6,
  }),

  /** 传感器壳体（浅灰工业塑料） */
  sensor: new THREE.MeshStandardMaterial({
    color: VISUAL.PANEL_COLOR, metalness: 0.2, roughness: 0.65,
  }),

  sensorBracket: new THREE.MeshStandardMaterial({
    color: VISUAL.STRUCT_COLOR, metalness: 0.55, roughness: 0.45,
  }),

  /** 传感器类型色标：绿 / 蓝 / 黄 */
  sensorLabelFeed: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_GREEN, emissive: VISUAL.LAMP_GREEN, emissiveIntensity: 0.8,
    roughness: 0.4, metalness: 0.1,
  }),
  sensorLabelColor: new THREE.MeshStandardMaterial({
    color: VISUAL.MATERIAL_BLUE_COLOR, emissive: VISUAL.MATERIAL_BLUE_COLOR, emissiveIntensity: 0.8,
    roughness: 0.4, metalness: 0.1,
  }),
  sensorLabelMaterial: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_YELLOW, emissive: VISUAL.LAMP_YELLOW, emissiveIntensity: 0.8,
    roughness: 0.4, metalness: 0.1,
  }),

  /** 停机 / 运行两种滚筒表面（同一色相，只改金属度与明度档） */
  roller: new THREE.MeshStandardMaterial({
    color: VISUAL.SLEEVE_COLOR, metalness: 0.6, roughness: 0.4,
  }),
  rollerRunning: new THREE.MeshStandardMaterial({
    color: VISUAL.AXIS_COLOR, metalness: 0.75, roughness: 0.25,
  }),

  /** 橡胶输送带面 */
  belt: new THREE.MeshStandardMaterial({
    color: VISUAL.BELT_COLOR, metalness: 0.05, roughness: 0.9,
  }),

  /** 物料台铝板 */
  panel: new THREE.MeshStandardMaterial({
    color: VISUAL.TABLE_COLOR, metalness: 0.5, roughness: 0.5,
  }),

  /** 兼容旧引用：物料台已从木质改为铝板 */
  wood: new THREE.MeshStandardMaterial({
    color: VISUAL.TABLE_COLOR, metalness: 0.5, roughness: 0.5,
  }),

  /** 工件 */
  materialBlue: new THREE.MeshStandardMaterial({
    color: VISUAL.MATERIAL_BLUE_COLOR, metalness: 0.15, roughness: 0.5,
  }),
  materialBlack: new THREE.MeshStandardMaterial({
    color: VISUAL.MATERIAL_BLACK_COLOR, metalness: 0.15, roughness: 0.7,
  }),

  /** 灭态玻璃透镜 / 磁性开关 LED 灭态 */
  lampDark: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_DARK, emissive: '#000000', emissiveIntensity: 0,
    roughness: 0.35, metalness: 0.15,
  }),
  ledInactive: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_DARK, emissive: '#000000', emissiveIntensity: 0,
    roughness: 0.7, metalness: 0.3,
  }),

  /** 亮态发光材质工厂（与配药灯塔 / 按钮柜指示灯同一档） */
  lampActive: (color: string) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: VISUAL.LAMP_EMISSIVE,
    roughness: 0.3, metalness: 0.1,
  }),
  ledActive: new THREE.MeshStandardMaterial({
    color: VISUAL.LAMP_GREEN, emissive: VISUAL.LAMP_GREEN,
    emissiveIntensity: VISUAL.LED_EMISSIVE_INTENSITY, roughness: 0.3, metalness: 0.1,
  }),
  /**
   * 传感器检测态：亮琥珀橙。
   * LED 灯珠很小，若用 Standard + 高 emissive，经 ACES tone mapping 后会
   * 直接削顶成白点，反而看不出橙色；这里改用不受 tone mapping 影响的纯色
   * 基本材质，保证任意机位/曝光下都是稳定的 #ff9020。
   */
  sensorActive: new THREE.MeshBasicMaterial({
    color: VISUAL.SENSOR_ACTIVE_COLOR, toneMapped: false,
  }),
  sensorDetected: new THREE.MeshBasicMaterial({
    color: VISUAL.SENSOR_ACTIVE_COLOR, toneMapped: false,
  }),
  /** 背面状态条面积大，用带自发光的 Standard 材质做柔和橙光，不会削顶 */
  sensorPanelGlow: new THREE.MeshStandardMaterial({
    color: VISUAL.SENSOR_ACTIVE_COLOR, emissive: VISUAL.SENSOR_ACTIVE_COLOR,
    emissiveIntensity: VISUAL.SENSOR_ACTIVE_EMISSIVE * 0.35,
    roughness: 0.35, metalness: 0.1,
  }),
  /** LED 外圈的柔光圈：只做发光提示，不参与碰撞 / 深度写入 */
  sensorHalo: new THREE.MeshBasicMaterial({
    color: VISUAL.SENSOR_ACTIVE_COLOR, transparent: true, opacity: 0.32,
    toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
  }),

  /** 分拣斜槽亮银钢板：与带边/端盖同色族，避免整条槽读成黑色 */
  chutePlate: new THREE.MeshStandardMaterial({
    color: VISUAL.SILVER_COLOR, metalness: 0.7, roughness: 0.3,
  }),
  /** 收集盒内壁/底板：暗一档，露出盒内深度，不再像实心方块 */
  binInterior: new THREE.MeshStandardMaterial({
    color: VISUAL.PROFILE_SLOT_COLOR, metalness: 0.25, roughness: 0.8,
    ...decalOptions,
  }),

  ground: new THREE.MeshStandardMaterial({
    color: VISUAL.PANEL_COLOR, metalness: 0.0, roughness: 0.85,
  }),
} as const;
