import { useState } from 'react';
import { MITSUBISHI_DISPLAY_VARS } from '../constants';

interface HelpPanelProps {
  onClose: () => void;
}

type TabType = 'guide' | 'addresses';

const INPUT_SIGNALS = [
  { name: '启动按钮', address: MITSUBISHI_DISPLAY_VARS.BUTTON_START, desc: '启动运行' },
  { name: '急停按钮', address: MITSUBISHI_DISPLAY_VARS.BUTTON_ESTOP, desc: '紧急停止' },
  { name: '停止按钮', address: MITSUBISHI_DISPLAY_VARS.BUTTON_STOP, desc: '正常停止' },
  { name: '水平原点', address: MITSUBISHI_DISPLAY_VARS.MAG_FORWARD_REAR, desc: '前后气缸缩回位磁性开关' },
  { name: '水平动点', address: MITSUBISHI_DISPLAY_VARS.MAG_FORWARD_FRONT, desc: '前后气缸伸出位磁性开关' },
  { name: '升降原点', address: MITSUBISHI_DISPLAY_VARS.MAG_LIFT_REAR, desc: '升降气缸缩回位磁性开关' },
  { name: '升降动点', address: MITSUBISHI_DISPLAY_VARS.MAG_LIFT_FRONT, desc: '升降气缸伸出位磁性开关' },
  { name: '夹爪松位', address: MITSUBISHI_DISPLAY_VARS.MAG_CLAMP_OPEN, desc: '夹爪松开位磁性开关' },
  { name: '夹爪紧位', address: MITSUBISHI_DISPLAY_VARS.MAG_CLAMP_CLOSE, desc: '夹爪夹紧位磁性开关' },
];

const OUTPUT_SOLENOIDS = [
  { name: '水平缩回', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_FORWARD_RETRACT, desc: '前后气缸缩回电磁阀' },
  { name: '水平伸出', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_FORWARD_EXTEND, desc: '前后气缸伸出电磁阀' },
  { name: '升降缩回', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_LIFT_RETRACT, desc: '升降气缸缩回电磁阀' },
  { name: '升降伸出', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_LIFT_EXTEND, desc: '升降气缸伸出电磁阀' },
  { name: '夹爪松开', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_CLAMP_OPEN, desc: '夹爪松开电磁阀' },
  { name: '夹爪夹紧', address: MITSUBISHI_DISPLAY_VARS.SOLENOID_CLAMP_CLOSE, desc: '夹爪夹紧电磁阀' },
];

const OUTPUT_INDICATORS = [
  { name: '原点', address: MITSUBISHI_DISPLAY_VARS.INDICATOR_ORIGIN, desc: '原点指示灯' },
  { name: '工作', address: MITSUBISHI_DISPLAY_VARS.INDICATOR_WORKING, desc: '运行指示灯' },
  { name: '加工', address: MITSUBISHI_DISPLAY_VARS.INDICATOR_PROCESSING, desc: '加工指示灯' },
  { name: '报警', address: MITSUBISHI_DISPLAY_VARS.INDICATOR_ALARM, desc: '报警指示灯' },
];

export function HelpPanel({ onClose }: HelpPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('guide');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl border border-slate-600/80 rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-cyan-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">气动机械手 - 帮助</h2>
              <p className="text-cyan-100/80 text-xs mt-0.5">使用说明与IO地址分配</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/15 transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-800/50">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'guide'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            使用说明
          </button>
          <button
            onClick={() => setActiveTab('addresses')}
            className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'addresses'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            IO地址映射表
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">使用步骤</h3>
                <ol className="space-y-2">
                  {[
                    '在「PLC 连接」区域点击连接按钮',
                    '在 GX Simulator 2 中操作 Y 线圈或运行 PLC 程序',
                    '3D 模型会实时响应 PLC 控制信号',
                    '按下面板 启动/停止/急停 按钮可向 PLC 写入信号（自复位）',
                    '模型传感器的到位信号会自动反馈给 PLC 的 X 输入',
                  ].map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-300 leading-relaxed">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">双电控电磁阀说明</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  双电控电磁阀采用<b className="text-slate-100">上升沿触发</b>：脉冲 ON→OFF 后气缸保持当前位置。
                  例如 Y1 得电脉冲后气缸伸出，Y1 断电后仍保持伸出，直到 Y0 得电脉冲才缩回。
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-2">传感器反馈</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  X 输入由数字孪生模型的磁性开关自动写入，<b className="text-slate-100">无需手动操作</b>。
                  气缸到达极限位置时，对应的磁性开关信号自动置 ON。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'addresses' && (
            <div className="space-y-6">
              {/* 输入信号 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📥</span>
                  <h3 className="text-sm font-semibold text-white">输入信号 X（DT→PLC）</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">设备名称</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">三菱 FX</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">功能说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {INPUT_SIGNALS.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2 text-sm font-medium text-white">{item.name}</td>
                          <td className="px-4 py-2 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-xs font-mono font-bold">
                              {item.address}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-400">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 输出信号 - 电磁阀 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📤</span>
                  <h3 className="text-sm font-semibold text-white">输出信号 Y - 电磁阀（PLC→DT）</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">设备名称</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">三菱 FX</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">功能说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {OUTPUT_SOLENOIDS.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2 text-sm font-medium text-white">{item.name}</td>
                          <td className="px-4 py-2 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-mono font-bold">
                              {item.address}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-400">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 输出信号 - 指示灯 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">💡</span>
                  <h3 className="text-sm font-semibold text-white">输出信号 Y - 指示灯（PLC→DT）</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">设备名称</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">三菱 FX</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">功能说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {OUTPUT_INDICATORS.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2 text-sm font-medium text-white">{item.name}</td>
                          <td className="px-4 py-2 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-mono font-bold">
                              {item.address}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-400">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 提示 */}
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <h4 className="text-xs font-semibold text-cyan-400 mb-0.5">使用提示</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      X 输入由数字孪生模型磁性开关自动写入，PLC 程序只需读取；Y 输出由 PLC 程序写入控制。
                      三菱 FX 系列中 X/Y 为八进制编号（X7→X10，Y7→Y10）。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-md text-sm font-medium text-slate-300 bg-slate-700/60 border border-slate-600/50 hover:bg-slate-600/80 hover:text-white transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
