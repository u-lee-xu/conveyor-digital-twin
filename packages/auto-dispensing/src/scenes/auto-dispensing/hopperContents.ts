/**
 * 斗内药片的「来源 → 逐粒序列」展开规则。
 *
 * 料斗按 COLS × ROWS × LAYERS 逐层堆放，斜俯 / 俯视时实际只看得见最上面一层。
 * 若按来源仓分组展开（A,A,A,A,B,B,B,B,...），几何容量灌满时顶层整整一层都是 D 仓，
 * 用户会以为「只装了一种药」。这里改成 A→B→C→D 轮转交错：
 * 每一层的 perLayer 个位置都尽量各来自不同仓，顶层就能同时看到多种药片颜色。
 *
 * 纯函数、无 React / three 依赖，便于自检直接证明「多种药品同时可见」。
 */
import { type MagazineId } from './constants';

export const HOPPER_MAG_IDS: readonly MagazineId[] = ['A', 'B', 'C', 'D'];

/**
 * @param stock 斗内来源台账（来自 store.hopperStock）
 * @param fallbackCount 外部只写 hopperPills、没写 hopperStock 时需要补齐的粒数
 * @returns 逐粒来源序列，顺序即渲染时的堆叠顺序（前 perLayer 粒在最底层）
 */
export function expandHopperStock(
  stock: Record<MagazineId, number>,
  fallbackCount = 0,
): MagazineId[] {
  const remaining: Record<MagazineId, number> = {
    A: Math.max(0, Math.floor(stock.A || 0)),
    B: Math.max(0, Math.floor(stock.B || 0)),
    C: Math.max(0, Math.floor(stock.C || 0)),
    D: Math.max(0, Math.floor(stock.D || 0)),
  };
  let left = remaining.A + remaining.B + remaining.C + remaining.D;
  const out: MagazineId[] = [];

  // 每一轮按 A→D 各取一粒；某个仓取空后自动跳过，剩下的仓继续轮转。
  while (left > 0) {
    for (const m of HOPPER_MAG_IDS) {
      if (remaining[m] > 0) {
        out.push(m);
        remaining[m] -= 1;
        left -= 1;
      }
    }
  }

  // 兼容只写计数的旧调用方：不猜来源，统一按 A 色兜底，且不参与轮转。
  const fallback = Math.max(0, Math.floor(fallbackCount));
  for (let i = 0; i < fallback; i += 1) out.push('A');
  return out;
}
