/**
 * MD520 独立场景容器：自带 Canvas / OrbitControls / 近景相机。
 * 不复用平台默认 PhysicsScene（本场景没有物理工件，也不需要整机地面）。
 */
import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime, renderPixelRatio } from '@digital-twin/shared';
import { VfdLabGuide } from './VfdLabGuide';

export function VfdSceneWrapper({
  SceneContent,
  cameraPosition = [0.95, 0.98, -2.05],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  // 观众只读大屏：关阴影、锁 dpr=1，避免高 DPR 电视满帧渲染
  const isViewer = isViewerRuntime();
  return (
    <>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows={!isViewer}
        dpr={renderPixelRatio(isViewer)}
        camera={{ position: cameraPosition, fov: 42, near: 0.1, far: 100 }}
      >
        <OrbitControls
          target={[-0.10, 0.34, -0.10]}
          enableDamping
          dampingFactor={0.1}
          minDistance={0.35}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2.05}
        />
        <Suspense fallback={null}><SceneContent /></Suspense>
      </Canvas>
      {/* 右侧可折叠实验指导：纯本地 UI，默认收起，不占真机面板、不广播 */}
      {/* 实验指导是主控侧可交互 UI，观众端只读大屏不挂载 */}
      {!isViewer && <VfdLabGuide />}
    </>
  );
}
