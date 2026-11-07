import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  MANUAL_INPUT_POINTS, MANUAL_IO_SUMMARY, IO_GROUP_TITLES, ENCODER_REGISTER_INFO,
  inputPointLevel, type IoPoint, type IoGroup,
} from '../manualIo';

/**
 * 输入点（X）传感器状态。
 *
 * 紧凑化改造：地址不再只放在 title 里靠鼠标悬停，而是每点都可见；
 * 按组排成三列 LED 网格，22 个输入点压进一屏，不再需要为看传感器状态
 * 一路滚动。电平由 manualIo.inputPointLevel() 纯函数读取，与地址表同源。
 * 位置改由单独的 32 位 DINT 数值行显示，不再拆成 8 个「编码器位」输入点。
 */
function InputLed({ point, on }: { point: IoPoint; on: boolean }) {
  return (
    <div
      className="flex items-center gap-1 py-0 min-w-0 leading-[1.15rem]"
      title={`${point.addr} / ${point.coil} / ${point.label}`}
    >
      <span className={`io-led !w-[6px] !h-[6px] ${on ? 'io-led-on' : 'io-led-off'}`} />
      <span className="font-mono text-[0.5rem] text-sky-400/80 w-[26px] shrink-0">{point.addr}</span>
      <span className={`truncate text-[0.58rem] ${on ? 'text-green-300' : 'text-slate-500'}`}>
        {point.label}
      </span>
    </div>
  );
}

const GROUPS = [...new Set(MANUAL_INPUT_POINTS.map((p) => p.group))] as IoGroup[];

export function DispenseStatusPanel() {
  const buttons = useDispensingStore((s) => s.buttons);
  const sensors = useDispensingStore((s) => s.sensors);
  const encoderPulses = useDispensingStore((s) => s.encoderPulses);
  const hopperPills = useDispensingStore((s) => s.hopperPills);
  const binPills = useDispensingStore((s) => s.binPills);

  const snapshot = { buttons, sensors, encoderPulses };
  const binCount = Object.values(binPills).reduce((a, b) => a + b, 0);

  return (
    <div className="device-card !p-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="section-title !mb-0">输入点 X · 传感器状态</span>
        <span className="badge badge-slate">{MANUAL_IO_SUMMARY.inputs} 点只读</span>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="mt-0.5">
          <div className="text-[0.55rem] leading-tight text-slate-500">{IO_GROUP_TITLES[group]}</div>
          <div className="grid grid-cols-3 gap-x-1">
            {MANUAL_INPUT_POINTS.filter((p) => p.group === group).map((point) => (
              <InputLed
                key={point.key}
                point={point}
                on={inputPointLevel(point.key, snapshot)}
              />
            ))}
          </div>
        </div>
      ))}
      {/* 位置寄存器是数值不是输入点；料斗/取药仓计数顺带一行显示 */}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="badge badge-blue" title={ENCODER_REGISTER_INFO.address}>
          {ENCODER_REGISTER_INFO.type} {encoderPulses}
        </span>
        <span className="badge badge-slate">{ENCODER_REGISTER_INFO.address}</span>
        <span className="badge badge-slate">料斗 {hopperPills}</span>
        <span className="badge badge-slate">仓内 {binCount}</span>
      </div>
    </div>
  );
}
