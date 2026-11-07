import { useEffect, useRef, type ReactNode } from 'react';
import { useDispensingStore } from '../../../stores/useDispensingStore';
import {
  SLIDER_MIN_X, SLIDER_MAX_X, MAG_CAPACITY, MANUAL_JOG, PULSES_PER_M,
  type MagazineId,
} from '../constants';
import {
  MANUAL_OUTPUT_POINTS, MANUAL_IO_SUMMARY, ENCODER_REGISTER_INFO,
  DINT_ADDRESS_ROWS, outputPointLevel,
  type IoPoint, type OutputSnapshot,
} from '../manualIo';
import { AddressHint } from './AddressHint';
import { DispenseStatusPanel } from './DispenseStatusPanel';

/**
 * 手动模式：PLC 单点 I/O 操作台。
 *
 * 面板按键等价于直接置位 / 复位输出线圈（Y），不跑自动流程；
 * X/Y/C 地址不直接铺在面板上，改为悬停信号名称时由 AddressHint 浮框显示，
 * 完整映射仍以「使用说明」为准；输入点（X）状态由下方 DispenseStatusPanel 回显。
 *
 * 紧凑化改造：旧版是「6 张控制卡片 + 6 张状态卡片」共 12 张卡，
 * 每张 20px padding + 逐行进度条，传感器状态要滚很久才看得到。
 * 现在把「说明 / 输出点 / 药仓」合成一张卡（内部分隔线），输入点单独一张，
 * 逐行进度条换成点位 LED，一屏内可完成单点操作与状态核对。
 *
 * 点动改造：前进/后退原来「按住 = SLIDER_SPEED 连续走」，轻点一次就走几十毫米，
 * 料斗很难对准药仓斜槽。现在单击只发一个 MANUAL_JOG.STEP 离散位移（10mm，
 * 按 1024 脉冲/转 × 20mm 导程折算为 512 个 DINT 脉冲），长按超过 HOLD_MS 才连续点动。
 */
type JogDir = 1 | -1;
interface JogState {
  hold: number;
  repeat: number;
}

const MAG_ORDER: MagazineId[] = ['A', 'B', 'C', 'D'];
const OUTPUT_BY_KEY = Object.fromEntries(
  MANUAL_OUTPUT_POINTS.map((p) => [p.key, p]),
) as Record<string, IoPoint>;

/**
 * 信号名称 = 地址浮框的触发区。地址文本一律由点位表拼出，
 * 面板上不直接显示 X/Y/C；双点行（滑台正/反转）两个点都要进浮框。
 */
function AddrLabel({ title, points, className, children }: {
  title: string;
  points: IoPoint[];
  className?: string;
  children?: ReactNode;
}) {
  const rows = points.map((p) => ({ label: p.label, addr: p.addr, coil: p.coil }));
  return (
    <AddressHint title={title} rows={rows} className={className}>
      {children ?? title}
    </AddressHint>
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
  const setJogActive = useDispensingStore((s) => s.setJogActive);
  const setSendCyl = useDispensingStore((s) => s.setSendCyl);
  const setTiltCyl = useDispensingStore((s) => s.setTiltCyl);
  const setLamp = useDispensingStore((s) => s.setLamp);
  const encoderPulses = useDispensingStore((s) => s.encoderPulses);
  const encoderDir = useDispensingStore((s) => s.encoderDir);
  const jogRef = useRef<JogState | null>(null);

  /** 发一个点动脉冲：位移恒为 MANUAL_JOG.STEP，编码器按 PULSES_PER_M 同步折算 */
  const jogStep = (dir: JogDir) => {
    const s = useDispensingStore.getState();
    s.setSliderX(s.sliderX + dir * MANUAL_JOG.STEP);
  };

  /** 松开 / 移出 / 取消：停发脉冲，复位 Y0/Y1 并释放 rAF 让位标志 */
  const stopJog = () => {
    const j = jogRef.current;
    if (!j) return;
    window.clearTimeout(j.hold);
    window.clearInterval(j.repeat);
    jogRef.current = null;
    setJogActive(false);
    setMotor(false, false);
  };

  /** 按下：先给一个精确步进并置位输出线圈；按住超过 HOLD_MS 才转离散连续点动 */
  const beginJog = (dir: JogDir) => {
    stopJog();
    setJogActive(true);
    setMotor(dir > 0, dir < 0);
    jogStep(dir);
    const j: JogState = { hold: 0, repeat: 0 };
    j.hold = window.setTimeout(() => {
      if (jogRef.current !== j) return;
      j.repeat = window.setInterval(() => jogStep(dir), MANUAL_JOG.REPEAT_MS);
    }, MANUAL_JOG.HOLD_MS);
    jogRef.current = j;
  };

  // 切模式 / 进展台时组件会卸载，必须清定时器并释放电机占用，否则 Y0 会一直挂着
  useEffect(() => () => {
    const j = jogRef.current;
    if (j) {
      window.clearTimeout(j.hold);
      window.clearInterval(j.repeat);
      jogRef.current = null;
    }
    const s = useDispensingStore.getState();
    s.setJogActive(false);
    s.setMotor(false, false);
  }, []);

  const outSnap: OutputSnapshot = { motorFwd, motorRev, sendCyl, tiltCyl, lamp };
  const sliderPct = ((sliderX - SLIDER_MIN_X) / (SLIDER_MAX_X - SLIDER_MIN_X)) * 100;
  const motorPoints = [OUTPUT_BY_KEY.MOTOR_FWD, OUTPUT_BY_KEY.MOTOR_REV];
  const tiltPoint = OUTPUT_BY_KEY.CYL_TILT;
  const lampPoints = ['LAMP_GREEN', 'LAMP_YELLOW', 'LAMP_RED'].map((k) => OUTPUT_BY_KEY[k]);
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
          <AddressHint
            title="位置寄存器"
            rows={DINT_ADDRESS_ROWS}
            note={ENCODER_REGISTER_INFO.address}
            underline={false}
          >
            <span className="badge badge-blue">
              {ENCODER_REGISTER_INFO.type} {encoderPulses}
            </span>
          </AddressHint>
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
          {`按键 ≡ 直接置位/复位 PLC 输出；地址悬停信号名称查看，完整映射见「使用说明」。前进/后退单击 ${(MANUAL_JOG.STEP * 1000).toFixed(0)}mm（${Math.round(MANUAL_JOG.STEP * PULSES_PER_M)} 脉冲），按住连续点动。`}
        </div>

        <div className={divider} />

        {/* 输出点：逐点控制执行器与三色灯 */}
        <div className="flex items-center justify-between mb-1">
          <span className="section-title !mb-0">输出点 · 单点控制</span>
          <span className="badge badge-slate">{MANUAL_OUTPUT_POINTS.length} 点可写</span>
        </div>

        {/* 滑台电机：单击精确步进 + 长按离散连续点动，两个输出点互锁 */}
        <div className={rowCls}>
          <AddrLabel title="滑台" points={motorPoints} className={nameCls} />
          <button
            className={`${btnCls} ${motorFwd ? 'btn-success' : 'btn-outline'}`}
            title={`单击 +${(MANUAL_JOG.STEP * 1000).toFixed(0)}mm，按住连续点动`}
            onPointerDown={() => beginJog(1)}
            onPointerUp={stopJog}
            onPointerLeave={stopJog}
            onPointerCancel={stopJog}
          >
            前进
          </button>
          <button
            className={`${btnCls} ${motorRev ? 'btn-success' : 'btn-outline'}`}
            title={`单击 -${(MANUAL_JOG.STEP * 1000).toFixed(0)}mm，按住连续点动`}
            onPointerDown={() => beginJog(-1)}
            onPointerUp={stopJog}
            onPointerLeave={stopJog}
            onPointerCancel={stopJog}
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
              <AddrLabel title={`${mag} 送药缸`} points={[point]} className={nameCls}>
                {mag} 缸
              </AddrLabel>
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
          <AddrLabel title="翻转缸" points={[tiltPoint]} className={nameCls}>翻转</AddrLabel>
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
          <AddrLabel title="三色灯塔" points={lampPoints} className={nameCls}>灯塔</AddrLabel>
          <div className="flex flex-1 gap-1">
            {(['green', 'yellow', 'red'] as const).map((color) => {
              const point = OUTPUT_BY_KEY[`LAMP_${color.toUpperCase()}`];
              const on = outputPointLevel(point.key, outSnap);
              return (
                <button
                  key={color}
                  className={`${btnCls} ${on ? 'btn-success' : 'btn-outline'}`}
                  onClick={() => setLamp(color, !lamp[color])}
                >
                  {color === 'green' ? '绿灯' : color === 'yellow' ? '黄灯' : '红灯'}
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

      {/* 输入点：传感器 / 主令电平，地址由信号名称悬停浮框提供 */}
      <DispenseStatusPanel />
    </div>
  );
}
