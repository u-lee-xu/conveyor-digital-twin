/**
 * ============================================================
 * 工业场景统一视觉令牌（单一来源）
 * ============================================================
 * 自动配药 / 传送带分拣（以及后续工业设备场景）共用同一套：
 *   - 场景背景与三点布光
 *   - 金属 / 塑料 / 门板的结构色
 *   - 三色灯塔与指示灯的安全色
 *   - 贴面错开量（防 z-fighting）
 *   - 三维标签 chip 配色
 *
 * 约定：颜色一律写 CSS 十六进制字符串，禁止在组件 / materials.ts 里
 * 再写死 0x... 数字色值；材质文件只负责 metalness / roughness 等质感。
 */

/** 结构色：深中性背景 → 铝银灰结构件 → 石墨蓝灰柜体 → 浅灰门板 */
export const INDUSTRIAL_VISUAL = {
  SCENE_BACKGROUND: '#1b2431',

  BASE_COLOR: '#8b98a8',         // 底架 / 铝型材银灰
  STRUCT_COLOR: '#39434f',       // 深色结构件（石墨灰）
  SLEEVE_COLOR: '#5d6b7c',       // 导套 / 轴承座
  SILVER_COLOR: '#dfe6ee',       // 亮银（导轨 / 推杆 / 斜槽）
  PROFILE_SLOT_COLOR: '#2b3441', // 铝挤型 T 槽开口 / 暗槽
  ENDCAP_COLOR: '#cbd3dc',       // 端盖 / 包边
  BRASS_COLOR: '#c08a3e',        // 黄铜气接头
  MAGSWITCH_COLOR: '#161c24',    // 磁性开关 / 暗色塑料
  AXIS_COLOR: '#a8b4c2',         // 传动轴 / 滚筒轴
  CYL_BODY_COLOR: '#8794a4',     // 气缸缸体（铝银）
  CYL_ROD_COLOR: '#e2e8f0',      // 推杆
  CABINET_COLOR: '#3c4d63',      // 控制柜柜体
  PANEL_COLOR: '#d8dee6',        // 柜门面板（RAL7035 浅灰）

  LAMP_DARK: '#243040',          // 灭态玻璃透镜
  LAMP_GREEN: '#2fb862',
  LAMP_YELLOW: '#e0a91a',
  LAMP_RED: '#e04b3c',
} as const;

/** 三点布光参数（PhysicsScene / 独立 Canvas 共用同一类型） */
export interface IndustrialLighting {
  ambient: number;
  key: number;
  fill: number;
  fillColor: string;
  keyPosition: [number, number, number];
  fillPosition: [number, number, number];
}

/** 三点布光：环境光 + 暖白主光 + 冷蓝补光，避免暗面死黑 */
export const INDUSTRIAL_LIGHTING: IndustrialLighting = {
  ambient: 1.35,
  key: 1.4,
  fill: 0.4,
  fillColor: '#9ab8dc',
  keyPosition: [10, 10, 5],
  fillPosition: [-7, 5, -4],
};

/**
 * 相邻可见面最小贴面错开量：与几何 repair 配套，
 * 两个场景共用同一数值，避免各自发明 0.001 / 0.003 造成深度闪烁。
 */
export const INDUSTRIAL_DETAIL = {
  SURFACE_GAP: 0.0025,
} as const;

/** 三维标签 chip（两个场景的 PhysicsLabel 共用同一份外观） */
export const LABEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.4)', border: 'rgba(96,165,250,0.6)', text: '#dbeafe' },
  green: { bg: 'rgba(34,197,94,0.4)', border: 'rgba(74,222,128,0.6)', text: '#dcfce7' },
  orange: { bg: 'rgba(245,158,11,0.4)', border: 'rgba(251,191,36,0.6)', text: '#fef3c7' },
  purple: { bg: 'rgba(168,85,247,0.4)', border: 'rgba(192,132,252,0.6)', text: '#f3e8ff' },
  gray: { bg: 'rgba(107,114,128,0.4)', border: 'rgba(156,163,175,0.6)', text: '#f1f5f9' },
  yellow: { bg: 'rgba(234,179,8,0.4)', border: 'rgba(250,204,21,0.6)', text: '#fef9c3' },
  red: { bg: 'rgba(239,68,68,0.4)', border: 'rgba(248,113,113,0.6)', text: '#fee2e2' },
};

export function makeLabelColor(key: string) {
  return LABEL_COLORS[key] || LABEL_COLORS.gray;
}
