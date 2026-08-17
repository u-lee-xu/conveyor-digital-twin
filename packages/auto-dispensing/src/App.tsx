import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { PhysicsGround } from '@digital-twin/shared';
import { PlcConnectionPanel, HelpPanel, useMobile, type PlcConnConfig } from '@digital-twin/shared';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { DispenseControlPanel } from './scenes/auto-dispensing/panels/DispenseControlPanel';
import { DispenseStatusPanel } from './scenes/auto-dispensing/panels/DispenseStatusPanel';
import { DispenseDemoPanel } from './scenes/auto-dispensing/panels/DispenseDemoPanel';
import { DispenseSimPanel } from './scenes/auto-dispensing/panels/DispenseSimPanel';
import { DispensingSceneContent } from './scenes/auto-dispensing/SceneContent';
import { plcService } from './services/plc-websocket';
import { buildDispensingHelpContent } from './scenes/auto-dispensing/helpContent';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import type { ProtocolType } from './services/plc-websocket';

const MODES: { key: AppMode; label: string; icon: string }[] = [
  { key: 'manual', label: '\u270B\u2009手动', icon: '' },
  { key: 'auto', label: '\uD83E\uDD16\u2009演示', icon: '' },
  { key: 'sim', label: '\u2699\u2009仿真', icon: '' },
];

export default function App() {
  useDispenseLoop();
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const showLabels = useAppStore((s) => s.showLabels);
  const setShowLabels = useAppStore((s) => s.setShowLabels);
  const isMobile = useMobile();
  const [showHelp, setShowHelp] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolType>('modbus');
  const [connected, setConnected] = useState(false);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const result = await plcService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
    });
    return result.success ? null : result.error || '连接失败';
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e293b', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows
        camera={{ position: [-1.7, 7.5, 9.0], fov: 45, near: 0.1, far: 1000 }}
      >
        <OrbitControls
          target={[-1.7, 1.2, 1.5]}
          enableDamping dampingFactor={0.1}
          minDistance={3} maxDistance={30}
          maxPolarAngle={Math.PI / 2}
        />
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.8, 0]} debug={false} timeStep={1 / 30}>
            <color attach="background" args={['#334155']} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <PhysicsGround />
            <DispensingSceneContent />
          </Physics>
        </Suspense>
      </Canvas>
      {/* 左侧极窄控制栏（手机端隐藏，使用底部抽屉） */}
      {!isMobile && (
        <div
          className="absolute top-3 left-3 z-10 overflow-y-auto space-y-2 scrollbar-thin"
          style={{ width: '17rem', maxHeight: 'calc(100vh - 1.5rem)' }}
        >
          {/* 标题 + 模式选择器 */}
          <div className="card !p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow shadow-emerald-500/20 shrink-0">
                <span className="text-white text-[0.65rem]" aria-hidden="true">&#9876;</span>
              </div>
              <h1 className="text-xs font-bold text-white truncate">自动配药系统</h1>
              <button
                onClick={() => setShowHelp(true)}
                title="使用说明与地址映射"
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors text-sm"
              >
                ❓
              </button>
              <button
                onClick={() => setShowLabels(!showLabels)}
                title="三维标签显示"
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors text-sm ${
                  showLabels
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-700/60'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                🏷
              </button>
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

          {mode === 'manual' && (
            <>
              <DispenseControlPanel />
              <DispenseStatusPanel />
            </>
          )}
          {mode === 'auto' && <DispenseDemoPanel />}
          {mode === 'sim' && (
            <>
              <PlcConnectionPanel
                modeLabel="仿真模式"
                protocols={['modbus', 's7', 'mitsubishi']}
                protocol={protocol}
                onProtocolChange={setProtocol}
                onConnect={handleConnect}
                onDisconnect={async () => { await plcService.disconnect(); }}
                onConnectedChange={setConnected}
                onHelp={() => setShowHelp(true)}
              />
              <DispenseSimPanel
                onShowHelp={() => setShowHelp(true)}
                protocol={protocol}
                connected={connected}
                setConnected={setConnected}
              />
            </>
          )}
        </div>
      )}

      {isMobile && (
        <>
          {/* 顶部迷你条：模式切换 + 帮助 */}
          <div className="absolute top-2 left-2 right-2 z-10">
            <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-xl px-2 py-1.5 shadow-2xl flex items-center gap-2">
              <div className="mode-tabs flex-1" role="tablist" aria-label="运行模式选择">
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
              <button
                onClick={() => setShowHelp(true)}
                title="使用说明与地址映射"
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-600/80 transition-colors text-base"
              >
                ❓
              </button>
              <button
                onClick={() => setShowLabels(!showLabels)}
                title="三维标签显示"
                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-colors text-base ${
                  showLabels
                    ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-700/60 border-slate-600/50 text-slate-500'
                }`}
              >
                🏷
              </button>
            </div>
          </div>

          {/* 底部抽屉面板 */}
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-3 shadow-2xl max-h-[52vh] overflow-y-auto scrollbar-thin">
              {mode === 'manual' && (
                <>
                  <DispenseControlPanel />
                  <DispenseStatusPanel />
                </>
              )}
              {mode === 'auto' && <DispenseDemoPanel />}
              {mode === 'sim' && (
                <>
                  <PlcConnectionPanel
                    modeLabel="仿真模式"
                    protocols={['modbus', 's7', 'mitsubishi']}
                    protocol={protocol}
                    onProtocolChange={setProtocol}
                    onConnect={handleConnect}
                    onDisconnect={async () => { await plcService.disconnect(); }}
                    onConnectedChange={setConnected}
                    onHelp={() => setShowHelp(true)}
                  />
                  <DispenseSimPanel
                    onShowHelp={() => setShowHelp(true)}
                    protocol={protocol}
                    connected={connected}
                    setConnected={setConnected}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {showHelp && <HelpPanel content={buildDispensingHelpContent()} onClose={() => setShowHelp(false)} />}

      <div className="absolute bottom-2 right-3 text-[0.5rem] text-slate-600 select-none">
        &copy; 2026
      </div>
    </div>
  );
}