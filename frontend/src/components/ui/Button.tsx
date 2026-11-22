import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-mono uppercase tracking-[0.06em] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none';

  const sizeStyles = {
    sm: 'text-[10px] px-3 gap-1.5 h-8',
    md: 'text-[11px] px-4 gap-2 h-10',
    lg: 'text-xs px-6 gap-2.5 h-12',
  };

  const variantStyles = {
    primary: 'bg-ink text-paper hover:bg-ink-2',
    secondary: 'bg-paper-2 text-ink border border-ink-faint hover:border-ink',
    outline: 'bg-transparent text-ink border border-ink hover:bg-ink hover:text-paper',
    ghost: 'bg-transparent text-ink-dim hover:text-ink',
    danger: 'bg-bad text-paper hover:opacity-90',
    success: 'bg-good text-paper hover:opacity-90',
    purple: 'bg-fork-phased text-paper hover:opacity-90',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], className))}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 'sm' : 'md'} className="text-current" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};
