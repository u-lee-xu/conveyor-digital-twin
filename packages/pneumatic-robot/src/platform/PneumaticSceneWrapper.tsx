import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime, renderPixelRatio } from '@digital-twin/shared';

export function PneumaticSceneWrapper({
  SceneContent,
  cameraPosition = [3.5, 3.5, 3.5],
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
}) {
  // 观众只读大屏：关阴影、锁 dpr=1，避免高 DPR 电视满帧渲染
  const isViewer = isViewerRuntime();
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      shadows={!isViewer}
      dpr={renderPixelRatio(isViewer)}
      camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 100 }}
    >
      <OrbitControls
        target={[0, 1.2, 0.15]}
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2}
      />
      <Suspense fallback={null}><SceneContent /></Suspense>
    </Canvas>
  );
}
