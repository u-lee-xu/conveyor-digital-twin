import { useDispensingStore } from '../../../stores/useDispensingStore';
import { SLIDER_SIZE, SLIDER_TOP_Y, SCREW_Y } from '../constants';
import { materials } from '../../../components/scene/shared/materials';
import { OutputDisc } from './OutputDisc';

/**
 * 送料部件：滑块（光杆/丝杆从中间穿过）+ 旋转气缸（滑块 +Z 侧面外侧）
 *
 * 旋转气缸形态（叶片式摆动气缸）：
 *   扁长方体基座 + 顶面扁圆柱输出盘；输出盘绕自身中心轴（Z 向）摆动 90°，
 *   后续料斗挂在输出盘上随盘翻转倒药（口朝 +X 取药仓）
 */
export function SliderHopper() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const angle = useDispensingStore((s) => s.tiltCyl.angle);

  // 气缸基座：贴滑块 +Z 侧面（z = 滑块半宽 + 基座半厚），基座扁长方体（Y 向扁）
  const CYL_Z = SLIDER_SIZE[2] / 2 + 0.0225;
  const CYL_Y = SLIDER_SIZE[1] / 2;

  return (
    <group position={[sliderX, SLIDER_TOP_Y, 0]}>
      {/* ===== 滑块 ===== */}
      <mesh position={[0, SLIDER_SIZE[1] / 2, 0]} castShadow material={materials.slider}>
        <boxGeometry args={SLIDER_SIZE} />
      </mesh>
      {/* 通孔环（滑块前后表面，示意光杆/丝杆从中穿过）：丝杆孔 + 双导轨孔 */}
      {[-1, 1].map((side) => (
        <group key={`hole_${side}`}>
          <mesh position={[side * (SLIDER_SIZE[0] / 2), SCREW_Y - SLIDER_TOP_Y, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.sleeve}>
            <torusGeometry args={[0.034, 0.005, 8, 20]} />
          </mesh>
          {[-1, 1].map((tz) => (
            <mesh key={tz} position={[side * (SLIDER_SIZE[0] / 2), SCREW_Y - SLIDER_TOP_Y, tz * 0.09]} rotation={[0, Math.PI / 2, 0]} material={materials.sleeve}>
              <torusGeometry args={[0.02, 0.005, 8, 20]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ===== 旋转气缸（基座固定，输出盘独立在外侧） ===== */}
      <group position={[0, CYL_Y, CYL_Z]}>
        {/* 节流阀 ×2（黄铜滚花旋钮，窄端 -X 端面，接气管；不随基座旋转，连线沿 Y 平行于基座短边） */}
        {[-0.012, 0.012].map((y) => (
          <group key={`thr_${y}`} position={[-0.057, y, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} material={materials.brass}>
              <cylinderGeometry args={[0.008, 0.008, 0.014, 10]} />
            </mesh>
            <mesh position={[-0.011, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.brass}>
              <cylinderGeometry args={[0.011, 0.011, 0.006, 10]} />
            </mesh>
          </group>
        ))}
        {/* 基座沿长边（X）中心轴旋转 90°：扁面由水平翻转为竖直（Y 高 0.05、Z 厚 0.025），
            磁开关随基座转到顶面（+Y） */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* —— 基座：扁扁的长方体（银色铝合金） —— */}
          <mesh material={materials.endCap}>
            <boxGeometry args={[0.1, 0.025, 0.05]} />
          </mesh>
          {/* 磁性开关 ×2（黑色，嵌入长边 +Z 侧面，微凸出表面；随基座转到顶面 +Y） */}
          {[-0.025, 0.025].map((x) => (
            <mesh key={`mag_${x}`} position={[x, 0.005, 0.027]} material={materials.magSwitch}>
              <boxGeometry args={[0.03, 0.014, 0.008]} />
            </mesh>
          ))}
        </group>
        {/* 输出盘（带包边整体）：立起放置——盘缘贴基座最宽面（+Z，朝向相机的 0.1×0.05 面），
            盘面竖直朝相机（+Z），主体探在基座前方；绕自身轴线（世界 Z）摆动 90° */}
        <group position={[0, 0, 0.0125 + 0.007]} rotation={[Math.PI / 2, 0, 0]}>
          <OutputDisc angle={angle} position={[0, 0, 0]} />
        </group>
      </group>
    </group>
  );
}
