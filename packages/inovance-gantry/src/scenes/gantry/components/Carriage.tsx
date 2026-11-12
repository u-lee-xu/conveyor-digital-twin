/** X 轴包梁式滑块：单一滑座套在横梁上，Z 总成与金属挡片都固定在它上面 */
import { M } from '../../shared/gantryMaterials';
import { CARRIAGE_DETAIL as D } from '../../../constants/gantryConstants';
import { Bolt } from './IndustrialProfile';
import { SensorFlag } from './SensorSet';

export function Carriage() {
  return (
    <group>
      <mesh castShadow receiveShadow material={M.slider}>
        <boxGeometry args={[D.W, D.H, D.D]} />
      </mesh>
      {/* 顶面只保留滑块本体一个面：旧版又盖了一块带深度偏移的亮银薄板，
          低角度会压过本体显出一块白色亮斑。螺栓底面略埋进顶面，禁精确共面。 */}
      {[-1, 1].map((sx) => [-1, 1].map((sz) => (
        <Bolt key={`carriage-${sx}-${sz}`}
          position={[sx * D.BOLT_X, D.H / 2 + 0.0012, sz * D.BOLT_Z]} r={0.0035} h={0.003} />
      )))}
      <mesh position={[0, -0.055, 0]} material={M.endCap}>
        <boxGeometry args={[D.PLATE_W, D.PLATE_T, D.PLATE_D]} />
      </mesh>
      {/* 金属挡片固定在滑块上，随 X 移动，依次扫过 X 轴 3 个接近开关 */}
      <SensorFlag axis="x" side={1} mountY={0} />
    </group>
  );
}
