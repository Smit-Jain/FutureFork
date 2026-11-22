import React from 'react';
import { FinancialScenarioResult } from '../../contracts/types';
import { BAD, GOOD, fmtRs } from '../../theme/forks';

export interface DeltaPill {
  text: string;
  color: string;
}


/**
 * Differences between a fork and the baseline, built only from engine-computed metrics
 * (share of safe scenarios, low point in a bad scenario, financing interest, category trims). Only non-zero changes are shown.
 */
export function deltasVsBaseline(r: FinancialScenarioResult, base: FinancialScenarioResult | null, max = 4): DeltaPill[] {
  if (!base || r.branch_type === 'baseline') return [];
  const out: DeltaPill[] = [];

  // Safe scenarios: Monte Carlo runs that never breach the floor, recovered exactly from the engine's share
  const safe = (x: FinancialScenarioResult) => Math.round((x.simulation.n_runs * (100 - x.metrics.floor_breach_risk_pct)) / 100);
  const dy = safe(r) - safe(base);
  const dpct = Math.round((Math.abs(dy) / r.simulation.n_runs) * 100);
  if (dpct !== 0) out.push({ text: dy > 0 ? `${dpct}% safer` : `${dpct}% riskier`, color: dy > 0 ? GOOD : BAD });


  if (r.metrics.total_financing_interest > 0) out.push({ text: `${fmtRs(r.metrics.total_financing_interest)} interest`, color: BAD });

  Object.entries(r.category_trims || {})
    .filter(([, f]) => f > 0.0005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([cat, f]) => out.push({ text: `−${Math.round(f * 100)}% ${cat}`, color: '#141414' }));

  return out.slice(0, max);
}

export const Pills: React.FC<{ pills: DeltaPill[]; size?: 'sm' | 'md' }> = ({ pills, size = 'sm' }) => (
  <span className="flex flex-wrap gap-1.5">
    {pills.map((p) => (
      <span
        key={p.text}
        className={`inline-flex items-center border font-mono tabular-nums tracking-[0.02em] ${size === 'sm' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]'}`}
        style={{ color: p.color, borderColor: p.color }}
      >
        {p.text}
      </span>
    ))}
  </span>
);
