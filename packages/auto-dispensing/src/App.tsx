import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PlcConnectionPanel, HelpPanel, useMobile, type PlcConnConfig } from '@digital-twin/shared';
import { useAppStore, type AppMode } from './stores/useAppStore';
import { DispenseControlPanel } from './scenes/auto-dispensing/panels/DispenseControlPanel';
import { DispenseDemoPanel } from './scenes/auto-dispensing/panels/DispenseDemoPanel';
import { DispenseSimPanel } from './scenes/auto-dispensing/panels/DispenseSimPanel';
import { DispensingSceneContent } from './scenes/auto-dispensing/SceneContent';
import { plcService } from './services/plc-websocket';
import { buildDispensingHelpContent } from './scenes/auto-dispensing/helpContent';
import { useDispenseLoop } from './scenes/auto-dispensing/hooks/useDispenseLoop';
import {
  HOPPER_PREVIEW_CAMERA, HOPPER_PREVIEW_TARGET, HOPPER_PREVIEW_FOV,
  MAGAZINE_PREVIEW_CAMERA, MAGAZINE_PREVIEW_TARGET, MAGAZINE_PREVIEW_FOV,
  PART_STAGES, PART_STAGE_ORIGIN, VISUAL,
} from './scenes/auto-dispensing/constants';
import { resolveViewTuples } from './scenes/auto-dispensing/viewGoals';
import { ViewSwitcher } from './platform/ViewSwitcher';
import type { ProtocolType } from './services/plc-websocket';

const MODES: { key: AppMode; label: string; icon: string }[] = [
  { key: 'manual', label: '\u270B\u2009手动', icon: '' },
  { key: 'auto', label: '\uD83E\uDD16\u2009演示', icon: '' },
  { key: 'sim', label: '\u2699\u2009仿真', icon: '' },
];

/**
 * 首屏相机：URL 只在初始化时解析一次，之后的机位/展台/镜像切换全部由
 * store 驱动、CameraRig 做阻尼过渡，无需刷新页面。
 * 旧的 ?part= 单件预览仍保留作调试入口，优先级高于机位。
 */
const query = new URLSearchParams(window.location.search);
const isHopperPreview = query.get('part') === 'hopper';
const isMagazinePreview = query.get('part') === 'magazine';
const initialView = resolveViewTuples(
  query.get('view') ?? 'overview',
  query.get('stage'),
  query.get('mirror') === '1',
);
const preview = isHopperPreview
  ? { camera: HOPPER_PREVIEW_CAMERA, target: HOPPER_PREVIEW_TARGET, fov: HOPPER_PREVIEW_FOV }
  : isMagazinePreview
    ? { camera: MAGAZINE_PREVIEW_CAMERA, target: MAGAZINE_PREVIEW_TARGET, fov: MAGAZINE_PREVIEW_FOV }
    : null;
const cameraPosition = preview?.camera ?? initialView.camera;
const cameraTarget = preview?.target ?? initialView.target;
const cameraFov = preview?.fov ?? initialView.fov;

/** 展台相机只有 0.5~2m：整机 minDistance=2 会把近景强行推远，故展台单独放宽到 0.2m */
export default function App() {
  useDispenseLoop();
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const showLabels = useAppStore((s) => s.showLabels);
  const setShowLabels = useAppStore((s) => s.setShowLabels);
  const activeStage = useAppStore((s) => s.activeStage);
  const panelCollapsed = useAppStore((s) => s.panelCollapsed);
  const isMobile = useMobile();
  const [showHelp, setShowHelp] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolType>('modbus');
  const [connected, setConnected] = useState(false);
  const mitsubishiProfile = useAppStore((s) => s.mitsubishiProfile);
  const setMitsubishiProfile = useAppStore((s) => s.setMitsubishiProfile);

  const handleConnect = async (config: PlcConnConfig): Promise<string | null> => {
    const result = await plcService.connect({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      rack: config.rack,
      slot: config.slot,
      profile: config.profile,
    });
    return result.success ? null : result.error || '连接失败';
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: VISUAL.SCENE_BACKGROUND, position: 'relative', overflow: 'hidden' }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        shadows
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
      >
        <OrbitControls
          makeDefault
          target={cameraTarget}
          enableDamping dampingFactor={0.1}
          minDistance={activeStage ? 0.2 : 2}
          maxDistance={25}
          maxPolarAngle={Math.PI / 2}
        />
        <Suspense fallback={null}>
          <color attach="background" args={[VISUAL.SCENE_BACKGROUND]} />
          <ambientLight intensity={VISUAL.SCENE_LIGHTING.ambient} />
          <directionalLight position={VISUAL.SCENE_LIGHTING.keyPosition} intensity={VISUAL.SCENE_LIGHTING.key} />
          <directionalLight
            position={VISUAL.SCENE_LIGHTING.fillPosition}
            intensity={VISUAL.SCENE_LIGHTING.fill}
            color={VISUAL.SCENE_LIGHTING.fillColor}
          />
          {/* 物理世界（含 rapier 刚体与静态碰撞体）由 DispensingSceneContent 统一挂载 */}
          <DispensingSceneContent />
        </Suspense>
      </Canvas>

      {/* 部件展台：隐藏操作面板，避免遮挡 1:1 模型；左上角标注尺度与局部原点 */}
      {activeStage && (
        <div
          className="absolute top-3 left-3 z-10 rounded-xl px-3 py-2 text-xs"
          style={{
            background: 'rgba(15,23,42,0.88)', color: '#e2e8f0',
            border: '1px solid #475569', maxWidth: '28rem', pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>部件展台 · {PART_STAGES[activeStage]?.label}</div>
          <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
            1:1 真实尺度 · 标尺网格 0.1 m<br />
            局部原点：{PART_STAGE_ORIGIN[activeStage] ?? '—'}<br />
            拖拽旋转 / 滚轮缩放
          </div>
        </div>
      )}

      {/* 右上角视图工具栏：机位 / 部件展台 / 镜像布局 / 标签 / 面板折叠 */}
      <ViewSwitcher showPanelToggle compact={isMobile} />

      {/* 左侧极窄控制栏（手机端隐藏，使用底部抽屉；部件展台下也隐藏） */}
      {!activeStage && !isMobile && !panelCollapsed && (
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

          {/* 手动模式：紧凑单点 I/O 操作台（内部已含输入点传感器状态） */}
          {mode === 'manual' && <DispenseControlPanel />}
          {mode === 'auto' && <DispenseDemoPanel />}
          {mode === 'sim' && (
            <>
              <PlcConnectionPanel
                modeLabel="仿真模式"
                protocols={['modbus', 's7', 'mitsubishi']}
                protocol={protocol}
                onProtocolChange={setProtocol}
                enableMitsubishiProfile
                profile={mitsubishiProfile}
                onProfileChange={setMitsubishiProfile}
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

      {!activeStage && isMobile && (
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
              {mode === 'manual' && <DispenseControlPanel />}
              {mode === 'auto' && <DispenseDemoPanel />}
              {mode === 'sim' && (
                <>
                  <PlcConnectionPanel
                    modeLabel="仿真模式"
                    protocols={['modbus', 's7', 'mitsubishi']}
                    protocol={protocol}
                    onProtocolChange={setProtocol}
                    enableMitsubishiProfile
                    profile={mitsubishiProfile}
                    onProfileChange={setMitsubishiProfile}
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
