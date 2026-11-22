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
    good: 'bg-good/5 text-good border-good/50',
    bad: 'bg-bad/5 text-bad border-bad/50',
    neutral: 'bg-paper-2 text-ink border-ink-faint',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1 border font-mono tabular-nums',
          sizeStyles[size],
          trendStyles[trend],
          className
        )
      )}
    >
      <span className="text-ink-dim text-[10px] uppercase tracking-[0.05em]">
        {label}:
      </span>
      <span className="font-bold">
        {value}
        {unit && <span className="text-[10px] font-normal ml-0.5">{unit}</span>}
      </span>
    </div>
  );
};
