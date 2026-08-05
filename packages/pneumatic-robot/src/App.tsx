import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PneumaticRobotSceneContent } from './scenes/pneumatic-robot/SceneContent';
import { ManualPanel } from './scenes/pneumatic-robot/panels/ManualPanel';
import { SimPanel } from './scenes/pneumatic-robot/panels/SimPanel';
import { HelpPanel } from './scenes/pneumatic-robot/panels/HelpPanel';
import { useAppStore, type AppMode } from './stores/useAppStore';

const MODES: { key: AppMode; label: string; icon: string }[] = [
  { key: 'manual', label: '\u270B\u2009手动', icon: '' },
  { key: 'sim',    label: '\u2699\u2009仿真', icon: '' },
];

export default function App() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows
        camera={{ position: [3.5, 3.5, 3.5], fov: 45, near: 0.1, far: 100 }}
      >
        <OrbitControls
          target={[0, 1.2, 0.15]}
          enableDamping dampingFactor={0.1}
          minDistance={2} maxDistance={12}
          maxPolarAngle={Math.PI / 2}
        />
        <PneumaticRobotSceneContent />
      </Canvas>

      {/* 左侧极窄控制栏 */}
      <div
        className="absolute top-3 left-3 z-10 overflow-y-auto space-y-2 scrollbar-thin"
        style={{ width: '17rem', maxHeight: 'calc(100vh - 1.5rem)' }}
      >

        {/* 标题 + 模式选择器 */}
        <div className="card !p-2.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow shadow-cyan-500/20 shrink-0">
              <span className="text-white text-[0.65rem]" aria-hidden="true">&#9881;</span>
            </div>
            <h1 className="text-xs font-bold text-white truncate">气动机械手</h1>
          </div>
          <div className="mode-tabs" role="tablist" aria-label="运行模式选择">
            {MODES.map((m) => (
              <button
                key={m.key} role="tab"
                aria-selected={mode === m.key}
                className={`mode-tab !text-[0.65rem] !py-1 touch-manipulation${mode === m.key ? ' mode-tab-active' : ''}`}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'manual' && <ManualPanel />}
        {mode === 'sim' && <SimPanel onShowHelp={() => setShowHelp(true)} />}
      </div>

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

      <div className="absolute bottom-2 right-3 text-[0.5rem] text-slate-600 select-none">
        &copy; 2026
      </div>
    </div>
  );
}
