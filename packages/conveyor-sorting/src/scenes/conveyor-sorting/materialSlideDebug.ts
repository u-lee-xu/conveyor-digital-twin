/**
 * 滑落阶段的只读运行时诊断。
 *
 * CDP 验收要能证明「工件真的进了 Rapier 物理世界」而不是继续走脚本平移：
 * 这里记录刚体类型、姿态四元数、dynamic 释放次数与滑落结束原因。
 * 只在 ?debug=1 时挂到 window.__DEBUG__，生产构建默认不暴露写接口。
 */
export type MaterialSlidePhase =
  | 'free' | 'pushing' | 'aligning' | 'sliding' | 'dropping' | 'settled';

export type SlideEndReason = '' | 'reached-end' | 'timeout';

export interface MaterialSlideDebug {
  phase: MaterialSlidePhase;
  /** 当前刚体是否为 dynamic（物理引擎接管） */
  dynamic: boolean;
  /** 刚体实际姿态四元数：斜槽上应偏离单位四元数，说明底面跟着槽面转了 */
  rotation: [number, number, number, number];
  /** 累计释放到 dynamic 的次数 */
  releases: number;
  /** 最近一次物理滑落耗时（秒） */
  lastSlideSeconds: number;
  /** 最近一次滑落结束时的刚体姿态：应偏离单位四元数（跟着斜面转了） */
  lastSlideRotation: [number, number, number, number];
  /** 最近一次滑落结束时刚体是否仍为 dynamic */
  lastSlideDynamic: boolean;
  /** 本次滑落过程中工件底面到槽面的最小法向净空（≥0 表示不穿模） */
  minSlideClearance: number;
  /** 最小净空出现时的 Z，用来区分「槽上啃板」与「出槽后自由落盒」 */
  minSlideClearanceZ: number;
  /** 最近一次滑落结束时的最小净空，便于截图阻塞后仍可核对 */
  lastSlideMinClearance: number;
  /** 最近一次滑落最小净空出现的位置 Z */
  lastSlideMinClearanceZ: number;
  /** 最近一次滑落结束原因：到底 / 看门狗超时 */
  lastSlideReason: SlideEndReason;
}

const snapshot: MaterialSlideDebug = {
  phase: 'free',
  dynamic: false,
  rotation: [0, 0, 0, 1],
  releases: 0,
  lastSlideSeconds: 0,
  lastSlideRotation: [0, 0, 0, 1],
  lastSlideDynamic: false,
  minSlideClearance: Number.POSITIVE_INFINITY,
  minSlideClearanceZ: 0,
  lastSlideMinClearance: 0,
  lastSlideMinClearanceZ: 0,
  lastSlideReason: '',
};

export function writeMaterialSlideDebug(patch: Partial<MaterialSlideDebug>): void {
  Object.assign(snapshot, patch);
}

export function readMaterialSlideDebug(): MaterialSlideDebug {
  return snapshot;
}
