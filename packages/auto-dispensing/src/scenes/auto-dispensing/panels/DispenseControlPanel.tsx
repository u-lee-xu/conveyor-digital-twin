import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MODBUS_HOLDING_REGISTERS, MAG_CAPACITY,
  type MagazineId,
} from '../constants';
import {
  MANUAL_OUTPUT_POINTS, MANUAL_IO_SUMMARY, outputPointLevel,
  type IoPoint, type OutputSnapshot,
} from '../manualIo';
import { DispenseStatusPanel } from './DispenseStatusPanel';

/**
 * 手动模式：PLC 单点 I/O 操作台。
 *
 * 面板按键等价于直接置位 / 复位输出线圈（Y），不跑自动流程；
 * 每个按键都标注真实点位地址（三菱 Y 号 + Modbus 线圈号，来自地址表），
 * 输入点（X）传感器状态由下方 DispenseStatusPanel 集中回显。
 *
 * 紧凑化改造：旧版是「6 张控制卡片 + 6 张状态卡片」共 12 张卡，
 * 每张 20px padding + 逐行进度条，传感器状态要滚很久才看得到。
 * 现在把「说明 / 输出点 / 药仓」合成一张卡（内部分隔线），输入点单独一张，
 * 逐行进度条换成点位 LED，一屏内可完成单点操作与状态核对。
 */
const MAG_ORDER: MagazineId[] = ['A', 'B', 'C', 'D'];
const OUTPUT_BY_KEY = Object.fromEntries(
  MANUAL_OUTPUT_POINTS.map((p) => [p.key, p]),
) as Record<string, IoPoint>;

/** 地址徽标：文本一律由点位表拼出，禁止在 JSX 里回填具体点位地址 */
function AddrTag({ points }: { points: IoPoint[] }) {
  const xy = points.map((p) => p.addr).join('/');
  // 双点行（电机正/反转）两个线圈号都要可见，第二个省略重复的 C 前缀以守住紧凑宽度
  const coils = points.map((p, i) => (i === 0 ? p.coil : p.coil.slice(1))).join('/');
  return (
    <span
      className="font-mono text-[0.55rem] text-sky-300 w-[68px] shrink-0 truncate"
      title={points.map((p) => `${p.addr} / ${p.coil} / ${p.label}`).join('  ·  ')}
    >
      {xy}<span className="text-slate-500">·{coils}</span>
    </span>
  );
}

function PointLed({ on }: { on: boolean }) {
  return <span className={`io-led !w-[6px] !h-[6px] ${on ? 'io-led-on' : 'io-led-off'}`} />;
}

const rowCls = 'flex items-center gap-1 py-[1px]';
const nameCls = 'w-[40px] shrink-0 text-[0.58rem] text-gray-300 truncate';
const btnCls = 'btn btn-xs flex-1 !py-0.5 !px-1 !text-[0.58rem] touch-manipulation';
const divider = 'border-t border-slate-700/50 my-1.5';

export function DispenseControlPanel() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const motorFwd = useDispensingStore((s) => s.motorFwd);
  const motorRev = useDispensingStore((s) => s.motorRev);
  const sendCyl = useDispensingStore((s) => s.sendCyl);
  const magStock = useDispensingStore((s) => s.magStock);
  const refillAll = useDispensingStore((s) => s.refillAll);
  const tiltCyl = useDispensingStore((s) => s.tiltCyl);
  const lamp = useDispensingStore((s) => s.lamp);
  const sensors = useDispensingStore((s) => s.sensors);
  const setMotor = useDispensingStore((s) => s.setMotor);
  const setSendCyl = useDispensingStore((s) => s.setSendCyl);
  const setTiltCyl = useDispensingStore((s) => s.setTiltCyl);
  const setLamp = useDispensingStore((s) => s.setLamp);
  const encoderPulses = useDispensingStore((s) => s.encoderPulses);
  const encoderDir = useDispensingStore((s) => s.encoderDir);

  const outSnap: OutputSnapshot = { motorFwd, motorRev, sendCyl, tiltCyl, lamp };
  const sliderPct = ((sliderX - SLIDER_MIN_X) / (SLIDER_MAX_X - SLIDER_MIN_X)) * 100;
  const motorPoints = [OUTPUT_BY_KEY.MOTOR_FWD, OUTPUT_BY_KEY.MOTOR_REV];
  const tiltPoint = OUTPUT_BY_KEY.CYL_TILT;
  const emptyMag = MAG_ORDER.find((m) => magStock[m] <= 0);

  return (
    <div className="space-y-1.5">
      <div className="device-card !p-2">
        {/* 操作台说明 + 位置反馈 */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-white">单点 I/O 操作台</span>
          <span className="badge badge-blue">
            {MANUAL_IO_SUMMARY.outputs} 出 / {MANUAL_IO_SUMMARY.inputs} 入
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="badge badge-blue">X {sliderX.toFixed(3)} m</span>
          <span className="badge badge-blue">
            HR{MODBUS_HOLDING_REGISTERS.ENCODER_PULSES} {encoderPulses}
          </span>
          <span className="badge badge-slate">
            {encoderDir > 0 ? '↑ +' : encoderDir < 0 ? '↓ −' : '静止'}
          </span>
          <span className={`badge ${sensors.limitStart ? 'badge-green' : 'badge-slate'}`}>原点</span>
          <span className={`badge ${sensors.limitEnd ? 'badge-green' : 'badge-slate'}`}>终点</span>
        </div>
        <div className="progress-bar mt-1">
          <div className="progress-fill" style={{ width: `${sliderPct}%` }} />
        </div>
        <div className="mt-0.5 text-[0.55rem] leading-tight text-slate-400">
          按键 ≡ 直接置位/复位 PLC 输出；前进/后退按住点动，其余点一次保持。
        </div>

        <div className={divider} />

        {/* 输出点：逐点控制执行器与三色灯 */}
        <div className="flex items-center justify-between mb-1">
          <span className="section-title !mb-0">输出点 Y · 单点控制</span>
          <span className="badge badge-slate">{MANUAL_OUTPUT_POINTS.length} 点可写</span>
        </div>

        {/* 滑台电机：点动，两个输出点互锁 */}
        <div className={rowCls}>
          <span className={nameCls}>滑台</span>
          <AddrTag points={motorPoints} />
          <button
            className={`${btnCls} ${motorFwd ? 'btn-success' : 'btn-outline'}`}
            onPointerDown={() => setMotor(true, false)}
            onPointerUp={() => setMotor(false, false)}
            onPointerLeave={() => setMotor(false, false)}
            onTouchStart={() => setMotor(true, false)}
            onTouchEnd={() => setMotor(false, false)}
          >
            前进
          </button>
          <button
            className={`${btnCls} ${motorRev ? 'btn-success' : 'btn-outline'}`}
            onPointerDown={() => setMotor(false, true)}
            onPointerUp={() => setMotor(false, false)}
            onPointerLeave={() => setMotor(false, false)}
            onTouchStart={() => setMotor(false, true)}
            onTouchEnd={() => setMotor(false, false)}
          >
            后退
          </button>
          <PointLed on={motorFwd || motorRev} />
        </div>

        {/* 四仓送药气缸：伸出 / 缩回 */}
        {MAG_ORDER.map((mag) => {
          const point = OUTPUT_BY_KEY[`CYL_SEND_${mag}`];
          const cyl = sendCyl[mag];
          return (
            <div className={rowCls} key={mag}>
              <span className={nameCls}>{mag} 缸</span>
              <AddrTag points={[point]} />
              <button
                className={`${btnCls} ${cyl.extended ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSendCyl(mag, true, cyl.position)}
              >
                伸出
              </button>
              <button
                className={`${btnCls} ${!cyl.extended ? 'btn-warning' : 'btn-outline'}`}
                style={{ color: '#fff' }}
                onClick={() => setSendCyl(mag, false, cyl.position)}
              >
                缩回
              </button>
              <PointLed on={outputPointLevel(point.key, outSnap)} />
            </div>
          );
        })}

        {/* 料斗翻转缸 */}
        <div className={rowCls}>
          <span className={nameCls}>翻转</span>
          <AddrTag points={[tiltPoint]} />
          <button
            className={`${btnCls} ${tiltCyl.tilted ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTiltCyl(true, tiltCyl.angle)}
          >
            翻转
          </button>
          <button
            className={`${btnCls} ${!tiltCyl.tilted ? 'btn-warning' : 'btn-outline'}`}
            style={{ color: '#fff' }}
            onClick={() => setTiltCyl(false, tiltCyl.angle)}
          >
            翻回
          </button>
          <PointLed on={outputPointLevel(tiltPoint.key, outSnap)} />
        </div>

        {/* 三色灯塔：三个输出点一行内独立置位/复位 */}
        <div className={`${rowCls} mt-0.5`}>
          <span className={nameCls}>灯塔</span>
          <div className="flex flex-1 gap-1">
            {(['green', 'yellow', 'red'] as const).map((color) => {
              const point = OUTPUT_BY_KEY[`LAMP_${color.toUpperCase()}`];
              const on = outputPointLevel(point.key, outSnap);
              return (
                <button
                  key={color}
                  className={`${btnCls} ${on ? 'btn-success' : 'btn-outline'}`}
                  title={`${point.addr} / ${point.coil}`}
                  onClick={() => setLamp(color, !lamp[color])}
                >
                  <span className="font-mono">{point.addr}</span>
                  <span className="ml-0.5">{color === 'green' ? '绿' : color === 'yellow' ? '黄' : '红'}</span>
                </button>
              );
            })}
          </div>
          <PointLed on={lamp.green || lamp.yellow || lamp.red} />
        </div>

        <div className={divider} />

        {/* 药仓余量 + 人工补药：压成一行 */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1">
            {MAG_ORDER.map((mag) => (
              <span key={mag} className={`badge ${magStock[mag] > 0 ? 'badge-slate' : 'badge-red'}`}>
                {mag} {magStock[mag]}/{MAG_CAPACITY}
              </span>
            ))}
          </div>
          <button className="btn btn-xs btn-outline !py-0.5 !px-1.5 shrink-0" onClick={() => refillAll()}>
            ⊕ 补满
          </button>
        </div>
        {emptyMag && (
          <div className="mt-0.5 text-[0.55rem] leading-tight text-amber-300">
            {emptyMag} 仓已空，伸缸不再出药；点「补满」人工加药。
          </div>
        )}
      </div>

      {/* 输入点：传感器 / 主令 / 编码器位镜像，全部可见 */}
      <DispenseStatusPanel />
    </div>
  );
}
