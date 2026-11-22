import React from 'react';
import { Detected, decisionImpact, formatAmount } from './parseDecision';

export interface LiquidityBasis {
  opening: number;
  /** total inflow − total outflow over the 12-month baseline */
  surplus: number;
}

interface PreflightBarProps {
  detected: Detected;
  basis: LiquidityBasis | null;
}

type Status = { label: string; color: string };

/**
 * Pre-flight liquidity check. Plain arithmetic on facts only: the dataset's opening balance and
 * 12-month surplus (compiled by the engine at upload) against the amounts in the prompt.
 * It is not a forecast: month-by-month timing is what the simulation checks.
 */
export const PreflightBar: React.FC<PreflightBarProps> = ({ detected: d, basis }) => {
  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <span className="label text-ink">Pre-flight liquidity</span>
      <span className="label text-[10px]">Before simulation</span>
    </div>
  );

  if (!basis) {
    return (
      <div className="space-y-3">
        {head}
        <p className="text-sm text-ink-dim">Liquidity preview appears once the dataset's baseline has loaded.</p>
      </div>
    );
  }

  const available = Math.max(0, basis.opening + basis.surplus);
  const impact = decisionImpact(d);
  const floor = d.floor?.value ?? 0;
  const remaining = available - impact - floor;

  if (d.kind === 'income') {
    return (
      <div className="space-y-3">
        {head}
        <p className="text-sm text-ink-2">
          An income change doesn't spend from your buffer up front. Run it to see how the drop plays out month by month.
        </p>
        <Basis available={available} basis={basis} />
      </div>
    );
  }

  const total = Math.max(available, impact + floor, 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  const status: Status =
    !d.spend
      ? { label: 'Waiting for an amount', color: 'rgba(20,20,20,.5)' }
      : remaining < 0
        ? { label: floor > 0 ? 'Breaches reserve' : 'Exceeds buffer', color: '#d6345f' }
        : remaining < available * 0.15
          ? { label: 'Tight margin', color: '#c76a12' }
          : { label: 'Clear', color: '#2f7d4f' };

  return (
    <div className="space-y-3">
      {head}

      {/* segmented bar: reserve floor | decision | remaining buffer */}
      <div className="relative h-7 border border-ink flex overflow-hidden bg-paper-2" role="img"
        aria-label={`Reserve floor ${formatAmount(floor)}, decision ${formatAmount(impact)}, remaining ${formatAmount(Math.max(0, remaining))}`}>
        <div
          className="h-full transition-[width] duration-500 ease-editorial"
          style={{
            width: pct(floor),
            background: 'repeating-linear-gradient(135deg, rgba(20,20,20,.75) 0 2px, transparent 2px 6px)',
          }}
        />
        <div className="h-full bg-brand-linear transition-[width] duration-500 ease-editorial" style={{ width: pct(impact) }} />
        <div className="h-full flex-1" />
        {remaining < 0 && (
          <div className="absolute inset-y-0 border-l-2 border-dashed border-bad" style={{ left: pct(available) }} title="Available cash" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
        <div>
          <div className="label text-[9.5px] flex items-center gap-1">
            <i className="inline-block w-2 h-2" style={{ background: 'repeating-linear-gradient(135deg, #141414 0 1px, transparent 1px 3px)' }} /> Floor
          </div>
          <div>{formatAmount(floor)}</div>
        </div>
        <div>
          <div className="label text-[9.5px] flex items-center gap-1">
            <i className="inline-block w-2 h-2 bg-brand-linear" /> Decision{d.cadence === 'monthly' ? ' · 12 mo' : ''}
          </div>
          <div>{formatAmount(impact)}</div>
        </div>
        <div>
          <div className="label text-[9.5px] flex items-center gap-1">
            <i className="inline-block w-2 h-2 border border-ink" /> Remaining
          </div>
          <div style={{ color: remaining < 0 ? '#d6345f' : undefined }}>{remaining < 0 ? '−' : ''}{formatAmount(Math.abs(remaining))}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 border px-2 h-6 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors duration-300"
          style={{ color: status.color, borderColor: status.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
          {status.label}
        </span>
        <Basis available={available} basis={basis} />
      </div>
    </div>
  );
};

const Basis: React.FC<{ available: number; basis: LiquidityBasis }> = ({ available, basis }) => (
  <span
    className="label text-[9.5px] text-right"
    title={`Opening balance ${formatAmount(basis.opening)} + 12-month surplus ${basis.surplus < 0 ? '−' : ''}${formatAmount(Math.abs(basis.surplus))}, from your data. Simple arithmetic, not a forecast.`}
  >
    Available {formatAmount(available)} · opening + 12-mo surplus
  </span>
);
