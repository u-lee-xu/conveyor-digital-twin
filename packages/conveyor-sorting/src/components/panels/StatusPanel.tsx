import React from 'react';
import { useDeviceStore } from '../../stores';

/** IO 状态灯：与自动配药 DispenseStatusPanel 同款紧凑布局 */
function IOLed({ label, active, addr }: { label: string; active: boolean; addr?: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 min-w-0" title={addr} style={{ fontSize: '0.62rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <span className={`truncate ${active ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

/**
 * 设备状态面板：card + section-title + io-led + badge，
 * 去掉旧版的发光圆点大色块 / pulse 动画。
 */
export const StatusPanel: React.FC = () => {
  const sensors = useDeviceStore((s) => s.sensors);
  const feedExtended = useDeviceStore((s) => s.cylinders.feed.extended);
  const sorting1Extended = useDeviceStore((s) => s.cylinders.sorting1.extended);
  const sorting2Extended = useDeviceStore((s) => s.cylinders.sorting2.extended);
  const conveyorRunning = useDeviceStore((s) => s.conveyorRunning);
  const materialVisible = useDeviceStore((s) => s.material.visible);
  const signalTower = useDeviceStore((s) => s.signalTower);

  const cylinders = [
    { label: '上料气缸', extended: feedExtended, addr: 'M2 / M3' },
    { label: '分拣1', extended: sorting1Extended, addr: 'M4 / M5' },
    { label: '分拣2', extended: sorting2Extended, addr: 'M6 / M7' },
  ];

  return (
    <div className="space-y-2">
      <div className="card">
        <div className="section-title !mb-1">系统状态</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge ${conveyorRunning ? 'badge-green' : 'badge-slate'}`}>
            {conveyorRunning ? '系统运行' : '系统待机'}
          </span>
          <span className={`badge ${materialVisible ? 'badge-blue' : 'badge-slate'}`}>
            {materialVisible ? '有物料' : '无物料'}
          </span>
          <span className={`badge ${signalTower.red ? 'badge-red' : 'badge-slate'}`}>红灯</span>
          <span className={`badge ${signalTower.yellow ? 'badge-yellow' : 'badge-slate'}`}>黄灯</span>
          <span className={`badge ${signalTower.green ? 'badge-green' : 'badge-slate'}`}>绿灯</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">传感器信号</div>
        <div className="grid grid-cols-3 gap-x-1">
          <IOLed label="上料" active={sensors.feed} addr="M8" />
          <IOLed label="色标" active={sensors.color} addr="M9" />
          <IOLed label="物料" active={sensors.material} addr="M10" />
        </div>
      </div>

      <div className="card">
        <div className="section-title !mb-1">气缸磁性开关</div>
        <div className="grid grid-cols-3 gap-x-1">
          {cylinders.map((c) => (
            <div key={c.label} className="flex flex-col">
              <IOLed label={`${c.label} 前`} active={c.extended} addr={c.addr} />
              <IOLed label={`${c.label} 后`} active={!c.extended} addr={c.addr} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusPanel;
