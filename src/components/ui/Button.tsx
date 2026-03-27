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
  primary: 'bg-gradient-to-r from-accent-primary-500 to-accent-primary-600 hover:from-accent-primary-600 hover:to-accent-primary-500 text-white',
  success: 'bg-gradient-to-r from-accent-success-500 to-accent-success-600 hover:from-accent-success-600 hover:to-accent-success-500 text-white',
  warning: 'bg-gradient-to-r from-accent-warning-500 to-accent-warning-600 hover:from-accent-warning-600 hover:to-accent-warning-500 text-white',
  danger: 'bg-gradient-to-r from-accent-danger-500 to-accent-danger-600 hover:from-accent-danger-600 hover:to-accent-danger-500 text-white',
  default: 'bg-dark-700 hover:bg-dark-600 text-gray-200 border border-dark-600',
  gradient: 'bg-gradient-to-r from-accent-primary-500 via-neon-purple to-neon-pink hover:from-accent-primary-400 hover:via-neon-purple hover:to-neon-pink text-white',
  neon: 'bg-dark-800 hover:bg-dark-700 text-neon-blue border border-neon-blue',
};

const glowStyles = {
  primary: 'hover:shadow-neon-blue',
  success: 'hover:shadow-glow-green',
  warning: 'hover:shadow-glow-orange',
  danger: 'hover:shadow-neon-pink',
  default: '',
  gradient: 'hover:shadow-neon-purple',
  neon: 'hover:shadow-neon-blue',
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-xl font-semibold transition-all duration-300
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${glow ? glowStyles[variant] : 'hover:shadow-lg'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer btn-hover-lift'}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default Button;
