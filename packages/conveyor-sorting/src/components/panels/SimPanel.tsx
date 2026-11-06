import React from 'react';
import type { SimStep } from '../../hooks/useSimMode';
import { useDeviceStore } from '../../stores';

interface SimPanelProps {
  step: SimStep;
  isSimulationRunning: boolean;
  errorMessage: string | null;
  stats: { readCount: number; writeCount: number; errorCount: number };
  controlSignals: {
    start: boolean;
    stop: boolean;
    reset: boolean;
    feedCylinderValve: boolean;
    sorting1CylinderValve: boolean;
    sorting2CylinderValve: boolean;
    conveyor: boolean;
  };
  onPublishAllFeedback: () => void;
  onSimulationStart: (signal: boolean) => void;
  onSimulationStop: (signal: boolean) => void;
  onSimulationReset: (signal: boolean) => void;
  onSpawnMaterial: () => void;
  onInitialize: () => void;
}

/** Modbus / PLC 地址对照行：与配药仿真面板的紧凑 IO 列表同款 */
const SignalRow: React.FC<{ modbusAddr: number; plcAddr: string; label: string; val: boolean }> = ({
  modbusAddr, plcAddr, label, val,
}) => (
  <div className="flex items-center gap-1 py-0.5" style={{ fontSize: '0.62rem' }}>
    <span className="addr-tag w-10 shrink-0 text-left">{modbusAddr}</span>
    <span className="addr-tag w-10 shrink-0 text-left">{plcAddr}</span>
    <span className={`truncate flex-1 min-w-0 ${val ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    <span className={`io-led ${val ? 'io-led-on' : 'io-led-off'}`} />
  </div>
);

export const SimPanel: React.FC<SimPanelProps> = ({
  step,
  isSimulationRunning,
  errorMessage,
  stats,
  controlSignals,
  onPublishAllFeedback,
  onSimulationStart,
  onSimulationStop,
  onSimulationReset,
  onSpawnMaterial,
  onInitialize,
}) => {
  const sensors = useDeviceStore((s) => s.sensors);
  const feedExtended = useDeviceStore((s) => s.cylinders.feed.extended);
  const sorting1Extended = useDeviceStore((s) => s.cylinders.sorting1.extended);
  const sorting2Extended = useDeviceStore((s) => s.cylinders.sorting2.extended);

  if (step === 'DISCONNECTED' || step === 'ERROR') {
    return (
      <div className="card">
        <div className="section-title !mb-1">仿真模式</div>
        <div className="text-[0.62rem] text-slate-400">
          {step === 'DISCONNECTED' && '请先在上方填写 PLC 地址并手动连接。'}
          {step === 'ERROR' && `连接异常：${errorMessage || '未知错误'}`}
        </div>
      </div>
    );
  }

  /** 主令按钮是「按住有效」的点动信号，保留 onMouseDown/Up 语义，只换外观 */
  const holdButton = (label: string, variant: string, signal: (on: boolean) => void) => (
    <button
      key={label}
      tabIndex={-1}
      onMouseDown={() => signal(true)}
      onMouseUp={() => signal(false)}
      onMouseLeave={() => signal(false)}
      onTouchStart={(e) => { e.preventDefault(); signal(true); }}
      onTouchEnd={(e) => { e.preventDefault(); signal(false); }}
      className={`btn btn-xs ${variant} flex-1 touch-manipulation select-none`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="card">
        <div className="section-title !mb-1">仿真模式</div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="badge badge-green">已连接</span>
          <span className={`badge ${isSimulationRunning ? 'badge-blue' : 'badge-slate'}`}>
            {isSimulationRunning ? '运行中' : '待命'}
          </span>
        </div>
        <div className="flex gap-1">
          {holdButton('启动', 'btn-success', onSimulationStart)}
          {holdButton('停止', 'btn-danger', onSimulationStop)}
          {holdButton('复位', 'btn-warning', onSimulationReset)}
          <button tabIndex={-1} onClick={onSpawnMaterial} className="btn btn-xs btn-primary flex-1 touch-manipulation">生料</button>
          <button tabIndex={-1} onClick={onInitialize} className="btn btn-xs btn-outline flex-1 touch-manipulation">初始化</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">通信统计</div>
        <div className="flex flex-wrap gap-1.5">
          <span className="badge badge-blue">读取 {stats.readCount}</span>
          <span className="badge badge-green">写入 {stats.writeCount}</span>
          <span className={`badge ${stats.errorCount > 0 ? 'badge-red' : 'badge-slate'}`}>错误 {stats.errorCount}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">Modbus 信号地址</div>
        <div className="flex items-center gap-1 mb-1 text-[0.55rem] text-slate-600">
          <span className="w-10 shrink-0">Modbus</span>
          <span className="w-10 shrink-0">PLC</span>
          <span className="flex-1">描述</span>
        </div>

        <div className="section-title !mb-1 !mt-2">主令信号 · 仿真 → PLC</div>
        <SignalRow modbusAddr={0} plcAddr="M0" label="启动控制" val={controlSignals.start} />
        <SignalRow modbusAddr={11} plcAddr="M11" label="停止控制" val={controlSignals.stop} />
        <SignalRow modbusAddr={1} plcAddr="M1" label="复位控制" val={controlSignals.reset} />

        <div className="section-title !mb-1 !mt-2">控制信号 · PLC → 仿真</div>
        <SignalRow modbusAddr={100} plcAddr="M100" label="上料气缸电磁阀" val={controlSignals.feedCylinderValve} />
        <SignalRow modbusAddr={101} plcAddr="M101" label="分拣1气缸电磁阀" val={controlSignals.sorting1CylinderValve} />
        <SignalRow modbusAddr={102} plcAddr="M102" label="分拣2气缸电磁阀" val={controlSignals.sorting2CylinderValve} />
        <SignalRow modbusAddr={103} plcAddr="M103" label="传送带运行" val={controlSignals.conveyor} />

        <div className="section-title !mb-1 !mt-2">反馈信号 · 仿真 → PLC</div>
        <SignalRow modbusAddr={2} plcAddr="M2" label="上料缩回限位" val={!feedExtended} />
        <SignalRow modbusAddr={3} plcAddr="M3" label="上料伸出限位" val={feedExtended} />
        <SignalRow modbusAddr={4} plcAddr="M4" label="分拣1缩回限位" val={!sorting1Extended} />
        <SignalRow modbusAddr={5} plcAddr="M5" label="分拣1伸出限位" val={sorting1Extended} />
        <SignalRow modbusAddr={6} plcAddr="M6" label="分拣2缩回限位" val={!sorting2Extended} />
        <SignalRow modbusAddr={7} plcAddr="M7" label="分拣2伸出限位" val={sorting2Extended} />
        <SignalRow modbusAddr={8} plcAddr="M8" label="上料传感器" val={sensors.feed} />
        <SignalRow modbusAddr={9} plcAddr="M9" label="色标传感器" val={sensors.color} />
        <SignalRow modbusAddr={10} plcAddr="M10" label="物料传感器" val={sensors.material} />
      </div>

      <button
        onClick={onPublishAllFeedback}
        className="btn btn-xs btn-outline w-full touch-manipulation"
      >
        强制刷新反馈
      </button>
    </div>
  );
};

export default SimPanel;
