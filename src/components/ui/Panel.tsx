import { type ReactNode, useState } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  gradient?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
  gradient = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className={`
        glass-enhanced rounded-2xl
        transition-all duration-300
        ${gradient ? 'gradient-border' : ''}
        ${className}
      `}
    >
      {title && (
        <div
          className={`
            px-5 py-4 border-b border-white/10
            ${collapsible ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}
          `}
          onClick={() => collapsible && setCollapsed(!collapsed)}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">
              {gradient && <span className="text-gradient">{title}</span>}
              {!gradient && title}
            </h3>
            {collapsible && (
              <span className={`
                text-gray-400 text-sm transition-transform duration-300
                ${collapsed ? 'rotate-180' : ''}
              `}>
                ▼
              </span>
            )}
          </div>
        </div>
      )}
      {(!collapsible || !collapsed) && (
        <div className="p-5">
          {children}
        </div>
      )}
    </div>
  );
};

export default Panel;
