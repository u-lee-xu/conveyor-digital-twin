import { useDispensingStore } from '../../../stores/useDispensingStore';
import { SLIDER_MIN_X, SLIDER_MAX_X, PULSES_PER_M, MAGAZINE_LABELS, type MagazineId } from '../constants';

/**
 * 手动模式控制面板：电机/气缸/翻转缸/灯塔 直接驱动执行器（不经 PLC）
 * 观察动作 + 传感器响应（教学用）
 *
 * 样式与其余场景（分拣传送带/气动夹爪/交通灯）统一：
 * device-card 分组 + status-badge 状态 + 按钮（单/双按钮）+ 按钮下方可变进度条
 */
export function DispenseControlPanel() {
  const sliderX = useDispensingStore((s) => s.sliderX);
  const motorFwd = useDispensingStore((s) => s.motorFwd);
  const motorRev = useDispensingStore((s) => s.motorRev);
  const sendCyl = useDispensingStore((s) => s.sendCyl);
  const tiltCyl = useDispensingStore((s) => s.tiltCyl);
  const lamp = useDispensingStore((s) => s.lamp);
  const sensors = useDispensingStore((s) => s.sensors);
  const setMotor = useDispensingStore((s) => s.setMotor);
  const setSendCyl = useDispensingStore((s) => s.setSendCyl);
  const setTiltCyl = useDispensingStore((s) => s.setTiltCyl);
  const setLamp = useDispensingStore((s) => s.setLamp);

  const mags: MagazineId[] = ['A', 'B', 'C'];
  const encoder = Math.round((sliderX - SLIDER_MIN_X) * PULSES_PER_M); // 编码器脉冲示意
  const sliderPct = ((sliderX - SLIDER_MIN_X) / (SLIDER_MAX_X - SLIDER_MIN_X)) * 100;
  const tiltPct = Math.min(100, Math.max(0, tiltCyl.angle * 100));

  return (
    <div className="space-y-3">
      {/* 滑台位置 / 电机控制 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">滑台电机</span>
          <span className={`status-badge ${motorFwd || motorRev ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {motorFwd ? '正转中' : motorRev ? '反转中' : '已停止'}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="badge badge-blue">X: {sliderX.toFixed(3)} m</span>
          <span className="badge badge-blue">编码器: {encoder}</span>
        </div>
        <div className="flex gap-3 mb-2">
          <button
            className={`btn btn-sm flex-1 btn-hover-lift touch-manipulation ${motorFwd ? 'btn-success' : 'btn-outline'}`}
            onPointerDown={() => setMotor(true, false)}
            onPointerUp={() => setMotor(false, false)}
            onPointerLeave={() => setMotor(false, false)}
            onTouchStart={() => setMotor(true, false)}
            onTouchEnd={() => setMotor(false, false)}
          >
            ▶ 正转
          </button>
          <button
            className={`btn btn-sm flex-1 btn-hover-lift touch-manipulation ${motorRev ? 'btn-success' : 'btn-outline'}`}
            onPointerDown={() => setMotor(false, true)}
            onPointerUp={() => setMotor(false, false)}
            onPointerLeave={() => setMotor(false, false)}
            onTouchStart={() => setMotor(false, true)}
            onTouchEnd={() => setMotor(false, false)}
          >
            ◀ 反转
          </button>
        </div>
        <div className="mb-2">
          <div className="progress-bar flex-1">
            <div className="progress-fill" style={{ width: `${sliderPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`badge ${sensors.limitStart ? 'badge-green' : 'badge-slate'}`}>起点限位</span>
          <span className={`badge ${sensors.limitEnd ? 'badge-green' : 'badge-slate'}`}>终点限位</span>
        </div>
      </div>

      {/* 送药气缸 A/B/C */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">送药气缸</span>
        </div>
        <div className="space-y-4">
          {mags.map((mag) => {
            const cyl = sendCyl[mag];
            const pct = Math.min(100, Math.max(0, cyl.position * 100));
            return (
              <div key={mag}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">送药 {MAGAZINE_LABELS[mag]}</span>
                  <span className={`status-badge ${cyl.extended ? 'status-badge-active' : 'status-badge-inactive'}`}>
                    {cyl.extended ? '伸出' : '缩回'}
                  </span>
                </div>
                <div className="flex gap-3 mb-2">
                  <button
                    className={`btn btn-xs flex-1 btn-hover-lift touch-manipulation ${cyl.extended ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setSendCyl(mag, true, cyl.position)}
                  >
                    ↗ 伸出
                  </button>
                  <button
                    className={`btn btn-xs flex-1 btn-hover-lift touch-manipulation ${!cyl.extended ? 'btn-warning' : 'btn-outline'}`}
                    style={{ color: '#fff' }}
                    onClick={() => setSendCyl(mag, false, cyl.position)}
                  >
                    ↙ 缩回
                  </button>
                </div>
                <div className="mb-2">
                  <div className="progress-bar flex-1">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="io-led mr-1" />
                  <span className={`badge ${sensors.mscBack[mag] ? 'badge-green' : 'badge-slate'}`}>后限位</span>
                  <span className={`badge ${sensors.mscFront[mag] ? 'badge-green' : 'badge-slate'}`}>前限位</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 取药料斗翻转 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">取药料斗翻转</span>
          <span className={`status-badge ${tiltCyl.tilted ? 'status-badge-active' : 'status-badge-inactive'}`}>
            {tiltCyl.tilted ? '翻转到位' : '盛药位'}
          </span>
        </div>
        <div className="flex gap-3 mb-2">
          <button
            className={`btn btn-sm flex-1 btn-hover-lift touch-manipulation ${tiltCyl.tilted ? 'btn-success' : 'btn-outline'}`}
            onClick={() => setTiltCyl(true, tiltCyl.angle)}
          >
            ↻ 翻转
          </button>
          <button
            className={`btn btn-sm flex-1 btn-hover-lift touch-manipulation ${!tiltCyl.tilted ? 'btn-warning' : 'btn-outline'}`}
            style={{ color: '#fff' }}
            onClick={() => setTiltCyl(false, tiltCyl.angle)}
          >
            ↺ 复位
          </button>
        </div>
        <div className="mb-2">
          <div className="progress-bar flex-1">
            <div className="progress-fill" style={{ width: `${tiltPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`badge ${sensors.mscTiltHold ? 'badge-green' : 'badge-slate'}`}>盛药位</span>
          <span className={`badge ${sensors.mscTiltDump ? 'badge-green' : 'badge-slate'}`}>翻转位</span>
        </div>
      </div>

      {/* 三色灯塔 */}
      <div className="device-card">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">三色灯塔</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${lamp.red ? 'bg-red-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">红灯</span>
            </div>
            <button
              className={`btn btn-sm ${lamp.red ? 'btn-danger' : 'btn-outline'} touch-manipulation`}
              onClick={() => setLamp('red', !lamp.red)}
            >
              {lamp.red ? '熄灭' : '点亮'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${lamp.yellow ? 'bg-yellow-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">黄灯</span>
            </div>
            <button
              className={`btn btn-sm ${lamp.yellow ? 'btn-warning' : 'btn-outline'} touch-manipulation`}
              onClick={() => setLamp('yellow', !lamp.yellow)}
            >
              {lamp.yellow ? '熄灭' : '点亮'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${lamp.green ? 'bg-green-500' : 'bg-gray-600'}`}></span>
              <span className="text-xs font-medium text-gray-300">绿灯</span>
            </div>
            <button
              className={`btn btn-sm ${lamp.green ? 'btn-success' : 'btn-outline'} touch-manipulation`}
              onClick={() => setLamp('green', !lamp.green)}
            >
              {lamp.green ? '熄灭' : '点亮'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}