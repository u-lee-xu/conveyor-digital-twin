/** 工作区常驻副作用：300ms 读写 MD520 从站寄存器 + 每帧推进加减速斜坡 */
import { VfdLink } from './VfdLink';

export function VfdDeviceEffects() {
  return <VfdLink />;
}
