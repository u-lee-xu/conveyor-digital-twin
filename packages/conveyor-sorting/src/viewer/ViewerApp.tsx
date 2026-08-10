import React from 'react';
import { PhysicsScene } from '@digital-twin/shared';
import { ConveyorSortingSceneContent } from '../scenes/conveyor-sorting/SceneContent';
import { useViewerBridge, type BridgeLink } from './useViewerBridge';

function LinkBadge({ link, bridgeUp }: { link: BridgeLink; bridgeUp: boolean }) {
  const [text, cls] =
    link === 'online'
      ? bridgeUp
        ? ['PLC 在线', 'border-green-500/40 text-green-400 bg-green-500/10']
        : ['网关在线 · PLC 未连', 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10']
      : link === 'connecting'
        ? ['连接中…', 'border-slate-500/40 text-slate-300 bg-slate-500/10']
        : ['连接断开，重试中…', 'border-red-500/40 text-red-400 bg-red-500/10'];
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border backdrop-blur ${cls}`}>{text}</span>
  );
}

export const ViewerApp: React.FC = () => {
  const { link, snapshot } = useViewerBridge();

  return (
    <div className="relative w-screen h-screen bg-slate-900 overflow-hidden">
      {/* 完整 3D 场景：每台手机独立渲染、自由旋转（OrbitControls） */}
      <PhysicsScene SceneContent={ConveyorSortingSceneContent} cameraPosition={[2, 5, 8]} />

      {/* 顶部状态徽章 */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <span className="text-xs px-2.5 py-1 rounded-full border border-slate-600/40 text-slate-300 bg-slate-900/60 backdrop-blur">
          观众视图
        </span>
        <LinkBadge link={link} bridgeUp={!!snapshot?.connected} />
      </div>

      {/* 底部状态条 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full border border-slate-600/40 bg-slate-900/70 backdrop-blur">
        <span className="text-[0.7rem] font-mono text-slate-400">
          协议 {snapshot?.protocol ?? '—'} · 更新于 {snapshot ? new Date(snapshot.ts).toLocaleTimeString() : '—'}
          {snapshot?.error ? ` · ${snapshot.error}` : ''}
        </span>
      </div>
    </div>
  );
};
