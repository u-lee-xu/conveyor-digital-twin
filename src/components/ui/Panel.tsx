import { type ReactNode, useState } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className={`
        bg-dark-800/80 backdrop-blur-glass rounded-xl
        border border-dark-600/50 shadow-lg
        ${className}
      `}
    >
      {title && (
        <div
          className={`
            px-4 py-3 border-b border-dark-600/50
            ${collapsible ? 'cursor-pointer hover:bg-dark-700/50' : ''}
          `}
          onClick={() => collapsible && setCollapsed(!collapsed)}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
            {collapsible && (
              <span className="text-gray-400 text-xs">
                {collapsed ? '▼' : '▲'}
              </span>
            )}
          </div>
        </div>
      )}
      {(!collapsible || !collapsed) && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default Panel;
