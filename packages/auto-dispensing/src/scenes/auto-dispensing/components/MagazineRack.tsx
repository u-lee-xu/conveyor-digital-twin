import { RACK, RACK_PILLAR_H, RACK_PILLAR_CY } from '../constants';
import { materials } from '../../../components/scene/shared/materials';

/**
 * 部件：四个供药单元共用的安装托架（横梁 + 两根后置立柱）。
 *
 * 局部原点 = 横梁中心面（ASSEMBLY.magazineRack.position 给出世界位姿）。
 * 立柱局部 y 为负（向下延伸到地面），Z 在滑台行程之外，不挡滑块。
 * 接口面：横梁上表面 y = RACK.BEAM_H/2，四个供药单元的底座底面接在此处。
 */
export function MagazineRack() {
  return (
    <group>
      <mesh position={[0, 0, 0]} castShadow material={materials.base}>
        <boxGeometry args={[RACK.BEAM_W, RACK.BEAM_H, RACK.BEAM_D]} />
      </mesh>
      {RACK.PILLAR_X.map((x, i) => (
        <mesh
          key={`pillar_${i}`}
          position={[x, RACK_PILLAR_CY, RACK.PILLAR_Z]}
          castShadow
          material={materials.base}
        >
          <boxGeometry args={[RACK.PILLAR_W, RACK_PILLAR_H, RACK.PILLAR_W]} />
        </mesh>
      ))}
    </group>
  );
}
