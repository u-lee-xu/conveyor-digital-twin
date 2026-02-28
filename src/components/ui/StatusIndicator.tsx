import React from 'react';

interface StatusIndicatorProps {
  label: string;
  active: boolean;
  pulse?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  label,
  active,
  pulse = false,
}) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-dark-700/50 rounded-lg">
      <span className="text-gray-400 text-sm">{label}</span>
      <span
        className={`
          w-3 h-3 rounded-full transition-all duration-300
          ${active 
            ? 'bg-accent-success shadow-lg shadow-green-500/50' 
            : 'bg-gray-600'
          }
          ${pulse && active ? 'animate-pulse' : ''}
        `}
      />
    </div>
  );
};

export default StatusIndicator;
