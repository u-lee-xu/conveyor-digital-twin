import { Suspense, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { isViewerRuntime, renderPixelRatio } from '@digital-twin/shared';

export function TrafficSceneWrapper({
  SceneContent,
  cameraPosition = [7.3, 6.1, 7.3],
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
        target={[0, 0.8, 0]}
        enableDamping
        dampingFactor={0.1}
        minDistance={1.2}
        maxDistance={18}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Suspense fallback={null}><SceneContent /></Suspense>
    </Canvas>
  );
}
