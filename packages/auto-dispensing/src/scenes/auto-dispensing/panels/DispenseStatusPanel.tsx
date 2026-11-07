import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  MANUAL_INPUT_POINTS, MANUAL_IO_SUMMARY, IO_GROUP_TITLES, ENCODER_REGISTER_INFO,
  DINT_ADDRESS_ROWS, inputPointLevel, ioAddressRows, type IoPoint, type IoGroup,
} from '../manualIo';
import { AddressHint } from './AddressHint';
import { ReadoutNum } from './ReadoutNum';

/**
 * 输入点（X）传感器状态。
 *
 * 三协议地址不直接铺在面板上：鼠标悬停（或键盘聚焦）到「启动」「停止」「A 缸后」
 * 等信号名称时由 AddressHint 浮框一次列出三菱 X / Modbus 线圈 / S7 M 区地址，
 * 完整映射仍以「使用说明」为准。
 * 输入点统一「每行 2 个」：manualIo.inputGroup() 保证每组点数为偶数，
 * 磁性开关 10 点恰好是 5 对「A 缸后 / A 缸前 … 盛药位 / 翻转位」，
 * 一行就是一个气缸的两个磁性开关，不再出现三列时末尾孤零零一个 LED。
 * 这样 22 个输入点仍是 11 行压进一屏，且不会因为地址列把名称挤没。
 * 电平由 manualIo.inputPointLevel() 纯函数读取，与地址表同源。
 * 位置寄存器是数值不是输入点，单独一行显示 DINT32 读数。
 */
function InputLed({ point, on }: { point: IoPoint; on: boolean }) {
  return (
    <div className="flex items-center gap-1 py-0 min-w-0 leading-[1.15rem]">
      <span className={`io-led !w-[6px] !h-[6px] ${on ? 'io-led-on' : 'io-led-off'}`} />
      <AddressHint
        title={point.label}
        rows={ioAddressRows([point])}
        className={`truncate min-w-0 flex-1 text-[0.58rem] ${on ? 'text-green-300' : 'text-slate-500'}`}
      >
        {point.label}
      </AddressHint>
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
        <span className="section-title !mb-0">输入点 · 传感器状态</span>
        <span className="badge badge-slate">{MANUAL_IO_SUMMARY.inputs} 点只读</span>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="mt-0.5">
          <div className="text-[0.55rem] leading-tight text-slate-500">{IO_GROUP_TITLES[group]}</div>
          <div className="grid grid-cols-2 gap-x-2">
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
        <AddressHint
          title="位置寄存器"
          rows={DINT_ADDRESS_ROWS}
          note={ENCODER_REGISTER_INFO.address}
          underline={false}
        >
          <span className="badge badge-blue">
            {ENCODER_REGISTER_INFO.type} <ReadoutNum value={encoderPulses} digits={5} />
          </span>
        </AddressHint>
        <span className="badge badge-slate">料斗 <ReadoutNum value={hopperPills} digits={2} /></span>
        <span className="badge badge-slate">仓内 <ReadoutNum value={binCount} digits={2} /></span>
      </div>
    </div>
  );
}
