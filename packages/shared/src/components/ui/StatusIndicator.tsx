import React from 'react';

interface StatusIndicatorProps {
  label: string;
  active: boolean;
  pulse?: boolean;
  color?: 'green' | 'orange' | 'blue' | 'purple';
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  label,
  active,
  pulse = false,
  color = 'green',
}) => {
  const colorStyles = {
    green: active ? 'bg-accent-success-500' : 'bg-gray-600',
    orange: active ? 'bg-accent-warning-500' : 'bg-gray-600',
    blue: active ? 'bg-accent-primary-500' : 'bg-gray-600',
    purple: active ? 'bg-neon-purple' : 'bg-gray-600',
  };

  const glowStyles = {
    green: active ? 'neon-glow-green' : '',
    orange: active ? 'glow-orange' : '',
    blue: active ? 'neon-glow-blue' : '',
    purple: active ? 'neon-glow-purple' : '',
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-dark-800/50 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
      <span className="text-white text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {active && pulse && (
          <span className="text-xs text-white animate-pulse">●</span>
        )}
        <span
          className={`
            w-4 h-4 rounded-full transition-all duration-300
            ${colorStyles[color]}
            ${glowStyles[color]}
            ${pulse && active ? 'pulse-indicator' : ''}
          `}
        />
      </div>
    </div>
  );
};

export default StatusIndicator;
