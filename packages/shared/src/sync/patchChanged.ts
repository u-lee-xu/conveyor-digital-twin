/**
 * rAF 热路径的 store 写入守卫。
 *
 * 液体 / 龙门 / VFD 的 tick() 由 requestAnimationFrame 每帧驱动，原本即使
 * 画面完全静止也会新建 volumes / sensors / doFlags / params 对象并 set，
 * 触发全量订阅者重渲染。这里做一次浅比较：所有值都相同就跳过 set，
 * 一旦有连续量（搅拌角、坐标斜坡、输出频率）变化则照常写入，语义不变。
 *
 * 比较规则：标量用 Object.is；纯数据对象按键集合 + 逐键值浅比较；
 * 数组 / 函数 / 其它对象只要引用不同就保守地视为「有变化」，避免漏更新。
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.is(
    (a as Record<string, unknown>)[k],
    (b as Record<string, unknown>)[k],
  ));
}

/** patch 中任一键与当前状态不同就返回 true；全部相同返回 false */
export function patchChanged(prev: object, patch: object): boolean {
  for (const [key, value] of Object.entries(patch)) {
    if (!sameValue((prev as Record<string, unknown>)[key], value)) return true;
  }
  return false;
}
