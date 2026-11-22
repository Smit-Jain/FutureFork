import { BranchType, FinancialScenarioResult } from '../contracts/types';

/** Fork accents tuned for contrast on warm paper (mirrors `fork.*` in tailwind.config.js). */
export const FORK_COLORS: Record<BranchType, string> = {
  baseline: '#2f7d4f',
  upfront: '#0f6b8f',
  emi: '#c76a12',
  phased: '#6d4bd1',
  trim: '#d6345f',
  absorb: '#0f6b8f',
  delay: '#c76a12',
  phase_in: '#6d4bd1',
};

export const FORK_LABELS: Record<BranchType, string> = {
  baseline: 'Baseline',
  upfront: 'Upfront Buy',
  emi: 'EMI / Instalments',
  phased: 'Phased Purchase',
  trim: 'Trim Spending',
  absorb: 'As Planned',
  delay: 'Delay Start',
  phase_in: 'Phase In',
};

export const FORK_SHORT: Record<BranchType, string> = {
  baseline: 'Baseline',
  upfront: 'Upfront',
  emi: 'EMI',
  phased: 'Phased',
  trim: 'Trim',
  absorb: 'As planned',
  delay: 'Delay',
  phase_in: 'Phase in',
};

export const INK = '#141414';
export const INK_DIM = 'rgba(20,20,20,.5)';
export const LINE = 'rgba(20,20,20,.09)';
export const GOOD = '#2f7d4f';
export const WARN = '#c76a12';
export const BAD = '#d6345f';

/** Survival ≥90 good, ≥70 warning, else bad. */
export const scoreTone = (score: number) => (score >= 90 ? GOOD : score >= 70 ? WARN : BAD);
/** Cash-out risk ≤20 good, ≤50 warning, else bad. */
export const riskTone = (risk: number) => (risk <= 20 ? GOOD : risk <= 50 ? WARN : BAD);

/** Compact Indian formatting for axis labels and chips: ₹1.2Cr, ₹4.5L, ₹12K. */
export const fmtRs = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 10000000) return `${sign}₹${(a / 10000000).toFixed(1)}Cr`;
  if (a >= 100000) return `${sign}₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${sign}₹${(a / 1000).toFixed(0)}K`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
};

/** Shared Recharts styling for the light editorial theme. */
export const chartTheme = {
  grid: { stroke: LINE, strokeDasharray: '0' },
  axisTick: { fontSize: 10, fill: INK_DIM, fontFamily: 'IBM Plex Mono, monospace' },
  axisLine: { stroke: 'rgba(20,20,20,.25)' },
  tooltip: {
    backgroundColor: '#f6f4ef',
    border: `1px solid ${INK}`,
    borderRadius: 0,
    fontSize: 12,
    color: INK,
    fontFamily: 'IBM Plex Mono, monospace',
    boxShadow: '0 12px 30px -16px rgba(20,20,20,.5)',
  },
  legend: { fontSize: 11, paddingTop: 8, color: INK, fontFamily: 'IBM Plex Mono, monospace' },
};

/** Rounds up to a "nice" slider maximum: 1, 2 or 5 × 10^k. */
export const niceCeil = (v: number): number => {
  if (v <= 0) return 100000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

/** Survival → SAFE / TIGHT / HIGH RISK, using the same thresholds as scoreTone. */
export const riskStatus = (score: number) =>
  score >= 90 ? { label: 'Safe', color: GOOD } : score >= 70 ? { label: 'Tight', color: WARN } : { label: 'High risk', color: BAD };

/**
 * The fork to recommend, ranked the way the server's explainer does: fewest months below the floor,
 * then survival, then financing interest, then trims. The do-nothing baseline only wins if it's alone.
 */
export const pickBestFork = (results: FinancialScenarioResult[]): FinancialScenarioResult | null => {
  if (!results.length) return null;
  const forks = results.filter((r) => r.branch_type !== 'baseline');
  const pool = forks.length ? forks : results;
  return [...pool].sort(
    (a, b) =>
      a.metrics.months_below_floor - b.metrics.months_below_floor ||
      b.metrics.survival_score_pct - a.metrics.survival_score_pct ||
      a.metrics.total_financing_interest - b.metrics.total_financing_interest ||
      a.metrics.total_trims_saved - b.metrics.total_trims_saved,
  )[0];
};

/**
 * What-if scenarios of the next 12 months (Monte Carlo runs) in which the balance never dropped below the safety cushion.
 * Recovered exactly from the engine's floor-breach share; nothing is estimated.
 */
/** % of what-if scenarios that never dip below the cushion (one decimal). */
export const staysSafePct = (m: { floor_breach_risk_pct: number }) => Math.round((100 - m.floor_breach_risk_pct) * 10) / 10;
/** Money left above the cushion in the tightest month (negative = below it). */
export const headroom = (m: { lowest_balance: number; emergency_floor: number }) => m.lowest_balance - m.emergency_floor;

export const safeYears = (r: FinancialScenarioResult) => {
  const n = r.simulation.n_runs;
  return { safe: Math.round((n * (100 - r.metrics.floor_breach_risk_pct)) / 100), of: n };
};

/** Plain-language names for the engine's metrics (the technical term stays in the glossary). */
export const PLAIN = {
  safe_years: { label: 'Stays safe', term: 'Monte Carlo runs that never breach the floor', help: 'We replay your next 12 months 300 times with random late salary, surprise bills and price rises. This is the share of those what-if scenarios where you never drop below your safety cushion.' },
  lowest_balance: { label: 'Lowest balance', term: 'Deterministic minimum closing balance', help: 'The least money you would have in the bank in any month if everything goes as expected.' },
  bad_year_low: { label: 'Bad-case low', term: 'P10 worst balance', help: 'Your lowest balance when things go badly: only 1 in 10 what-if scenarios ends up lower.' },
  below_cushion: { label: 'Months below cushion', term: 'months_below_floor', help: 'How many months your balance dips under the safety cushion you set.' },
  headroom: { label: 'Room above cushion', term: 'lowest_balance − emergency_floor', help: 'In your tightest month, how much money is left over your safety cushion. Bigger is safer; negative means you dip below it.' },
  interest: { label: 'Extra interest', term: 'Total financing interest', help: 'What borrowing (EMI) costs you on top of the price.' },
  run_short: { label: 'Chance you run short', term: 'Cash-out risk', help: 'Share of what-if scenarios in which your balance goes below zero.' },
} as const;
