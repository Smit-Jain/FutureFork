import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'flat' | 'outline' | 'interactive';
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className,
  ...props
}) => {
  const baseStyles = 'bg-paper-2 transition-all duration-200';
  
  const variantStyles = {
    default: 'border border-ink-line shadow-paper',
    flat: 'border border-ink-line',
    outline: 'border border-ink',
    interactive: 'border border-ink-line shadow-paper hover:shadow-lift hover:border-ink cursor-pointer',
  };

  return (
    <div
      className={twMerge(clsx(baseStyles, variantStyles[variant], className))}
      {...props}
    >
      {children}
    </div>
  );
};
