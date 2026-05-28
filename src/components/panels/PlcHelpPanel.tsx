import React, { useState } from 'react';
import { PLC_HELP_CONTENT } from '../../constants/plc-addresses';

interface PlcHelpPanelProps {
  onClose: () => void;
}

type TabType = 'guide' | 'addresses' | 'requirements';

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', badge: 'bg-green-500/20' },
};

export const PlcHelpPanel: React.FC<PlcHelpPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('guide');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl border border-slate-600/80 rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{PLC_HELP_CONTENT.title}</h2>
              <p className="text-blue-100/80 text-xs mt-0.5">{PLC_HELP_CONTENT.description}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/15 transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-700 bg-slate-800/50">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'guide'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            📖 使用说明
          </button>
          <button
            onClick={() => setActiveTab('addresses')}
            className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'addresses'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            📍 地址映射表
          </button>
          <button
            onClick={() => setActiveTab('requirements')}
            className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'requirements'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            ⚙️ 控制要求
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {PLC_HELP_CONTENT.modeGuides.map((guide) => {
                const colors = colorMap[guide.color] || colorMap.blue;
                return (
                  <div
                    key={guide.id}
                    className={`${colors.bg} border ${colors.border} rounded-lg p-4`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{guide.icon}</span>
                      <div>
                        <h3 className={`text-sm font-bold ${colors.text}`}>{guide.name}</h3>
                        <p className="text-xs text-slate-300">{guide.description}</p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 ml-9">
                      {guide.details.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                          <span className={`${colors.text} mt-0.5`}>•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'addresses' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📥</span>
                  <h3 className="text-sm font-semibold text-white">输入信号（只读）</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">设备名称</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">PLC地址</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">功能说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {PLC_HELP_CONTENT.signals.inputs.map((input, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2.5 text-sm font-medium text-white">{input.name}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-mono font-bold">
                              {input.address}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400">{input.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📤</span>
                  <h3 className="text-sm font-semibold text-white">输出信号（读写）</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">设备名称</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">PLC地址</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">功能说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {PLC_HELP_CONTENT.signals.outputs.map((output, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2.5 text-sm font-medium text-white">{output.name}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-xs font-mono font-bold">
                              {output.address}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400">{output.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <h4 className="text-xs font-semibold text-blue-400 mb-0.5">使用提示</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      所有地址均为线圈（Coils）地址，可直接在PLC程序中使用。输入信号（M0~M11）由系统写入，PLC程序只需读取；输出信号（M100~M106）由PLC程序写入控制。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'requirements' && (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">⚙️</span>
                  <h3 className="text-sm font-semibold text-white">传送带分拣系统控制要求</h3>
                </div>
                <ol className="space-y-3">
                  {PLC_HELP_CONTENT.controlRequirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-300 leading-relaxed">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

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
};

export default PlcHelpPanel;
