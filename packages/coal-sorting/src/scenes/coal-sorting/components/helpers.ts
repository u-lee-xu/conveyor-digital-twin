import { BELT_WIDTH, BELT_SURFACE_Y, BELT_LAYOUT, PHYSICS, getBeltLength } from '../constants';
import type { BeltName } from '../useBeltStore';

/** 将世界坐标转换为某条皮带的局部坐标 */
export function worldToLocal(pos: { x: number; y: number; z: number }, belt: BeltName): { lx: number; ly: number; lz: number } {
  const L = BELT_LAYOUT[belt];
  const dx = pos.x - L.position[0], dz = pos.z - L.position[2];
  const cos = Math.cos(-L.rotation), sin = Math.sin(-L.rotation);
  return {
    lx: dx * cos - dz * sin,
    ly: pos.y - L.position[1],
    lz: dx * sin + dz * cos,
  };
}

/** 检测世界坐标位置在哪条皮带附近，返回皮带名和局部坐标
 *  belts：候选皮带列表（转接时按源带限定目标带，避免下落途中误匹配下层皮带） */
export function detectBelt(pos: { x: number; y: number; z: number }, belts?: BeltName[]): { belt: BeltName; lx: number; lz: number } | null {
  const list = belts ?? ['belt1', 'belt2', 'belt3', 'belt4'];
  for (const name of list) {
    const { lx, lz } = worldToLocal(pos, name);
    const surfaceY = BELT_SURFACE_Y[name];
    if (
      Math.abs(lx) < getBeltLength(name) / 2 + PHYSICS.BELT_DETECT_X_TOLERANCE &&
      Math.abs(lz) < BELT_WIDTH / 2 + 0.05 &&
      pos.y > surfaceY - 0.05 &&
      pos.y < surfaceY + PHYSICS.BELT_DETECT_Y_TOLERANCE * 2
    ) {
      return { belt: name, lx, lz };
    }
  }
  return null;
}
