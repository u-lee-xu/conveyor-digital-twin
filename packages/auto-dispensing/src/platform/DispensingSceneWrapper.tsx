import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime } from '@digital-twin/shared';
import { SCENE_CAMERA, PART_STAGES, VISUAL } from '../scenes/auto-dispensing/constants';
import { resolveViewTuples } from '../scenes/auto-dispensing/viewGoals';
import { useAppStore } from '../stores/useAppStore';
import { ViewSwitcher } from './ViewSwitcher';

/**
 * 自动配药场景容器：设备横向跨 X≈-0.5~7.2（SCENE_SCALE=3 后），
 * 平台默认 PhysicsScene 的观察中心在原点会让设备偏出画面，故自带 Canvas。
 * 首屏相机与独立 App 共用 resolveViewTuples（含镜像布局），之后的切换由
 * store + CameraRig 运行时接管；右上角工具栏让平台壳也能切机位/展台。
 */
const initialQuery = new URLSearchParams(window.location.search);
const initialView = resolveViewTuples(
  initialQuery.get('view') ?? 'overview',
  initialQuery.get('stage'),
  initialQuery.get('mirror') === '1',
);

export function DispensingSceneWrapper({
  SceneContent,
  cameraPosition = SCENE_CAMERA,
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  const activeStage = useAppStore((s) => s.activeStage);
  // 角色判据统一来自 shared（软件=主控 / 浏览器+IP=观众），不再读 history.state
  const isViewer = isViewerRuntime();
  // 展台相机只有 0.5~2m：整机 minDistance=2 会把近景强行推远，故展台单独放宽到 0.2m
  const stageDistance = activeStage && PART_STAGES[activeStage] ? 0.2 : 2;

  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows={!isViewer}
        dpr={isViewer ? 1 : undefined}
        camera={{
          position: initialView.camera ?? cameraPosition,
          fov: initialView.fov,
          near: 0.1, far: 1000,
        }}
      >
        <OrbitControls
          makeDefault
          target={initialView.target}
          enableDamping
          dampingFactor={0.1}
          minDistance={stageDistance}
          maxDistance={25}
          maxPolarAngle={Math.PI / 2}
        />
        <color attach="background" args={[VISUAL.SCENE_BACKGROUND]} />
        <ambientLight intensity={VISUAL.SCENE_LIGHTING.ambient} />
        <directionalLight position={VISUAL.SCENE_LIGHTING.keyPosition} intensity={VISUAL.SCENE_LIGHTING.key} />
        <directionalLight
          position={VISUAL.SCENE_LIGHTING.fillPosition}
          intensity={VISUAL.SCENE_LIGHTING.fill}
          color={VISUAL.SCENE_LIGHTING.fillColor}
        />
        {/* Rapier 的 WASM 初始化会 suspend；平台壳也需要显式边界 */}
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      {!isViewer && <ViewSwitcher />}
    </>
  );
}
