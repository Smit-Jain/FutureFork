import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'purple' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className,
  dot = false,
}) => {
  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-[11px] px-2 py-0.5',
    lg: 'text-xs px-2.5 py-1',
  };

  const variantStyles = {
    default: 'bg-paper-2 text-ink border-ink',
    success: 'bg-good/5 text-good border-good',
    warning: 'bg-warn/5 text-warn border-warn',
    danger: 'bg-bad/5 text-bad border-bad',
    purple: 'bg-fork-phased/5 text-fork-phased border-fork-phased',
    info: 'bg-fork-upfront/5 text-fork-upfront border-fork-upfront',
    neutral: 'bg-paper text-ink-dim border-ink-faint',
  };

  const dotColors = {
    default: 'bg-ink',
    success: 'bg-good',
    warning: 'bg-warn',
    danger: 'bg-bad',
    purple: 'bg-fork-phased',
    info: 'bg-fork-upfront',
    neutral: 'bg-ink-dim',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.05em] border',
          sizeStyles[size],
          variantStyles[variant],
          className
        )
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
