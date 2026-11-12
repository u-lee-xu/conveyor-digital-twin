/** 两端宽立板端座：把 X 横梁落到 Y 模组滑座 / D20 滑块上 */
import { M } from '../../shared/gantryMaterials';
import { END_SUPPORT_DETAIL as D } from '../../../constants/gantryConstants';
import { Bolt } from './IndustrialProfile';

export function EndSupport({ x, postBottom, postTop, middle, height }: {
  x: number; postBottom: number; postTop: number; middle: number; height: number;
}) {
  return (
    <group position={[x, 0, D.Z]}>
      <mesh position={[0, middle, 0]} castShadow receiveShadow material={M.base}>
        <boxGeometry args={[D.W, height, D.D]} />
      </mesh>
      {/* 下连滑座、上托横梁的两块亮银法兰，向 +Z 伸出到横梁轴线 */}
      <mesh position={[0, postBottom + 0.015, 0.0375]} material={M.slider}>
        <boxGeometry args={[D.FLANGE_W, 0.03, D.FLANGE_D]} />
      </mesh>
      <mesh position={[0, postTop, 0.0375]} material={M.endCap}>
        <boxGeometry args={[D.FLANGE_W, D.FLANGE_T, D.FLANGE_D]} />
      </mesh>
      {[-1, 1].map((s) => (
        <Bolt key={`end-bolt-${s}`} position={[s * 0.028, postTop + 0.008, 0.0375]} r={0.004} h={0.003} />
      ))}
    </group>
  );
}
