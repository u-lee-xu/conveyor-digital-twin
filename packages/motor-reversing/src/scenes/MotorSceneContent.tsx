/**
 * 组装层：只做「按表摆放 + 绑定真值」，部件几何在 scenes/components/MotorParts.tsx。
 * ?view= 切整机机位，?stage= 切 1:1 部件展台；展台复用同一批组件，不改设备真值。
 *
 * 地面只留两条设备基础梁与网格，不再用整块黑色大板压住整机。
 */
import { useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { GAP, MOTOR_GEOM as G, MOTOR_ASSEMBLY, MOTOR_VISUAL as V } from '../constants/motorConstants';
import { useMotorViewStore } from '../stores/useMotorViewStore';
import { MOTOR_MATERIALS as M, applyProceduralTextures } from './shared/motorMaterials';
import {
  MotorAssembledScene, MotorCameraRig, renderMotorBarePart,
} from './components/MotorParts';

const L = V.SCENE_LIGHTING;

export function MotorSceneContent() {
  // 与龙门场景一致：程序化表面纹理只在首次渲染本场景时惰性烘焙一次
  useMemo(() => { applyProceduralTextures(); return true; }, []);
  const activeStage = useMotorViewStore((s) => s.activeStage);
  return (
    <>
      {/* 空气透视：远处地坪淡入背景，消除有限地面平面的硬边 */}
      <fog attach="fog" args={[V.SCENE_BACKGROUND, 6, 20]} />
      <ambientLight intensity={L.ambient} />
      {/* 主光投影：让柜体、皮带、纸箱与操作台在地坪上落影，避免物体读成浮着的 */}
      <directionalLight position={L.keyPosition} intensity={L.key} color="#fff4e6"
        castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10}
        shadow-camera-top={10} shadow-camera-bottom={-10}
        shadow-camera-near={0.1} shadow-camera-far={20}
        shadow-bias={-0.0004} />
      <directionalLight position={L.fillPosition} intensity={L.fill} color={L.fillColor} />
      {/* 柜内补光：敞开的柜口里 DIN 导轨元件仍有足够对比 */}
      <pointLight
        position={[
          MOTOR_ASSEMBLY.CABINET_POSITION[0],
          G.DIN.upperY + 0.18,
          MOTOR_ASSEMBLY.CABINET_POSITION[2] + 0.42,
        ]}
        intensity={3.4} distance={2.2} color="#dbeafe" />
      {/* 操作台补光：斜面按钮与指示灯不发灰 */}
      <pointLight
        position={[
          MOTOR_ASSEMBLY.CONSOLE_POSITION[0],
          G.CONSOLE.height + 0.42,
          MOTOR_ASSEMBLY.CONSOLE_POSITION[2] + 0.42,
        ]}
        intensity={1.5} distance={1.6} color="#fff4e6" />
      {/* 车间地坪：哑光平面承接阴影，网格放大成分格缝而不是细密 CAD 网格 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -GAP * 3, 0]}
        receiveShadow material={M.floor}>
        <planeGeometry args={[60, 60]} />
      </mesh>
      <Grid position={[0, -GAP, 0]} args={[12, 12]} cellSize={0.5}
        cellColor={V.STRUCT_COLOR} sectionColor={V.BASE_COLOR}
        sectionSize={2.5} fadeDistance={8} infiniteGrid />
      {activeStage ? (
        <group>{renderMotorBarePart(activeStage)}</group>
      ) : (
        <group>
          {/* 两条设备基础梁 + 端部横撑，尺寸来自唯一几何表 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, G.SKID.height / 2, s * G.SKID.beamGap / 2]} material={M.struct}>
              <boxGeometry args={[G.SKID.length, G.SKID.height, G.SKID.beamWidth]} />
            </mesh>
          ))}
          {/* 横撑缩短到不与纵梁交叠，避免两者顶面精确共面闪烁 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (G.SKID.length / 2 - 0.1), G.SKID.height / 2, 0]} material={M.darkMetal}>
              <boxGeometry args={[G.SKID.beamWidth, G.SKID.height,
                G.SKID.beamGap - G.SKID.beamWidth - GAP * 2]} />
            </mesh>
          ))}
          <MotorAssembledScene />
        </group>
      )}
      <MotorCameraRig />
    </>
  );
}
