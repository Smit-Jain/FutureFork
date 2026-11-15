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
  const baseStyles = 'bg-white rounded-xl transition-all duration-200';
  
  const variantStyles = {
    default: 'border border-slate-200/80 shadow-soft hover:shadow-card',
    flat: 'border border-slate-100 bg-slate-50/50',
    outline: 'border border-slate-300 shadow-none',
    interactive: 'border border-slate-200/80 shadow-soft hover:shadow-md hover:border-slate-300 cursor-pointer',
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
