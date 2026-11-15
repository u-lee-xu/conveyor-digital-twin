/**
 * 液体混装 —— 第 7 个独立设备场景。
 *
 * 通过 DeviceDefinition 接入平台壳，平台壳不感知内部实现。
 * 四个罐体体积是 32 位 REAL 浮点唯一真值；三模式共用面板外壳；
 * 仿真对接外部 PLC 仿真软件，不依赖内置虚拟 PLC、不新增端口或进程。
 */
import type { DeviceDefinition, PlatformModeState } from '@digital-twin/shared';
import type { Mode } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { isViewerRuntime } from '@digital-twin/shared';
import { LiquidSceneContent } from './scenes/LiquidSceneContent';
import { LiquidSceneWrapper } from './platform/LiquidSceneWrapper';
import { LiquidModePanel } from './platform/LiquidModePanel';
import { LiquidDeviceEffects } from './platform/LiquidDeviceEffects';
import { useLiquidAppStore } from './stores/useLiquidAppStore';
import { useLiquidStore, exportLiquidSnapshot } from './stores/useLiquidStore';

function useLiquidModeState(): PlatformModeState {
  const mode = useLiquidAppStore((s) => s.mode);
  const setMode = useLiquidAppStore((s) => s.setMode);
  // 评分模式不开放，任何非三模式值落到手动
  return { mode, setMode: (m: Mode) => setMode(m === 'sim' ? 'sim' : m === 'auto' ? 'auto' : 'manual') };
}

/** 切换模式 / 退出工作区：停演示、断 PLC、清连接态，避免后台继续 300ms 轮询或写线圈 */
function stopAndDisconnect() {
  const store = useLiquidStore.getState();
  store.stopDemo();
  store.setControlSource('local');
  store.setConnected(false);
  useLiquidAppStore.getState().setPlcConnected(false);
  void modbusService.disconnect().catch(() => undefined);
}

/**
 * 进入仿真 = 学生从空罐开始写 PLC 程序做实验。
 * 首屏摆拍态里混合罐 45 L / 成品罐 60 L 是教学展示用的，不能带进仿真，
 * 否则学生一进仿真就看到半罐料、上限开关量已置位，实验起点不对。
 * 因此切到 sim 时统一走「全部复位」的工艺复位态（只留 A/B 原料罐），
 * 与面板全部复位 / PLC RESET 动作字 / frame.reset 同源。
 * 手动 / 演示之间切换不动真值；观众端是只读镜像，绝不在此写本地状态。
 */
function onModeChange(mode: Mode) {
  stopAndDisconnect();
  if (mode === 'sim' && !isViewerRuntime()) {
    useLiquidStore.getState().resetAll();
  }
}

export const liquidMixingDevice: DeviceDefinition = {
  id: 'liquid-mixing',
  name: '液体混装',
  icon: '◍',
  gradient: 'from-cyan-700 to-teal-700',
  version: '1.0',
  description: 'A/B 双液依次定量进料、正反转交替搅拌、底部出料转入成品储液罐；四罐液位为 32 位 REAL 模拟量并带上下限开关量反馈。',
  protocols: ['modbus', 's7', 'mitsubishi'],
  /**
   * 三模式共用 LiquidModePanel 外壳：平台壳按 mode 渲染 panel，
   * 外壳内部按同一个 useLiquidAppStore.mode 分发，data-dt-liquid-panel 锚点始终唯一。
   */
  modes: [
    { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500', panel: LiquidModePanel },
    { id: 'auto', label: '演示', icon: '🤖', color: 'from-purple-500 to-pink-500', panel: LiquidModePanel },
    { id: 'sim', label: '仿真', icon: '🔌', color: 'from-orange-500 to-yellow-500', panel: LiquidModePanel, needsConnection: true },
  ],
  SceneContent: LiquidSceneContent,
  cameraPosition: [1.85, 1.18, 2.15],
  SceneWrapper: LiquidSceneWrapper,
  effects: LiquidDeviceEffects,
  useModeState: useLiquidModeState,
  onModeChange,
  onCleanup: () => {
    stopAndDisconnect();
    // 只清运行时状态：保留四罐体积与组分，切走再回来仍是学生刚才看到的现场
    // （若这里调 resetAll，会把「全部复位」后的空罐又填回教学首屏展示态）
    useLiquidStore.getState().resetRuntime();
  },
  /** 观众只读镜像：数值键，有限性守卫由 store 内部保证 */
  applyBroadcast: (v: Record<string, boolean | number>) => {
    useLiquidStore.getState().applyBroadcast(v);
  },
  /** 主控上报：与 applyBroadcast 键名一一对应，手动 / 演示模式同样可同步 */
  exportSnapshot: () => exportLiquidSnapshot(),
};
