import React from 'react';
import { FinancialScenarioResult } from '../../contracts/types';
import { BAD, GOOD, fmtRs } from '../../theme/forks';

export interface DeltaPill {
  text: string;
  color: string;
}

const signed = (v: number, fmt: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v))}`;

/**
 * Differences between a fork and the baseline, built only from engine-computed metrics
 * (survival, P10 low, financing interest, category trims). No new numbers are estimated.
 */
export function deltasVsBaseline(r: FinancialScenarioResult, base: FinancialScenarioResult | null, max = 4): DeltaPill[] {
  if (!base || r.branch_type === 'baseline') return [];
  const out: DeltaPill[] = [];

  const ds = Math.round((r.metrics.survival_score_pct - base.metrics.survival_score_pct) * 10) / 10;
  if (ds !== 0) out.push({ text: `${signed(ds, (x) => `${x}`)} pts survival`, color: ds > 0 ? GOOD : BAD });

  const dp = r.metrics.p10_worst_balance - base.metrics.p10_worst_balance;
  if (Math.abs(dp) >= 1) out.push({ text: `${signed(dp, fmtRs)} P10 low`, color: dp > 0 ? GOOD : BAD });

  if (r.metrics.total_financing_interest > 0) out.push({ text: `${fmtRs(r.metrics.total_financing_interest)} interest`, color: BAD });

  Object.entries(r.category_trims || {})
    .filter(([, f]) => f > 0.0005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([cat, f]) => out.push({ text: `−${Math.round(f * 100)}% ${cat}`, color: '#141414' }));

  if (out.length === 0) out.push({ text: 'Same risk as baseline', color: 'rgba(20,20,20,.5)' });
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
