import { BranchType } from '../contracts/types';

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
