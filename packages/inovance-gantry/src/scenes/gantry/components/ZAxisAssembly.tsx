/**
 * Z 轴升降总成：笔形气缸（固定）+ 可伸缩活塞杆 + 波纹吸盘头（随 Z 移动）。
 *
 * 修复要点：活塞杆不再是固定长度随吸盘头整体下移（那样下降时会和缸体脱开），
 * 而是每帧按 store 的 z 重新计算长度与中心：杆顶端始终埋进缸体 ROD_OVERLAP，
 * 杆底端始终接住吸盘头顶面，任何行程位置都连续。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { M, GAP } from '../../shared/gantryMaterials';
import { CYLINDER_DETAIL as D, toViewM } from '../../../constants/gantryConstants';
import { useGantryStore } from '../../../stores/useGantryStore';
import { Bolt } from './IndustrialProfile';

/** 相对 X 滑块原点的 Z 轴几何基准（自检按这套数值标定吸盘落点） */
export const Z_AXIS_GEOM = {
  BODY_Y: -0.085,       // 缸体中心
  HEAD_BASE: -0.146,    // 缩回时吸盘头顶面
  HEAD_LENGTH: 0.049,   // 吸盘头顶面到唇边底面
} as const;

/** 活塞杆顶端：缸体底面再往缸内埋 ROD_OVERLAP，保证不脱开 */
export const ROD_TOP = Z_AXIS_GEOM.BODY_Y - D.BODY_LEN / 2 + D.ROD_OVERLAP;

export function ZAxisAssembly() {
  const rodRef = useRef<Mesh>(null);
  const headRef = useRef<Group>(null);

  useFrame(() => {
    const zM = toViewM(useGantryStore.getState().z);
    const headY = Z_AXIS_GEOM.HEAD_BASE - zM;
    const rodLen = ROD_TOP - headY;
    if (rodRef.current) {
      rodRef.current.scale.y = rodLen;
      rodRef.current.position.y = (ROD_TOP + headY) / 2;
    }
    if (headRef.current) headRef.current.position.y = headY;
  });

  return (
    <group>
      {/* 气缸固定板 + 缸体（固定，不随 Z 移动） */}
      <mesh position={[0, -0.045, 0]} castShadow material={M.endCap}>
        <boxGeometry args={[0.055, 0.012, 0.06]} />
      </mesh>
      <mesh position={[0, Z_AXIS_GEOM.BODY_Y, 0]} castShadow material={M.cylinder}>
        <cylinderGeometry args={[D.BODY_R, D.BODY_R, D.BODY_LEN, 20]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`cap-${s}`} position={[0, Z_AXIS_GEOM.BODY_Y + s * (D.BODY_LEN / 2 - D.CAP_T / 2), 0]} material={M.endCap}>
          <cylinderGeometry args={[D.CAP_R, D.CAP_R, D.CAP_T, 20]} />
        </mesh>
      ))}
      {/* 固定导套：导杆从这里滑过，保证伸出时仍有导向段留在缸体内 */}
      {[-1, 1].map((s) => (
        <mesh key={`guide-bush-${s}`} position={[s * D.GUIDE_X, Z_AXIS_GEOM.BODY_Y - 0.01, 0]} material={M.sleeve}>
          <cylinderGeometry args={[D.GUIDE_BUSH_R, D.GUIDE_BUSH_R, D.GUIDE_BUSH_LEN, 12]} />
        </mesh>
      ))}
      {/* 黄铜气接头 */}
      <mesh position={[0.02, Z_AXIS_GEOM.BODY_Y + 0.02, 0.008]} rotation={[0, 0, Math.PI / 2]} material={M.brass}>
        <cylinderGeometry args={[D.BRASS_R, D.BRASS_R, D.BRASS_LEN, 12]} />
      </mesh>
      <mesh position={[0.028, Z_AXIS_GEOM.BODY_Y + 0.02, 0.008]} material={M.brass}>
        <cylinderGeometry args={[0.007, 0.007, 0.006, 12]} />
      </mesh>

      {/* 可伸缩活塞杆：单位长度圆柱，用 scale.y 表示实际长度 */}
      <mesh ref={rodRef} position={[0, (ROD_TOP + Z_AXIS_GEOM.HEAD_BASE) / 2, 0]} material={M.rod}>
        <cylinderGeometry args={[D.ROD_R, D.ROD_R, 1, 14]} />
      </mesh>

      {/* 吸盘头：顶面接活塞杆；两根防转导杆固定在这块移动板上，随 Z 一起伸出，
          长度大于行程，顶端始终留在缸体导套内，不会像固定导杆那样留在原地。 */}
      <group ref={headRef} position={[0, Z_AXIS_GEOM.HEAD_BASE, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={`guide-${s}`} position={[s * D.GUIDE_X, D.GUIDE_LEN / 2 - 0.02, 0]} material={M.rod}>
            <cylinderGeometry args={[D.GUIDE_R, D.GUIDE_R, D.GUIDE_LEN, 12]} />
          </mesh>
        ))}
        <mesh position={[0, -0.01, 0]} material={M.slider}>
          <boxGeometry args={[0.05, D.HEAD_BRACKET_T, 0.04]} />
        </mesh>
        {[-1, 1].map((sx) => [-1, 1].map((sz) => (
          <Bolt key={`head-bolt-${sx}-${sz}`} position={[sx * 0.018, -0.005 + GAP, sz * 0.014]} r={0.0025} h={0.002} />
        )))}
        <mesh position={[0, -0.022, 0]} material={M.cup}>
          <cylinderGeometry args={[0.012, 0.016, 0.014, 20]} />
        </mesh>
        <mesh position={[0, -0.033, 0]} material={M.cup}>
          <cylinderGeometry args={[0.018, 0.014, 0.009, 20]} />
        </mesh>
        <mesh position={[0, -0.042, 0]} material={M.cup}>
          <cylinderGeometry args={[0.026, 0.019, 0.011, 20]} />
        </mesh>
        <mesh position={[0, -0.048, 0]} material={M.cupLip}>
          <cylinderGeometry args={[0.028, 0.028, 0.004, 20]} />
        </mesh>
        {/* 中性色气管 */}
        <mesh position={[0.028, 0.012, 0.012]} rotation={[0, 0, -0.32]} material={M.hose}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.075, 10]} />
        </mesh>
      </group>
    </group>
  );
}
