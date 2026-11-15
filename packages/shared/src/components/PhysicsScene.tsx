import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import type { ComponentType } from 'react';
import { PhysicsGround } from './PhysicsGround';
import { AspectFitCamera } from './AspectFitCamera';
import type { IndustrialLighting } from '../styles/industrialVisual';

interface PhysicsSceneProps {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
  /** 可选：与工业场景统一的三点布光；不传时保持旧版「环境光 + 主光」 */
  lighting?: IndustrialLighting;
  /** 可选：场景背景色；不传时保持旧版 #1e293b */
  background?: string;
  cameraFov?: number;
  orbitTarget?: [number, number, number];
  /** 可选：Rapier 固定步长；需要更精细接触求解的场景可传 1/60 */
  timeStep?: number;
  /** 可选：部件展台的 1:1 近景需要更近的缩放下限；不传保持旧版 2 */
  minDistance?: number;
  /** 可选：展台自带 0.1m 标尺网格时关掉整机地面；不传保持旧版 true */
  showGround?: boolean;
  /** 可选：主控开启阴影、观众端关闭；不传保持旧版 false */
  shadows?: boolean;
}

const LEGACY_BACKGROUND = '#1e293b';

export const PhysicsScene: React.FC<PhysicsSceneProps> = ({
  SceneContent,
  cameraPosition = [0, 5, 8],
  lighting,
  background,
  cameraFov = 45,
  orbitTarget,
  timeStep = 1 / 30,
  minDistance = 2,
  showGround = true,
  shadows = false,
}) => {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const ambient = lighting?.ambient ?? 2.0;
  const keyLight = lighting?.key ?? 1.5;
  const keyPosition = lighting?.keyPosition ?? [5, 10, 7];

  return (
    <div style={{ width: '100vw', height: '100vh', background: background ?? LEGACY_BACKGROUND }}>
      <Canvas
        shadows={shadows}
        frameloop={isHidden ? 'never' : 'always'}
        // 显式锁 dpr=1：观众大屏高 DPR 下不做 4 倍像素渲染；onCreated 的 setPixelRatio 作双保险
        dpr={1}
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(1);
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.8, 0]} debug={false} timeStep={timeStep}>
            {background && <color attach="background" args={[background]} />}
            <ambientLight intensity={ambient} />
            <directionalLight position={keyPosition as [number, number, number]} intensity={keyLight} />
            {lighting && lighting.fill > 0 && (
              <directionalLight
                position={lighting.fillPosition}
                intensity={lighting.fill}
                color={lighting.fillColor}
              />
            )}
            {showGround && <PhysicsGround />}
            <SceneContent />
          </Physics>
        </Suspense>
        <OrbitControls
          makeDefault
          target={orbitTarget}
          enableDamping
          dampingFactor={0.05}
          minDistance={minDistance}
          maxDistance={20}
          maxPolarAngle={Math.PI / 2}
        />
        {/* 窄屏 / 竖屏按宽高比拉远相机，避免设备两端被裁掉；桌面 aspect>=1.6 不改动 */}
        <AspectFitCamera maxDistance={20} />
      </Canvas>
    </div>
  );
};
