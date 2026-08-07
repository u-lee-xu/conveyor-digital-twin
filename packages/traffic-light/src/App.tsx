import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PlcConnectionPanel, HelpPanel, useMobile, type PlcConnConfig } from '@digital-twin/shared';
import { TrafficSceneContent } from './scenes/traffic-light/SceneContent';
import { ManualPanel } from './scenes/traffic-light/panels/ManualPanel';
import { DemoPanel } from './scenes/traffic-light/panels/DemoPanel';
import { SimPanel } from './scenes/traffic-light/panels/SimPanel';
import { TrafficScoringPanel } from './scenes/traffic-light/panels/TrafficScoringPanel';
import { useTrafficScoring } from './scenes/traffic-light/hooks/useTrafficScoring';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { plcService } from './services/plc-websocket';
import { buildTrafficHelpContent } from './scenes/traffic-light/helpContent';
import type { ProtocolType } from './services/plc-websocket';

const MODES: { key: AppMode; label: string; icon: string }[] = [
  { key: 'manual', label: '\u270B\u2009手动', icon: '' },
  { key: 'auto', label: '\uD83E\uDD16\u2009演示', icon: '' },
  { key: 'scoring', label: '\uD83C\uDFC6\u2009评分', icon: '' },
  { key: 'sim', label: '\u2699\u2009仿真', icon: '' },
];

function TrafficScoringGate() {
  useTrafficScoring();
  return null;
}

export default function App() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const isMobile = useMobile();
  const [showHelp, setShowHelp] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolType>('mitsubishi');
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
        camera={{ position: [7.3, 6.1, 7.3], fov: 45, near: 0.1, far: 100 }}
      >
        <OrbitControls
          target={[0, 0.8, 0]}
          enableDamping dampingFactor={0.1}
          minDistance={1.2} maxDistance={18}
          maxPolarAngle={Math.PI / 2.1}
        />
        <TrafficSceneContent />
      </Canvas>

      <TrafficScoringGate />

      {/* 左侧极窄控制栏（手机端隐藏，使用底部抽屉） */}
      {!isMobile && (
        <div
          className="absolute top-3 left-3 z-10 overflow-y-auto space-y-2 scrollbar-thin"
          style={{ width: '17rem', maxHeight: 'calc(100vh - 1.5rem)' }}
        >

        {/* 标题 + 模式选择器 */}
        <div className="card !p-2.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center shadow shadow-red-500/20 shrink-0">
              <span className="text-white text-[0.65rem]" aria-hidden="true">&#128678;</span>
            </div>
            <h1 className="text-xs font-bold text-white truncate">交通灯</h1>
            <button
              onClick={() => setShowHelp(true)}
              title="使用说明与地址映射"
              className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors text-sm"
            >
              ❓
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

        {mode === 'manual' && <ManualPanel />}
        {mode === 'auto' && <DemoPanel />}
        {mode === 'scoring' && (
          <>
            <PlcConnectionPanel
              modeLabel="评分模式"
              protocols={['modbus', 's7', 'mitsubishi']}
              protocol={protocol}
              onProtocolChange={setProtocol}
              onConnect={handleConnect}
              onDisconnect={async () => { await plcService.disconnect(); }}
              onConnectedChange={setConnected}
              onHelp={() => setShowHelp(true)}
            />
            <TrafficScoringPanel connected={connected} />
          </>
        )}
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
            <SimPanel
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
            </div>
          </div>

          {/* 底部抽屉面板 */}
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-3 shadow-2xl max-h-[52vh] overflow-y-auto scrollbar-thin">
              {mode === 'manual' && <ManualPanel />}
              {mode === 'auto' && <DemoPanel />}
              {mode === 'scoring' && (
                <>
                  <PlcConnectionPanel
                    modeLabel="评分模式"
                    protocols={['modbus', 's7', 'mitsubishi']}
                    protocol={protocol}
                    onProtocolChange={setProtocol}
                    onConnect={handleConnect}
                    onDisconnect={async () => { await plcService.disconnect(); }}
                    onConnectedChange={setConnected}
                    onHelp={() => setShowHelp(true)}
                  />
                  <TrafficScoringPanel connected={connected} />
                </>
              )}
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
                  <SimPanel
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

      {showHelp && <HelpPanel content={buildTrafficHelpContent()} onClose={() => setShowHelp(false)} />}

      <div className="absolute bottom-2 right-3 text-[0.5rem] text-slate-600 select-none">
        &copy; 2026
      </div>
    </div>
  );
}
