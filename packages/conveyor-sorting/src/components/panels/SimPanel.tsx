import React from 'react';
import type { SimStep } from '../../hooks/useSimMode';

interface SimPanelProps {
  step: SimStep;
  isSimulationRunning: boolean;
  errorMessage: string | null;
  stats: {
    readCount: number;
    writeCount: number;
    errorCount: number;
  };
  controlSignals: {
    start: boolean;
    stop: boolean;
    reset: boolean;
    feedCylinderValve: boolean;
    sorting1CylinderValve: boolean;
    sorting2CylinderValve: boolean;
    conveyor: boolean;
  };
  sensors: {
    feed: boolean;
    color: boolean;
    material: boolean;
  };
  cylinders: {
    feed: { extended: boolean };
    sorting1: { extended: boolean };
    sorting2: { extended: boolean };
  };
  conveyorRunning: boolean;
  onPublishAllFeedback: () => void;
  onSimulationStart: (signal: boolean) => void;
  onSimulationStop: (signal: boolean) => void;
  onSimulationReset: (signal: boolean) => void;
  onSpawnMaterial: () => void;
  onInitialize: () => void;
}

const SignalRow: React.FC<{
  modbusAddr: number;
  plcAddr: string;
  label: string;
  val: boolean;
  color: 'cyan' | 'green' | 'purple';
}> = ({ modbusAddr, plcAddr, label, val, color }) => {
  const dotColor = {
    cyan: val ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-gray-700',
    green: val ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]' : 'bg-gray-700',
    purple: val ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.7)]' : 'bg-gray-700',
  }[color];

  return (
    <div className="flex items-center px-2 py-1 rounded bg-gray-800/60 border border-gray-700/30 gap-1">
      <span className="text-gray-500 font-mono text-[10px] shrink-0 w-10 text-left">{modbusAddr}</span>
      <span className="text-amber-400/80 font-mono text-[10px] shrink-0 w-10 text-left">{plcAddr}</span>
      <span className="text-gray-300 text-[11px] truncate flex-1 min-w-0">{label}</span>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-1 ${dotColor} transition-all duration-200`} />
    </div>
  );
};

const SectionHeader: React.FC<{
  title: string;
  subtitle: string;
  color: 'cyan' | 'green' | 'purple';
}> = ({ title, subtitle, color }) => {
  const colors = {
    cyan: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    green: 'text-green-400 border-green-500/40 bg-green-500/10',
    purple: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
  }[color];

  return (
    <div className={`px-2 py-1.5 rounded-lg border mb-2 ${colors}`}>
      <div className="text-[11px] font-semibold">{title}</div>
      <div className="text-[9px] opacity-70 mt-0.5">{subtitle}</div>
    </div>
  );
};

export const SimPanel: React.FC<SimPanelProps> = ({
  step,
  isSimulationRunning,
  errorMessage,
  stats,
  controlSignals,
  sensors,
  cylinders,
  onPublishAllFeedback,
  onSimulationStart,
  onSimulationStop,
  onSimulationReset,
  onSpawnMaterial,
  onInitialize,
}) => {
  if (step === 'DISCONNECTED' || step === 'ERROR') {
    return (
      <div className="space-y-3">
        <div className="device-card">
          <div className="text-sm text-white mb-2">仿真模式</div>
          <div className="text-xs text-slate-400">
            {step === 'DISCONNECTED' && '请先在上方填写 PLC 地址并手动连接。'}
            {step === 'ERROR' && `连接异常：${errorMessage || '未知错误'}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="device-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-sm font-medium text-gray-200">仿真模式</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="status-badge status-badge-active pulse-indicator text-[10px]">已连接</span>
            <span className={`text-[9px] text-green-400 transition-opacity ${isSimulationRunning ? 'opacity-100' : 'opacity-0'}`}>运行中</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <button
            tabIndex={-1}
            onMouseDown={() => onSimulationStart(true)}
            onMouseUp={() => onSimulationStart(false)}
            onMouseLeave={() => onSimulationStart(false)}
            onTouchStart={(e) => { e.preventDefault(); onSimulationStart(true); }}
            onTouchEnd={(e) => { e.preventDefault(); onSimulationStart(false); }}
            className="py-2 px-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-600 transition-colors active:brightness-90 shadow-lg shadow-green-500/20 select-none"
          >
            启动
          </button>
          <button
            tabIndex={-1}
            onMouseDown={() => onSimulationStop(true)}
            onMouseUp={() => onSimulationStop(false)}
            onMouseLeave={() => onSimulationStop(false)}
            onTouchStart={(e) => { e.preventDefault(); onSimulationStop(true); }}
            onTouchEnd={(e) => { e.preventDefault(); onSimulationStop(false); }}
            className="py-2 px-3 rounded-lg bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-medium hover:from-red-600 hover:to-rose-600 transition-colors active:brightness-90 shadow-lg shadow-red-500/20 select-none"
          >
            停止
          </button>
          <button
            tabIndex={-1}
            onMouseDown={() => onSimulationReset(true)}
            onMouseUp={() => onSimulationReset(false)}
            onMouseLeave={() => onSimulationReset(false)}
            onTouchStart={(e) => { e.preventDefault(); onSimulationReset(true); }}
            onTouchEnd={(e) => { e.preventDefault(); onSimulationReset(false); }}
            className="py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-colors active:brightness-90 shadow-lg shadow-amber-500/20 select-none"
          >
            复位
          </button>
          <button
            tabIndex={-1}
            onClick={onSpawnMaterial}
            className="py-2 px-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-medium hover:from-blue-600 hover:to-indigo-600 transition-colors active:brightness-90 shadow-lg shadow-blue-500/20 select-none"
          >
            生料
          </button>
          <button
            tabIndex={-1}
            onClick={onInitialize}
            className="py-2 px-3 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white text-sm font-medium hover:from-purple-600 hover:to-fuchsia-600 transition-colors active:brightness-90 shadow-lg shadow-purple-500/20 select-none"
          >
            初始化
          </button>
        </div>
      </div>

      <div className="device-card">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">通信统计</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-center">
            <div className="text-base font-medium text-cyan-400">{stats.readCount}</div>
            <div className="text-[10px] text-gray-400">读取</div>
          </div>
          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <div className="text-base font-medium text-green-400">{stats.writeCount}</div>
            <div className="text-[10px] text-gray-400">写入</div>
          </div>
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
            <div className="text-base font-medium text-red-400">{stats.errorCount}</div>
            <div className="text-[10px] text-gray-400">错误</div>
          </div>
        </div>
      </div>

      <div className="device-card space-y-3">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Modbus 信号地址</div>
        <div className="flex items-center px-2 py-0.5 gap-1 text-[9px] text-gray-600">
          <span className="w-10 shrink-0">Modbus</span>
          <span className="w-10 shrink-0">PLC</span>
          <span className="flex-1">描述</span>
          <span className="w-2.5 shrink-0"></span>
        </div>

        <div>
          <SectionHeader title="主令信号" subtitle="仿真系统 -> PLC" color="purple" />
          <div className="space-y-1">
            <SignalRow modbusAddr={0} plcAddr="M0" label="启动控制" val={controlSignals.start} color="purple" />
            <SignalRow modbusAddr={11} plcAddr="M11" label="停止控制" val={controlSignals.stop} color="purple" />
            <SignalRow modbusAddr={1} plcAddr="M1" label="复位控制" val={controlSignals.reset} color="purple" />
          </div>
        </div>

        <div>
          <SectionHeader title="控制信号" subtitle="PLC -> 仿真系统" color="cyan" />
          <div className="space-y-1">
            <SignalRow modbusAddr={100} plcAddr="M100" label="上料气缸电磁阀" val={controlSignals.feedCylinderValve} color="cyan" />
            <SignalRow modbusAddr={101} plcAddr="M101" label="分拣1气缸电磁阀" val={controlSignals.sorting1CylinderValve} color="cyan" />
            <SignalRow modbusAddr={102} plcAddr="M102" label="分拣2气缸电磁阀" val={controlSignals.sorting2CylinderValve} color="cyan" />
            <SignalRow modbusAddr={103} plcAddr="M103" label="传送带运行" val={controlSignals.conveyor} color="cyan" />
          </div>
        </div>

        <div>
          <SectionHeader title="反馈信号" subtitle="仿真系统 -> PLC" color="green" />
          <div className="space-y-1">
            <SignalRow modbusAddr={2} plcAddr="M2" label="上料缩回限位" val={!cylinders.feed.extended} color="green" />
            <SignalRow modbusAddr={3} plcAddr="M3" label="上料伸出限位" val={cylinders.feed.extended} color="green" />
            <SignalRow modbusAddr={4} plcAddr="M4" label="分拣1缩回限位" val={!cylinders.sorting1.extended} color="green" />
            <SignalRow modbusAddr={5} plcAddr="M5" label="分拣1伸出限位" val={cylinders.sorting1.extended} color="green" />
            <SignalRow modbusAddr={6} plcAddr="M6" label="分拣2缩回限位" val={!cylinders.sorting2.extended} color="green" />
            <SignalRow modbusAddr={7} plcAddr="M7" label="分拣2伸出限位" val={cylinders.sorting2.extended} color="green" />
            <SignalRow modbusAddr={8} plcAddr="M8" label="上料传感器" val={sensors.feed} color="green" />
            <SignalRow modbusAddr={9} plcAddr="M9" label="色标传感器" val={sensors.color} color="green" />
            <SignalRow modbusAddr={10} plcAddr="M10" label="物料传感器" val={sensors.material} color="green" />
          </div>
        </div>
      </div>

      <button
        onClick={onPublishAllFeedback}
        className="w-full py-2 px-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-colors select-none"
      >
        强制刷新反馈
      </button>
    </div>
  );
};

export default SimPanel;
