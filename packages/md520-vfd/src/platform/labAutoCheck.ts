/**
 * 实验步骤自动判定求值器（纯函数，只读真值，不写 store、不广播、不碰 PLC）。
 *
 * auto 规则由 docs/generate-lab-guide.cjs 生成到 labGuide.generated.ts，
 * 每条规则对着 useVfdStore 的一份只读快照求值，命中即自动勾选对应步骤。
 * 观察类步骤没有 auto 规则，保持手动勾选。
 */
import type { AutoRule } from '../constants/labGuide.generated';

/** 求值所需的只读真值切片；由抽屉从 store 用 selector 取好后传入 */
export interface AutoFacts {
  level: number;
  params: Readonly<Record<string, number>>;
  running: boolean;
  di: Readonly<Record<string, boolean>>;
}

export function evalAutoRule(rule: AutoRule, f: AutoFacts): boolean {
  switch (rule.kind) {
    case 'level': return f.level === rule.value;
    case 'param': return f.params[rule.code] === rule.value;
    case 'running': return f.running === rule.value;
    case 'di': return !!f.di[rule.key] === rule.value;
    default: return false;
  }
}

/**
 * 根据真值与 auto 规则算出当前应勾选的步骤集合。
 * 只返回「本应自动勾选」的下标；用户手动勾过的由抽屉合并保留，不被清掉。
 */
export function autoCheckedSteps(
  auto: (AutoRule | null)[] | undefined,
  f: AutoFacts,
): number[] {
  if (!auto) return [];
  const out: number[] = [];
  auto.forEach((rule, i) => {
    if (rule && evalAutoRule(rule, f)) out.push(i);
  });
  return out;
}
