/**
 * 物料世界坐标注册表（模块级，避免每帧 setState 触发重渲染）
 * BeltMaterialItem 每帧写入当前位置，SensorDetector 集中读取计算传感器状态
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const positions = new Map<string, Vec3>();

export function registerMaterialPos(id: string, pos: Vec3) {
  positions.set(id, pos);
}

export function unregisterMaterialPos(id: string) {
  positions.delete(id);
}

export function getAllMaterialPositions(): Map<string, Vec3> {
  return positions;
}
