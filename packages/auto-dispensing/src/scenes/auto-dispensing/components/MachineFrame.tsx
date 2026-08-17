import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AXIS_R, SCREW_Y, TRACK_R, TRACK_Y, SLIDER_MIN_X, SLIDER_MAX_X } from '../constants';
import { materials } from '../../../components/scene/shared/materials';
import { useDispensingStore } from '../../../stores/useDispensingStore';

/** 滚珠丝杆螺距：丝杆每转一圈，滑块移动 0.09 */
const SCREW_PITCH = 0.09;

/** 滚珠丝杆（螺旋管 + 主轴）：沿 X 从 from 到 to，轴高 y */
function BallScrew({ from, to, pitch, y }: { from: number; to: number; pitch: number; y: number }) {
  const { curve, steps } = useMemo(() => {
    const len = to - from;
    const turns = len / pitch;
    const s = Math.max(64, Math.round(turns * 24));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= s; i++) {
      const t = i / s;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(from + t * len, Math.sin(a) * 0.0225, Math.cos(a) * 0.0225));
    }
    return { curve: new THREE.CatmullRomCurve3(pts), steps: s };
  }, [from, to, pitch]);

  return (
    <group>
      {/* 螺旋牙（curve 已沿 X 生成，无需旋转；内缘贴合轴面，牙顶凸出） */}
      <mesh position={[0, y, 0]} material={materials.endCap}>
        <tubeGeometry args={[curve, steps, 0.008, 8, false]} />
      </mesh>
      {/* 主轴（与螺旋牙同区间：from ~ to） */}
      <mesh position={[(from + to) / 2, y, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.axle}>
        <cylinderGeometry args={[AXIS_R, AXIS_R, to - from, 16]} />
      </mesh>
    </group>
  );
}

/** 传送丝杆台子：底架 + 滚珠丝杆 + 双导轨 + 两端支撑 + 同步轮 */
export function MachineFrame() {
  // 丝杆/导轨从 SLIDER_MIN_X-0.1 到 SLIDER_MAX_X+0.25
  const AXLE_FROM = SLIDER_MIN_X - 0.1;
  const AXLE_TO = SLIDER_MAX_X + 0.25;
  const axleLen = AXLE_TO - AXLE_FROM;
  const axleCX = (AXLE_FROM + AXLE_TO) / 2;

  // 丝杆旋转：与滑块位移 1:1 绑定（每走一个螺距转 360°）
  // 右旋丝杆：滑块向 +X 移动时，从 +X 端看丝杆顺时针转（rotation.x 递减）
  const screwRef = useRef<THREE.Group>(null);
  const prevSliderX = useRef(useDispensingStore.getState().sliderX);
  useFrame(() => {
    const x = useDispensingStore.getState().sliderX;
    const dx = x - prevSliderX.current;
    prevSliderX.current = x;
    if (dx !== 0 && screwRef.current) {
      screwRef.current.rotation.x -= (dx / SCREW_PITCH) * Math.PI * 2;
    }
  });

  return (
    <group>
      {/* 底座 */}
      <mesh position={[axleCX, 0.02, 0]} castShadow receiveShadow material={materials.base}>
        <boxGeometry args={[axleLen + 0.5, 0.04, 0.5]} />
      </mesh>
      {/* 旋转组：组原点放在丝杆轴线上（[0, SCREW_Y, 0]），绕 X 旋转 = 丝杆原地自转 */}
      <group ref={screwRef} position={[0, SCREW_Y, 0]}>
        <BallScrew from={AXLE_FROM} to={AXLE_TO} pitch={SCREW_PITCH} y={0} />
        {/* 同步带轮（套在丝杆端头轴线上） */}
        {[AXLE_FROM, AXLE_TO].map((px) => (
          <mesh key={px} position={[px, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.darkMetal}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 16]} />
          </mesh>
        ))}
      </group>
      {/* 双导轨（顶面托滑块底面） */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[axleCX, TRACK_Y, side * 0.09]} rotation={[0, 0, Math.PI / 2]} material={materials.brightSilver}>
          <cylinderGeometry args={[TRACK_R, TRACK_R, axleLen, 12]} />
        </mesh>
      ))}
      {/* 两端支撑柱（顶到丝杆轴承位） */}
      {[AXLE_FROM, AXLE_TO].map((px) => (
        <mesh key={px} position={[px, SCREW_Y / 2, 0]} material={materials.base}>
          <boxGeometry args={[0.05, SCREW_Y, 0.3]} />
        </mesh>
      ))}
      {/* 轴承座（支撑柱顶，穿丝杆） */}
      {[AXLE_FROM, AXLE_TO].map((px) => (
        <mesh key={`brg_${px}`} position={[px, SCREW_Y, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.sleeve}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
        </mesh>
      ))}
      {/* 接地垫脚 */}
      {[AXLE_FROM - 0.15, AXLE_TO + 0.15].map((px) => (
        <mesh key={px} position={[px, 0.02, 0]} material={materials.darkMetal}>
          <boxGeometry args={[0.08, 0.04, 0.55]} />
        </mesh>
      ))}
    </group>
  );
}