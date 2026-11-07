/**
 * 状态读数的定宽数值字段。
 *
 * 32 位 DINT 脉冲 0~87040 是 1~5 位十进制，方向文案「↑ + / ↓ − / 静止」字形宽度不同，
 * 药仓余量 0~10 也会变位数。把它们直接塞进 `flex-wrap` 读数行时，行总宽随运行状态变化，
 * 在左栏临界宽度处会把最后一个 badge 挤到下一行 —— 实测滑台跑到终点时 badge 行
 * 从 1 行变 2 行、整张卡片与左栏高度跳变 28px（用户反馈「页面变动」）。
 *
 * 这里给数值字段固定 minWidth、方向 badge 固定 min-width，让行总宽与内容无关：
 * 同一个视口下无论位置 / 方向 / 传感器状态怎么变，换行结果都一致，行数与高度恒定。
 * 不用 flex-nowrap + 裁剪，是为了保留窄视口下自然折行的能力，也不丢任何读数。
 */
export function ReadoutNum({ value, digits = 5 }: { value: number; digits?: number }) {
  return (
    <span
      data-readout-num=""
      className="inline-block whitespace-nowrap tabular-nums"
      style={{ minWidth: `${digits + 0.6}ch` }}
    >
      {value}
    </span>
  );
}

/** 方向 badge：↑ + / ↓ − / 静止 三种文案统一居中定宽 */
export const DIRECTION_BADGE_CLS = 'badge min-w-[2.6rem] justify-center whitespace-nowrap tabular-nums';

/** 仿真面板方向文案更长（↑ 前进 + / ↓ 后退 − / 静止） */
export const DIRECTION_BADGE_WIDE_CLS = 'badge min-w-[5.4rem] justify-center whitespace-nowrap tabular-nums';
