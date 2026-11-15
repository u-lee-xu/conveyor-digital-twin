/**
 * 中继侧快照合并 / 比较（Node 侧唯一口径，纯函数无副作用）。
 * 与浏览器侧 `packages/shared/src/sync/snapshotDiff.ts` 的 diffSnapshot 配套：
 * mergeSnapshot(base, diffSnapshot(base, next)) 必须恒等于 next。
 * 由 snapshot-diff-check.cjs 与包内自检交叉验证，禁止各写一套。
 */

/** 键集合与值完全一致才算相同；Object.is 让 NaN 不误判 */
function sameSnapshot(a, b) {
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

/** 与浏览器侧 isSnapshotValue 同口径：JSON 里的 NaN/Infinity 会变 null，绝不能当普通值收下 */
function isSnapshotValue(v) {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

/** delta 中 null 是删除标记：合并后 keys 会真正消失，观众端永远收不到 null */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeSnapshot(base, delta) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(delta || {})) {
    // 直接调用本函数时也要防止键名写入原型
    if (UNSAFE_KEYS.has(k)) continue;
    if (v === null) delete out[k];
    else if (isSnapshotValue(v)) out[k] = v;
    // 其余非法值忽略：保留上一帧有效值，不破坏静止期保活
  }
  return out;
}

module.exports = { sameSnapshot, mergeSnapshot, isSnapshotValue };
