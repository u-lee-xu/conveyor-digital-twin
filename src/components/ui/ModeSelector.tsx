import React from 'react';
import type { Mode } from '../../types';

interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const modes: { id: Mode; label: string; icon: string; color: string }[] = [
  { id: 'manual', label: '手动', icon: '🎮', color: 'from-blue-500 to-cyan-500' },
  { id: 'auto', label: '自动', icon: '🤖', color: 'from-purple-500 to-pink-500' },
  { id: 'sync', label: '同步', icon: '🔗', color: 'from-green-500 to-emerald-500' },
  { id: 'sim', label: '仿真', icon: '🧪', color: 'from-orange-500 to-yellow-500' },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="grid grid-cols-4 gap-3">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          className={`
            relative px-3 py-3 rounded-xl text-sm font-bold
            transition-all duration-300 flex flex-col items-center gap-1.5
            overflow-hidden
            ${currentMode === mode.id
              ? `bg-gradient-to-br ${mode.color} text-white shadow-lg scale-105`
              : 'bg-dark-800 text-gray-300 hover:bg-dark-700 border border-dark-600 hover:border-gray-500'
            }
            hover:scale-105 hover:shadow-xl
          `}
        >
          {currentMode === mode.id && (
            <div className="absolute inset-0 bg-white/10 animate-pulse" />
          )}
          <span className="text-2xl drop-shadow-lg">{mode.icon}</span>
          <span className="drop-shadow-md">{mode.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
