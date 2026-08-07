import React, { useState } from 'react';

/**
 * ================================================
 * 共享 PLC 帮助面板
 * 平台统一 UI，内容由场景注入（与 PlcConnectionPanel 同模式）
 * ================================================
 */

export interface HelpStep {
  text: string;
  detail?: string;
}

export interface GuideCard {
  icon: string;
  name: string;
  color: string;
  description: string;
  details: string[];
}

export interface AddressRow {
  name: string;
  addressCells: string[];
  description: string;
}

export interface AddressSection {
  title: string;
  icon?: string;
  rows: AddressRow[];
  hint?: string;
}

export interface AddressTable {
  columns: string[];
  sections: AddressSection[];
}

export interface ProtocolGuideSection {
  title: string;
  steps: HelpStep[];
}

export interface ProtocolGuide {
  id: string;
  label: string;
  icon: string;
  color: string;
  title: string;
  description: string;
  configSections: ProtocolGuideSection[];
  addressTable: AddressTable;
}

export interface HelpContent {
  title: string;
  description: string;
  /** 📖 使用步骤（有序列表） */
  steps?: HelpStep[];
  /** 📖 模式指南卡片 */
  guides?: GuideCard[];
  /** 📖 附加说明卡片（协议支持 / 器件类型 / 反馈说明等） */
  notes?: GuideCard[];
  /** 📍 地址映射表（多协议列） */
  addresses?: AddressTable;
  /** ⚙️ 控制要求 */
  requirements?: string[];
  /** 🔧 协议配置指南（每个协议一段） */
  protocolGuides?: ProtocolGuide[];
}

const PROTOCOL_COLORS: Record<string, string> = {
  modbus: 'bg-blue-500/20 text-blue-400',
  s7: 'bg-purple-500/20 text-purple-400',
  mitsubishi: 'bg-cyan-500/20 text-cyan-400',
  address: 'bg-slate-500/20 text-slate-300',
};

const CARD_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', badge: 'bg-green-500/20' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-500/20' },
};

interface HelpPanelProps {
  content: HelpContent;
  onClose: () => void;
}

/** 共享帮助面板：统一 modal 壳 + 动态 tabs，内容由场景注入 */
export const HelpPanel: React.FC<HelpPanelProps> = ({ content, onClose }) => {
  const [activeTab, setActiveTab] = useState('guide');
  const [activeProtocol, setActiveProtocol] = useState(content.protocolGuides?.[0]?.id ?? '');

  const tabs: { id: string; label: string }[] = [
    { id: 'guide', label: '📖 使用说明' },
    ...(content.addresses ? [{ id: 'addresses', label: '📍 地址映射' }] : []),
    ...(content.requirements ? [{ id: 'requirements', label: '⚙️ 控制要求' }] : []),
    ...(content.protocolGuides && content.protocolGuides.length > 0 ? [{ id: 'protocols', label: '🔧 协议指南' }] : []),
  ];

  const guide = content.protocolGuides?.find((g) => g.id === activeProtocol) ?? content.protocolGuides?.[0];
  const addressCellClass = (cell: string): string => {
    if (cell.startsWith('X') || cell.startsWith('Y') || cell.startsWith('M')) return PROTOCOL_COLORS.mitsubishi;
    if (cell.startsWith('Coil') || /^\d+$/.test(cell)) return PROTOCOL_COLORS.modbus;
    if (cell.includes('.')) return PROTOCOL_COLORS.s7;
    return PROTOCOL_COLORS.address;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl border border-slate-600/80 rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-700 to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{content.title}</h2>
              <p className="text-slate-300/80 text-xs mt-0.5">{content.description}</p>
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {content.steps && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-cyan-400 mb-2">使用步骤</h3>
                  <ol className="space-y-2">
                    {content.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-slate-300 leading-relaxed">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {content.guides?.map((guide) => {
                const colors = CARD_COLORS[guide.color] || CARD_COLORS.blue;
                return (
                  <div
                    key={guide.name}
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

              {content.notes?.map((note) => {
                const colors = CARD_COLORS[note.color] || CARD_COLORS.blue;
                return (
                  <div key={note.name} className={`${colors.bg} border ${colors.border} rounded-lg p-4`}>
                    <h3 className={`text-sm font-semibold ${colors.text} mb-2`}>{note.name}</h3>
                    <ul className="space-y-1.5">
                      {note.details.map((detail, idx) => (
                        <li key={idx} className="text-sm text-slate-300 leading-relaxed">{detail}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'addresses' && content.addresses && (
            <div className="space-y-6">
              {content.addresses.sections.map((section) => (
                <div key={section.title}>
                  <div className="flex items-center gap-2 mb-3">
                    {section.icon && <span className="text-base">{section.icon}</span>}
                    <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                    <table className="w-full">
                      <thead className="bg-slate-700/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300">设备名称</th>
                          {content.addresses!.columns.map((col) => (
                            <th key={col} className="px-2 py-2 text-center text-xs font-semibold text-slate-300">{col}</th>
                          ))}
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300">功能说明</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {section.rows.map((row, index) => (
                          <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                            <td className="px-3 py-2 text-sm font-medium text-white">{row.name}</td>
                            {row.addressCells.map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-2 py-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${addressCellClass(cell)}`}>
                                  {cell}
                                </span>
                              </td>
                            ))}
                            <td className="px-3 py-2 text-sm text-slate-400">{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {section.hint && (
                    <div className="mt-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-lg">💡</span>
                        <p className="text-xs text-slate-300 leading-relaxed">{section.hint}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'requirements' && content.requirements && (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">⚙️</span>
                  <h3 className="text-sm font-semibold text-white">控制要求</h3>
                </div>
                <ol className="space-y-3">
                  {content.requirements.map((req, idx) => (
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

          {activeTab === 'protocols' && guide && (
            <div className="space-y-4">
              {content.protocolGuides && content.protocolGuides.length > 1 && (
                <div className="flex gap-2">
                  {content.protocolGuides.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setActiveProtocol(g.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        activeProtocol === g.id
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-400'
                          : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
              )}

              {(() => {
                const colors = CARD_COLORS[guide.color] || CARD_COLORS.blue;
                return (
                  <div className={`${colors.bg} border ${colors.border} rounded-lg p-4`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">💡</span>
                      <div>
                        <h4 className={`text-sm font-semibold ${colors.text} mb-1`}>{guide.title}</h4>
                        <p className="text-xs text-slate-300 leading-relaxed">{guide.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {guide.configSections.map((section, sectionIdx) => (
                <div key={sectionIdx} className="bg-slate-900/50 rounded-lg border border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{sectionIdx === 0 ? '🖥️' : sectionIdx === 1 ? '🔗' : '🎮'}</span>
                    <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                  </div>
                  <ol className="space-y-3">
                    {section.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-xs leading-relaxed">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-500/20 text-slate-300 flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-slate-200">{step.text}</span>
                          {step.detail && <p className="text-slate-500 mt-0.5">{step.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📍</span>
                  <h3 className="text-sm font-semibold text-white">地址映射表</h3>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300">设备名称</th>
                        {guide.addressTable.columns.map((col) => (
                          <th key={col} className="px-2 py-2 text-center text-xs font-semibold text-slate-300">{col}</th>
                        ))}
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300">说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {guide.addressTable.sections.flatMap((section) => section.rows).map((row, index) => (
                        <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-3 py-2 text-xs font-medium text-white">{row.name}</td>
                          {row.addressCells.map((cell, cellIdx) => (
                            <td key={cellIdx} className="px-2 py-2 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${addressCellClass(cell)}`}>
                                {cell}
                              </span>
                            </td>
                          ))}
                          <td className="px-3 py-2 text-xs text-slate-400">{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

export default HelpPanel;
