import React, { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface VerticalFaderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text for the readout pill and aria-valuetext. */
  display: (v: number) => string;
  onChange: (v: number) => void;
  /** Value restored by double-click or the reset icon. */
  resetValue: number;
  /** 0–1 shock severity: drives the fill colour charcoal → amber → crimson. */
  severity: number;
  height?: number;
}

const severityColor = (s: number) => (s < 0.34 ? '#3a3936' : s < 0.67 ? '#c76a12' : '#d6345f');

/**
 * Tall fader for the Crisis Playground. Mouse and touch drag (pointer capture), arrow keys,
 * PageUp/PageDown, Home/End, and double-click to reset.
 */
export const VerticalFader: React.FC<VerticalFaderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  resetValue,
  severity,
  height = 220,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const span = max - min || 1;
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const color = severityColor(severity);

  const clampStep = (v: number) => {
    const snapped = Math.round((v - min) / step) * step + min;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
  };

  const setFromY = (clientY: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const f = 1 - (clientY - r.top) / r.height;
    onChange(clampStep(min + Math.max(0, Math.min(1, f)) * span));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = step * 10;
    const map: Record<string, number> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    if (e.key in map) {
      e.preventDefault();
      onChange(clampStep(map[e.key]));
    }
  };

  const ease = dragging ? '' : 'transition-all duration-500 ease-editorial';
  const ticks = 10;

  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <span
        className="font-mono text-[11px] tabular-nums h-6 px-1.5 inline-flex items-center border whitespace-nowrap transition-colors duration-300"
        style={{ borderColor: color, color }}
        aria-hidden="true"
      >
        {display(value)}
      </span>

      <div
        id={id}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display(value)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFromY(e.clientY);
          e.preventDefault();
        }}
        onPointerMove={(e) => dragging && setFromY(e.clientY)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => onChange(resetValue)}
        className="group relative w-12 cursor-ns-resize touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral focus-visible:outline-offset-4"
        style={{ height }}
        title="Drag, use arrow keys, or double-click to reset"
      >
        {/* tick marks */}
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span
            key={i}
            className="absolute left-0 h-px bg-ink/25"
            style={{ bottom: `${(i / ticks) * 100}%`, width: i % 5 === 0 ? 10 : 6 }}
            aria-hidden="true"
          />
        ))}
        {/* rail */}
        <span className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-ink/15" aria-hidden="true" />
        {/* severity fill */}
        <span
          className={`absolute left-1/2 -translate-x-1/2 bottom-0 w-[6px] ${ease}`}
          style={{ height: `${frac * 100}%`, background: color }}
          aria-hidden="true"
        />
        {/* thumb */}
        <span
          className={`absolute left-1/2 -translate-x-1/2 w-10 h-[18px] bg-paper-2 border border-ink flex flex-col items-center justify-center gap-[2px] shadow-paper
                      group-active:shadow-lift ${ease}`}
          style={{ bottom: `calc(${frac * 100}% - 9px)` }}
          aria-hidden="true"
        >
          <i className="block w-5 h-px bg-ink/60" />
          <i className="block w-5 h-px bg-ink/60" />
        </span>
      </div>

      <div className="flex items-center gap-1 max-w-full">
        <span className="label text-[9.5px] text-ink text-center leading-tight">{label}</span>
        <button
          type="button"
          onClick={() => onChange(resetValue)}
          disabled={value === resetValue}
          className="text-ink-dim hover:text-ink disabled:opacity-0 transition-opacity"
          aria-label={`Reset ${label}`}
          title={`Reset ${label}`}
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
