import React from 'react';
import { Lock, TrendingDown } from 'lucide-react';
import { TaxSavings } from '../../contracts/types';
import { inr } from '../../tax/fields';

/** What-if forks: the same profile with one change, recomputed by the engine. */
export const SavingMoves: React.FC<{ savings: TaxSavings }> = ({ savings }) => {
  const useful = savings.moves.filter((m) => m.benefit);
  const rest = savings.moves.filter((m) => !m.benefit);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2 max-w-2xl">
        The year you're filing for is already over, so these are for <strong>FY {savings.fy}</strong>, assuming the same
        income. Today you'd pay {inr(savings.baseline_tax)} ({savings.baseline_regime} regime).
      </p>
      {useful.length === 0 && (
        <p className="border border-dashed border-ink-faint p-5 text-sm">
          None of the usual moves lower your tax: you're already in the cheapest setup for your income.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {useful.map((m, i) => (
          <div key={m.key} className={`border p-4 space-y-3 ${i === 0 ? 'border-ink bg-paper-2' : 'border-ink-line bg-paper-2/60'}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[17px] leading-snug">{m.title}</h3>
              <span className="shrink-0 flex items-center gap-1 font-mono text-good">
                <TrendingDown className="w-3.5 h-3.5" /> {inr(m.saving)}
              </span>
            </div>
            <p className="text-[13px] text-ink-dim leading-relaxed">{m.detail}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 label text-[10px]">
              <span>Tax {inr(m.tax_before)} → {inr(m.tax_after)}</span>
              {m.extra_outlay > 0 && <span>You put in {inr(m.extra_outlay)}</span>}
              <span>{m.regime_after} regime</span>
              {m.locks_money && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Money locked in
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <p className="label text-[10px]">
          No benefit for you: {rest.map((m) => m.title.toLowerCase()).join(' · ')}
        </p>
      )}
    </div>
  );
};
