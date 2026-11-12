/** 线性模组与伺服端盖：Y 驱动模组 / X 横梁共用，尺寸取自 MODULE_DETAIL */
import { M, GAP } from '../../shared/gantryMaterials';
import { MODULE_DETAIL } from '../../../constants/gantryConstants';
import { Profile, Bolt } from './IndustrialProfile';

const D = MODULE_DETAIL;

/** 圆柱默认轴沿 Y，转到模组长边方向（本文件内部使用） */
function axisRotation(axis: 'x' | 'z'): [number, number, number] {
  return axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
}

/** 模组端部伺服：深色本体 + 散热筋 + 接线盒 + 亮银端盖（无彩色风扇） */
export function ServoHousing({ position, label, axis = 'x' }: {
  position: [number, number, number]; label: string; axis?: 'x' | 'z';
}) {
  const rot: [number, number, number] = axis === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0];
  return (
    <group position={position} rotation={rot} userData={{ label }}>
      <mesh castShadow material={M.servo}><boxGeometry args={[0.075, 0.075, 0.075]} /></mesh>
      {[-0.022, -0.011, 0, 0.011, 0.022].map((x, i) => (
        <mesh key={`rib-${i}`} position={[x, 0.039, 0]} material={M.servoRib}>
          <boxGeometry args={[0.004, 0.006, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.041]} material={M.endCap}><boxGeometry args={[0.055, 0.055, 0.006]} /></mesh>
      <mesh position={[0, 0.046, -0.012]} material={M.terminalBox}>
        <boxGeometry args={[0.045, 0.016, 0.038]} />
      </mesh>
      <Bolt position={[0.028, 0, 0.045]} r={0.003} h={0.004} />
    </group>
  );
}

/** 线性模组：铝挤型本体 + 两条亮银滚珠导轨 + 居中丝杆 + 两端轴承座 */
export function LinearModule({ length, axis = 'z', position = [0, 0, 0] }: {
  length: number; axis?: 'x' | 'z'; position?: [number, number, number];
}) {
  const rotation = axisRotation(axis);
  const along = length - 0.03;
  return (
    <group position={position}>
      <Profile length={length} axis={axis} bolts />
      {[-1, 1].map((s, i) => {
        const p: [number, number, number] = axis === 'z'
          ? [s * D.RAIL_OFFSET, D.HALF + GAP, 0] : [0, D.HALF + GAP, s * D.RAIL_OFFSET];
        return (
          <group key={`rail-${i}`}>
            {/* 导轨顶面只保留一个亮银面：旧版又叠了一条带深度偏移的高光细条，
                其底面埋进导轨本体 0.0001m，随视角露出一截截梳齿状亮线（z-fighting）。 */}
            <mesh position={p} material={M.silver}>
              <boxGeometry args={axis === 'z' ? [D.RAIL_W, D.RAIL_H, along] : [along, D.RAIL_H, D.RAIL_W]} />
            </mesh>
          </group>
        );
      })}
      {/* 丝杆以模组中心为原点沿长边放置，两端收进轴承座 */}
      <mesh position={[0, D.HALF + GAP * 2, 0]} rotation={rotation} material={M.silver}>
        <cylinderGeometry args={[D.SCREW_R, D.SCREW_R, length - 0.05, 14]} />
      </mesh>
      {[-1, 1].map((s) => {
        const p: [number, number, number] = axis === 'z'
          ? [0, D.HALF + GAP * 2, s * (length / 2 - 0.018)]
          : [s * (length / 2 - 0.018), D.HALF + GAP * 2, 0];
        return (
          <mesh key={`bearing-${s}`} position={p} rotation={rotation} material={M.sleeve}>
            <cylinderGeometry args={[D.BEARING_R, D.BEARING_R, D.BEARING_LEN, 14]} />
          </mesh>
        );
      })}
    </group>
  );
}
