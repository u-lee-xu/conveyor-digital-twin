import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'default' | 'gradient' | 'neon';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  glow?: boolean;
}

const variantStyles = {
  primary: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-lg shadow-blue-500/30',
  success: 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-500/30',
  warning: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/30',
  danger: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white shadow-lg shadow-red-500/30',
  default: 'bg-slate-700/80 hover:bg-slate-600/90 text-slate-100 border border-slate-600/50 backdrop-blur-sm',
  gradient: 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-400 hover:via-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-500/30',
  neon: 'bg-slate-800/90 hover:bg-slate-700/90 text-cyan-400 border border-cyan-500/50 shadow-lg shadow-cyan-500/20',
};

const glowStyles = {
  primary: 'hover:shadow-blue-500/50 hover:shadow-xl',
  success: 'hover:shadow-green-500/50 hover:shadow-xl',
  warning: 'hover:shadow-amber-500/50 hover:shadow-xl',
  danger: 'hover:shadow-red-500/50 hover:shadow-xl',
  default: 'hover:shadow-slate-500/20',
  gradient: 'hover:shadow-purple-500/50 hover:shadow-xl',
  neon: 'hover:shadow-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/20',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled = false,
  className = '',
  glow = false,
}) => {
  const handlePress = () => {
    // 移动端震动反馈
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(50); // 轻微震动50ms
    }
    
    if (onClick) {
      onClick();
    }
  };

  return (
    <button
      onClick={handlePress}
      disabled={disabled}
      className={`
        rounded-xl font-semibold transition-all duration-150
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${glow ? glowStyles[variant] : 'hover:shadow-lg'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer btn-hover-lift btn-active'}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default Button;
