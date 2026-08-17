import { useDispensingStore } from '../../../stores/useDispensingStore';
import { SLIDER_MIN_X, PULSES_PER_M, MODBUS_DISPLAY_VARS, type MagazineId } from '../constants';

/** IO 信号 LED 指示灯（地址 title 提示） */
function IOLed({ label, active, addr }: { label: string; active: boolean; addr?: string }) {
  return (
    <div className="flex items-center gap-1 py-0.5 min-w-0" title={addr} style={{ fontSize: '0.62rem' }}>
      <span className={`io-led ${active ? 'io-led-on' : 'io-led-off'}`} />
      <span className={`truncate ${active ? 'text-green-300' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

const ADDR = MODBUS_DISPLAY_VARS;

/**
 * IO 状态面板：按钮输入 / 限位 / 空仓 / 磁性开关 / 取药仓 / 编码器（物理世界实时反映）
 */
export function DispenseStatusPanel() {
  const buttons = useDispensingStore((s) => s.buttons);
  const sensors = useDispensingStore((s) => s.sensors);
  const sliderX = useDispensingStore((s) => s.sliderX);
  const lamp = useDispensingStore((s) => s.lamp);
  const sendCyl = useDispensingStore((s) => s.sendCyl);
  const tiltCyl = useDispensingStore((s) => s.tiltCyl);
  const magStock = useDispensingStore((s) => s.magStock);
  const hopperPills = useDispensingStore((s) => s.hopperPills);
  const binPills = useDispensingStore((s) => s.binPills);
  const autoPhase = useDispensingStore((s) => s.autoPhase);
  const autoCycle = useDispensingStore((s) => s.autoCycle);
  const motorFwd = useDispensingStore((s) => s.motorFwd);
  const motorRev = useDispensingStore((s) => s.motorRev);

  const encoder = Math.round((sliderX - SLIDER_MIN_X) * PULSES_PER_M);
  const mags: MagazineId[] = ['A', 'B', 'C'];

  return (
    <div className="space-y-2">
      {/* 主令输入 */}
      <div className="card">
        <div className="section-title !mb-1">主令输入（按钮）</div>
        <div className="grid grid-cols-5 gap-x-1">
          <IOLed label="启动" active={buttons.start} addr={ADDR.BUTTON_START} />
          <IOLed label="停止" active={buttons.stop} addr={ADDR.BUTTON_STOP} />
          <IOLed label="复位" active={buttons.reset} addr={ADDR.BUTTON_RESET} />
          <IOLed label="急停" active={buttons.estop} addr={ADDR.BUTTON_ESTOP} />
          <IOLed label="取药确认" active={buttons.confirm} addr={ADDR.BUTTON_CONFIRM} />
        </div>
      </div>

      {/* 位置与限位 */}
      <div className="card">
        <div className="section-title !mb-1">位置</div>
        <div className="grid grid-cols-3 gap-x-1">
          <IOLed label={`编码器 ${encoder}`} active={encoder > 0} addr="0.01m/脉冲" />
          <IOLed label="起点限位" active={sensors.limitStart} addr={ADDR.S_LIMIT_START} />
          <IOLed label="终点限位" active={sensors.limitEnd} addr={ADDR.S_LIMIT_END} />
        </div>
      </div>

      {/* 药仓 */}
      <div className="card">
        <div className="section-title !mb-1">药仓（A/B/C）</div>
        <div className="grid grid-cols-3 gap-x-1">
          {mags.map((mag) => (
            <IOLed
              key={mag}
              label={`${mag}仓 ${magStock[mag]}`}
              active={sensors.magEmpty[mag]}
              addr={ADDR[`S_MAG_${mag}_EMPTY` as keyof typeof ADDR]}
            />
          ))}
          <IOLed label={`料斗 ${hopperPills}`} active={hopperPills > 0} addr="料斗内药片" />
          <IOLed label="取药仓有药" active={sensors.binHasDrug} addr={ADDR.S_BIN_HAS_DRUG} />
          <IOLed label={`仓内 ${Object.values(binPills).reduce((a, b) => a + b, 0)}`} active={Object.values(binPills).some((v) => v > 0)} addr="取药仓药片" />
        </div>
      </div>

      {/* 气缸磁性开关 */}
      <div className="card">
        <div className="section-title !mb-1">气缸磁性开关</div>
        <div className="grid grid-cols-3 gap-x-1">
          {mags.map((mag) => (
            <div key={mag} className="flex flex-col">
              <IOLed label={`${mag}缸后`} active={sensors.mscBack[mag]} addr={ADDR[`MSC_${mag}_BACK` as keyof typeof ADDR]} />
              <IOLed label={`${mag}缸前`} active={sensors.mscFront[mag]} addr={ADDR[`MSC_${mag}_FRONT` as keyof typeof ADDR]} />
            </div>
          ))}
          <IOLed label="翻转盛药位" active={sensors.mscTiltHold} addr={ADDR.MSC_TILT_HOLD} />
          <IOLed label="翻转倒药位" active={sensors.mscTiltDump} addr={ADDR.MSC_TILT_DUMP} />
        </div>
      </div>

      {/* 输出状态 */}
      <div className="card">
        <div className="section-title !mb-1">输出（执行器/灯塔）</div>
        <div className="grid grid-cols-3 gap-x-1">
          <IOLed label="电机正转" active={motorFwd} addr={ADDR.MOTOR_FWD} />
          <IOLed label="电机反转" active={motorRev} addr={ADDR.MOTOR_REV} />
          {mags.map((mag) => (
            <IOLed key={mag} label={`${mag}送药缸`} active={sendCyl[mag].extended} addr={ADDR[`CYL_SEND_${mag}` as keyof typeof ADDR]} />
          ))}
          <IOLed label="翻转缸" active={tiltCyl.tilted} addr={ADDR.CYL_TILT} />
          <IOLed label="灯塔绿" active={lamp.green} addr={ADDR.LAMP_GREEN} />
          <IOLed label="灯塔黄" active={lamp.yellow} addr={ADDR.LAMP_YELLOW} />
          <IOLed label="灯塔红" active={lamp.red} addr={ADDR.LAMP_RED} />
        </div>
      </div>

      {/* 自动流程状态 */}
      <div className="card">
        <div className="section-title !mb-1">流程状态</div>
        <div className="flex items-center gap-1.5">
          <span className="badge badge-blue">{autoPhase}</span>
          <span className="badge badge-slate">轮次 {autoCycle}</span>
        </div>
      </div>
    </div>
  );
}