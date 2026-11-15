import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface MetricPillProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'good' | 'bad' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export const MetricPill: React.FC<MetricPillProps> = ({
  label,
  value,
  unit,
  trend = 'neutral',
  size = 'sm',
  className,
}) => {
  const trendStyles = {
    good: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    bad: 'bg-rose-50 text-rose-800 border-rose-200/80',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1 rounded-md border font-medium font-mono tracking-tight',
          sizeStyles[size],
          trendStyles[trend],
          className
        )
      )}
    >
      <span className="text-slate-500 font-sans text-[10px] uppercase font-semibold">
        {label}:
      </span>
      <span className="font-bold">
        {value}
        {unit && <span className="text-[10px] font-normal ml-0.5">{unit}</span>}
      </span>
    </div>
  );
};
