import type { ComponentType } from 'react';
import { PhysicsScene } from '@digital-twin/shared';
import { useConveyorViewStore } from '../stores';
import {
  VISUAL, SCENE_CAMERA, SCENE_TARGET, SCENE_FOV, PART_STAGES,
} from '../scenes/conveyor-sorting/constants';
import { ConveyorViewSwitcher } from './ConveyorViewSwitcher';

/**
 * 传送带场景容器：把共享 PhysicsScene 接到工业视觉令牌上
 * （背景 / 三点布光 / 首屏机位与自动配药场景一致），并挂右上角机位工具栏。
 * 独立 App 与平台壳共用同一个容器，避免两个入口渲染出两套风格。
 *
 * PhysicsScene 的这些参数是可选增强，其它设备不传时仍走旧版默认灯光 / 步长。
 * 传送带用 1/60 步长：动态工件落在倾斜薄板上时，1/30 的首帧接触会让求解器
 * 允许约 1cm 的瞬时穿透，看起来就是「细看有点穿模」。
 *
 * 部件展台：整机地面会盖住 0.1m 标尺网格，且 OrbitControls 旧下限 2m
 * 会把近景相机推远到看不清传感器，因此展台下关地面、把缩放下限放到 0.12m。
 * <Physics> 容器仍保留：展台复用整机的固定 / kinematic 刚体组件，不新建几何。
 */
export function ConveyorSceneWrapper({
  SceneContent,
  cameraPosition = SCENE_CAMERA,
  showPanelToggle = false,
}: {
  SceneContent: ComponentType;
  cameraPosition?: [number, number, number];
  showPanelToggle?: boolean;
}) {
  const activeStage = useConveyorViewStore((s) => s.activeStage);
  const stage = activeStage ? PART_STAGES[activeStage] : null;

  return (
    <>
      <PhysicsScene
        SceneContent={SceneContent}
        cameraPosition={cameraPosition}
        cameraFov={SCENE_FOV}
        orbitTarget={stage ? stage.target : SCENE_TARGET}
        background={VISUAL.SCENE_BACKGROUND}
        lighting={VISUAL.SCENE_LIGHTING}
        timeStep={1 / 60}
        showGround={!stage}
        minDistance={stage ? 0.12 : 2}
      />
      <ConveyorViewSwitcher showPanelToggle={showPanelToggle} />
    </>
  );
}
