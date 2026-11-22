import React from 'react';
import { formatAmount } from './parseDecision';

export type StressMode = 'baseline' | 'conservative' | 'crisis';

/** Crisis Playground presets the run starts with (all re-tested by the engine via /stress). */
export const STRESS_PRESETS: Record<StressMode, { label: string; hint: string; inflowDelay: number; spendPct: number; incomePct: number }> = {
  baseline: { label: 'Baseline', hint: 'No extra shocks', inflowDelay: 0, spendPct: 0, incomePct: 0 },
  conservative: { label: 'Conservative', hint: 'Income 10 days late, spending +5%', inflowDelay: 10, spendPct: 5, incomePct: 0 },
  crisis: { label: 'Crisis −15%', hint: 'Income 15% lower every month', inflowDelay: 0, spendPct: 0, incomePct: -15 },
};


interface Segment<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Segment<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="label text-[10px] block">{label}</span>
      <div className="inline-flex border border-ink" role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors duration-200
                        ${i > 0 ? 'border-l border-ink' : ''}
                        ${value === o.value ? 'bg-ink text-paper' : o.disabled ? 'text-ink/25 cursor-not-allowed' : 'hover:bg-paper'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SimControlsProps {
  stressMode: StressMode;
  onStressMode: (m: StressMode) => void;
  floor: number;
  floorMax: number;
  onFloor: (v: number) => void;
}

/** Compact strip above the run button: horizon, stress preset and a reserve-floor scrubber. */
export const SimControls: React.FC<SimControlsProps> = ({ stressMode, onStressMode, floor, floorMax, onFloor }) => {
  const step = Math.max(1000, floorMax / 50);
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 pt-3">
      <Segmented
        label={`If things go wrong · ${STRESS_PRESETS[stressMode].hint}`}
        value={stressMode}
        onChange={onStressMode}
        options={(Object.keys(STRESS_PRESETS) as StressMode[]).map((m) => ({ value: m, label: STRESS_PRESETS[m].label, title: STRESS_PRESETS[m].hint }))}
      />
      <label className="flex-1 min-w-[200px] space-y-1.5 block">
        <span className="flex justify-between label text-[10px]">
          <span>Always keep at least</span>
          <span className="text-ink font-mono tabular-nums">{formatAmount(floor)}</span>
        </span>
        <input
          type="range"
          className="range"
          min={0}
          max={floorMax}
          step={step}
          value={Math.min(floor, floorMax)}
          onChange={(e) => onFloor(Math.round(Number(e.target.value) / step) * step)}
          aria-label="Reserve floor"
        />
        <span className="flex justify-between label text-[9.5px]">
          <span>₹0</span>
          <span>{formatAmount(floorMax)}</span>
        </span>
      </label>
    </div>
  );
};
