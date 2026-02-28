import React from 'react';
import type { Mode } from '../../types';

interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const modes: { id: Mode; label: string; icon: string }[] = [
  { id: 'manual', label: '手动', icon: '🎮' },
  { id: 'auto', label: '自动', icon: '🤖' },
  { id: 'sync', label: '同步', icon: '🔗' },
  { id: 'sim', label: '仿真', icon: '🧪' },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="grid grid-cols-4 gap-2">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          className={`
            px-3 py-2 rounded-lg text-sm font-medium
            transition-all duration-200 flex flex-col items-center gap-1
            ${currentMode === mode.id
              ? 'bg-accent-primary text-white shadow-lg shadow-blue-500/30'
              : 'bg-dark-700 text-gray-300 hover:bg-dark-600 border border-dark-600'
            }
          `}
        >
          <span className="text-lg">{mode.icon}</span>
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
