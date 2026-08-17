/** 三维场景标签（彩色 chip，与传送分拣场景 PhysicsLabel 同款外观） */
const LABEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.4)', border: 'rgba(96,165,250,0.6)', text: '#dbeafe' },
  green: { bg: 'rgba(34,197,94,0.4)', border: 'rgba(74,222,128,0.6)', text: '#dcfce7' },
  orange: { bg: 'rgba(245,158,11,0.4)', border: 'rgba(251,191,36,0.6)', text: '#fef3c7' },
  purple: { bg: 'rgba(168,85,247,0.4)', border: 'rgba(192,132,252,0.6)', text: '#f3e8ff' },
  gray: { bg: 'rgba(107,114,128,0.4)', border: 'rgba(156,163,175,0.6)', text: '#f1f5f9' },
  yellow: { bg: 'rgba(234,179,8,0.4)', border: 'rgba(250,204,21,0.6)', text: '#fef9c3' },
  red: { bg: 'rgba(239,68,68,0.4)', border: 'rgba(248,113,113,0.6)', text: '#fee2e2' },
} as const;

export function makeLabelColor(key: string) {
  return LABEL_COLORS[key] || LABEL_COLORS.gray;
}

export { LABEL_COLORS };