import { useRobotStore, type CylinderName } from '../useRobotStore';

/** 磁性开关信号元数据（与 ManualPanel 语义一致） */
const META: Record<CylinderName, { label: string; left: string; right: string; leftSignal: 'magFront' | 'magRear'; rightSignal: 'magFront' | 'magRear' }> = {
  forward: { label: '前后气缸', left: '伸出', right: '缩回', leftSignal: 'magFront', rightSignal: 'magRear' },
  lift:    { label: '升降气缸', left: '下降', right: '升起', leftSignal: 'magFront', rightSignal: 'magRear' },
  clamp:   { label: '夹爪气缸', left: '夹紧', right: '张开', leftSignal: 'magRear', rightSignal: 'magFront' },
};

/** 单个气缸磁性开关行（独立订阅具体信号，避免位置动画期间重渲染） */
function MagRow({ name }: { name: CylinderName }) {
  const meta = META[name];
  const leftOn = useRobotStore((s) => s.cylinders[name][meta.leftSignal]);
  const rightOn = useRobotStore((s) => s.cylinders[name][meta.rightSignal]);

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-400">{meta.label}</span>
      <div className="flex gap-3">
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${leftOn ? 'bg-green-400' : 'bg-gray-600'}`}></span>
          <span className="text-xs text-gray-500">{meta.left}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${rightOn ? 'bg-green-400' : 'bg-gray-600'}`}></span>
          <span className="text-xs text-gray-500">{meta.right}</span>
        </div>
      </div>
    </div>
  );
}

/** 传感器信号面板（外观与传送带场景"设备状态 → 磁性开关"一致） */
export function SensorPanel() {
  return (
    <div className="device-card">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">传感器信号</div>
      <div className="space-y-2">
        <MagRow name="forward" />
        <MagRow name="lift" />
        <MagRow name="clamp" />
      </div>
    </div>
  );
}

export default SensorPanel;
