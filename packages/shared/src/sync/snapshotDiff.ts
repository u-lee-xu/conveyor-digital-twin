/**
 * 主控 → 中继的快照差分（浏览器侧唯一口径）。
 *
 * 10Hz 全量快照里绝大多数键在静止期不变，只发变化键可把上行与扇出压到极低频。
 * 关键边界：**消失的键必须显式打 null 删除标记**，否则自动配药的飞行药片、
 * 龙门棋子等动态键会从观众画面上抹不掉（中继按「缺字段保留上次值」合并）。
 *
 * 中继侧的合并 / 比较口径在 `websocket-server/snapshot-diff.js`，两者由
 * `websocket-server/snapshot-diff-check.cjs` 与包内自检交叉锁死，禁止各写一套。
 */
export type SnapshotValue = boolean | number;
export type SnapshotDeltaValue = SnapshotValue | null;
export type Snapshot = Record<string, SnapshotValue>;
export type SnapshotDelta = Record<string, SnapshotDeltaValue>;

/**
 * 合法快照值：boolean 或有限 number。
 * NaN / Infinity / undefined 会被 JSON.stringify 变成 null 或直接丢键，而 null
 * 在差分协议里是「删除标记」，因此必须在出口拦住，否则静止期 1s 保活会被
 * 逐帧的键数变化打回 10Hz 全量广播。
 */
export function isSnapshotValue(v: unknown): v is SnapshotValue {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

/** 全量帧用：丢掉非法值，避免 JSON null 与删除标记混淆 */
export function sanitizeSnapshot(v: Snapshot): Snapshot {
  const out: Snapshot = {};
  for (const [key, value] of Object.entries(v)) {
    if (isSnapshotValue(value)) out[key] = value;
  }
  return out;
}

/** 逐键比较；Object.is 让 NaN 不误判为变化，非法值保留上一帧有效值 */
export function diffSnapshot(prev: Snapshot, next: Snapshot): SnapshotDelta {
  const out: SnapshotDelta = {};
  for (const [key, value] of Object.entries(next)) {
    if (!isSnapshotValue(value)) continue;
    if (!Object.is(prev[key], value)) out[key] = value;
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) out[key] = null;
  }
  return out;
}
